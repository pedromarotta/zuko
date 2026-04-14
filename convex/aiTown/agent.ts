import { ObjectType, v } from 'convex/values';
import { GameId, parseGameId } from './ids';
import { agentId, conversationId, playerId } from './ids';
import { serializedPlayer } from './player';
import { Game } from './game';
import {
  ACTION_TIMEOUT,
  AWKWARD_CONVERSATION_TIMEOUT,
  CONVERSATION_COOLDOWN,
  CONVERSATION_DISTANCE,
  INVITE_ACCEPT_PROBABILITY,
  INVITE_TIMEOUT,
  MAX_CONVERSATION_DURATION,
  MAX_CONVERSATION_MESSAGES,
  MESSAGE_COOLDOWN,
  MIDPOINT_THRESHOLD,
  PLAYER_CONVERSATION_COOLDOWN,
  TASK_ACTIVITY_DURATION,
  TASK_MAX_MESSAGES,
} from '../constants';
import { FunctionArgs } from 'convex/server';
import { MutationCtx, internalMutation, internalQuery } from '../_generated/server';
import { distance } from '../util/geometry';
import { internal } from '../_generated/api';
import { movePlayer } from './movement';
import { Conversation } from './conversation';
import { insertInput } from './insertInput';

export interface ActiveTask {
  requesterId: string;
  phase: 'working' | 'consulting' | 'reporting' | 'followup' | 'tool';
  consultTarget?: string;
  gatheredInfo: string;
}

export class Agent {
  id: GameId<'agents'>;
  playerId: GameId<'players'>;
  toRemember?: GameId<'conversations'>;
  lastConversation?: number;
  lastInviteAttempt?: number;
  inProgressOperation?: {
    name: string;
    operationId: string;
    started: number;
  };
  activeTask?: ActiveTask;

  constructor(serialized: SerializedAgent) {
    const { id, lastConversation, lastInviteAttempt, inProgressOperation } = serialized;
    const playerId = parseGameId('players', serialized.playerId);
    this.id = parseGameId('agents', id);
    this.playerId = playerId;
    this.toRemember =
      serialized.toRemember !== undefined
        ? parseGameId('conversations', serialized.toRemember)
        : undefined;
    this.lastConversation = lastConversation;
    this.lastInviteAttempt = lastInviteAttempt;
    this.inProgressOperation = inProgressOperation;
    this.activeTask = serialized.activeTask;
  }

  tick(game: Game, now: number) {
    const player = game.world.players.get(this.playerId);
    if (!player) {
      throw new Error(`Invalid player ID ${this.playerId}`);
    }
    if (this.inProgressOperation) {
      if (now < this.inProgressOperation.started + ACTION_TIMEOUT) {
        // Wait on the operation to finish.
        return;
      }
      console.log(`Timing out ${JSON.stringify(this.inProgressOperation)}`);
      delete this.inProgressOperation;
    }
    const conversation = game.world.playerConversation(player);
    const member = conversation?.participants.get(player.id);

    const recentlyAttemptedInvite =
      this.lastInviteAttempt && now < this.lastInviteAttempt + CONVERSATION_COOLDOWN;
    const doingActivity = player.activity && player.activity.until > now;
    if (doingActivity && (conversation || player.pathfinding)) {
      player.activity!.until = now;
    }
    // Check to see if we have a conversation we need to remember.
    if (this.toRemember) {
      // Advance task phases on conversation end.
      if (this.activeTask) {
        if (this.activeTask.phase === 'consulting') {
          console.log(`[task] ${this.id} done consulting → reporting`);
          this.activeTask.phase = 'reporting';
        } else if (this.activeTask.phase === 'reporting') {
          console.log(`[task] ${this.id} report delivered → followup`);
          this.activeTask.phase = 'followup';
        } else if (this.activeTask.phase === 'followup') {
          console.log(`[task] ${this.id} task complete`);
          delete this.activeTask;
        }
      }
      console.log(`Agent ${this.id} remembering conversation ${this.toRemember}`);
      this.startOperation(game, now, 'agentRememberConversation', {
        worldId: game.worldId,
        playerId: this.playerId,
        agentId: this.id,
        conversationId: this.toRemember,
      });
      delete this.toRemember;
      return;
    }

    // === SCRIPTED TASK CHOREOGRAPHY ===
    if (this.activeTask && !conversation) {
      const task = this.activeTask;
      console.log(`[task-tick] Agent ${this.id} has task phase=${task.phase} requester=${task.requesterId}`);
      // Clean up stale tasks (requester left, or invalid phase from old code)
      const requester = game.world.players.get(task.requesterId as GameId<'players'>);
      const validPhases = ['working', 'consulting', 'reporting', 'followup'];
      if (!requester || !validPhases.includes(task.phase)) {
        console.log(`[task] ${this.id} clearing stale task (phase=${task.phase}, requester exists=${!!requester})`);
        delete this.activeTask;
        return;
      }

      if (task.phase === 'working') {
        // Phase 1: Show activity emoji, then find Josh and walk to him.
        const hasActivity = !!player.activity;
        const activityDone = hasActivity && player.activity!.until <= now;
        const activityActive = hasActivity && player.activity!.until > now;

        if (!hasActivity && !player.pathfinding && !task.consultTarget) {
          // Start the "checking data" activity.
          console.log(`[task] ${this.id} phase: working (showing 📊)`);
          player.activity = {
            description: 'checking ERP logs',
            emoji: '📊',
            until: now + TASK_ACTIVITY_DURATION,
          };
          return;
        }
        if (activityActive) {
          return; // Wait for activity to finish.
        }
        if (activityDone && !task.consultTarget) {
          // Activity done. Find nearest non-human agent (Josh).
          player.activity = undefined;
          const freeAgents = [...game.world.agents.values()]
            .filter((a) => a.id !== this.id)
            .filter((a) => {
              const p = game.world.players.get(a.playerId);
              return p && !p.human;
            });
          if (freeAgents.length > 0) {
            const nearest = freeAgents
              .map((a) => ({ a, p: game.world.players.get(a.playerId)! }))
              .sort((a, b) => distance(player.position, a.p.position) - distance(player.position, b.p.position))[0];
            task.consultTarget = nearest.p.id;
            task.phase = 'consulting';
            console.log(`[task] ${this.id} → consulting ${nearest.p.id}`);
          }
          return;
        }
        return;
      }

      if (task.phase === 'consulting' && task.consultTarget) {
        // Phase 2: Walk to Josh and start conversation.
        const target = game.world.players.get(task.consultTarget as GameId<'players'>);
        if (!target) return;
        if (distance(player.position, target.position) < CONVERSATION_DISTANCE) {
          Conversation.start(game, now, player, target);
          this.lastInviteAttempt = now;
        } else if (!player.pathfinding) {
          movePlayer(game, now, player, {
            x: Math.floor(target.position.x),
            y: Math.floor(target.position.y),
          });
        }
        return;
      }

      if (task.phase === 'reporting') {
        // Phase 3: Walk back to requester and start conversation.
        const requester = game.world.players.get(task.requesterId as GameId<'players'>);
        if (!requester) return;
        if (distance(player.position, requester.position) < CONVERSATION_DISTANCE) {
          Conversation.start(game, now, player, requester);
          this.lastInviteAttempt = now;
        } else if (!player.pathfinding) {
          movePlayer(game, now, player, {
            x: Math.floor(requester.position.x),
            y: Math.floor(requester.position.y),
          });
        }
        return;
      }

      // followup phase: just wait — handled in conversation flow
      return;
    }

    // If we're not in a conversation and have no task, do something (wander/activity).
    if (!conversation && !doingActivity && (!player.pathfinding || !recentlyAttemptedInvite)) {
      // Demo mode: no agents initiate conversations — they wait to be approached or tasked.
      this.startOperation(game, now, 'agentDoSomething', {
        worldId: game.worldId,
        player: player.serialize(),
        otherFreePlayers: [],
        agent: this.serialize(),
        map: game.worldMap.serialize(),
      });
      return;
    }
    if (conversation && member) {
      const [otherPlayerId, otherMember] = [...conversation.participants.entries()].find(
        ([id]) => id !== player.id,
      )!;
      const otherPlayer = game.world.players.get(otherPlayerId)!;
      if (member.status.kind === 'invited') {
        // Accept a conversation with another agent with some probability and with
        // a human unconditionally.
        if (otherPlayer.human || Math.random() < INVITE_ACCEPT_PROBABILITY) {
          console.log(`Agent ${player.id} accepting invite from ${otherPlayer.id}`);
          conversation.acceptInvite(game, player);
          // Stop moving so we can start walking towards the other player.
          if (player.pathfinding) {
            delete player.pathfinding;
          }
        } else {
          console.log(`Agent ${player.id} rejecting invite from ${otherPlayer.id}`);
          conversation.rejectInvite(game, now, player);
        }
        return;
      }
      if (member.status.kind === 'walkingOver') {
        // Leave a conversation if we've been waiting for too long.
        if (member.invited + INVITE_TIMEOUT < now) {
          console.log(`Giving up on invite to ${otherPlayer.id}`);
          conversation.leave(game, now, player);
          return;
        }

        // Don't keep moving around if we're near enough.
        const playerDistance = distance(player.position, otherPlayer.position);
        if (playerDistance < CONVERSATION_DISTANCE) {
          return;
        }

        // Keep moving towards the other player.
        // If we're close enough to the player, just walk to them directly.
        if (!player.pathfinding) {
          let destination;
          if (playerDistance < MIDPOINT_THRESHOLD) {
            destination = {
              x: Math.floor(otherPlayer.position.x),
              y: Math.floor(otherPlayer.position.y),
            };
          } else {
            destination = {
              x: Math.floor((player.position.x + otherPlayer.position.x) / 2),
              y: Math.floor((player.position.y + otherPlayer.position.y) / 2),
            };
          }
          console.log(`Agent ${player.id} walking towards ${otherPlayer.id}...`, destination);
          movePlayer(game, now, player, destination);
        }
        return;
      }
      if (member.status.kind === 'participating') {
        const started = member.status.started;
        if (conversation.isTyping && conversation.isTyping.playerId !== player.id) {
          // Wait for the other player to finish typing.
          return;
        }
        if (!conversation.lastMessage) {
          const isInitiator = conversation.creator === player.id;
          const awkwardDeadline = started + AWKWARD_CONVERSATION_TIMEOUT;
          // Send the first message if we're the initiator or if we've been waiting for too long.
          if (isInitiator || awkwardDeadline < now) {
            // Grab the lock on the conversation and send a "start" message.
            console.log(`${player.id} initiating conversation with ${otherPlayer.id}.`);
            const messageUuid = crypto.randomUUID();
            conversation.setIsTyping(now, player, messageUuid);
            this.startOperation(game, now, 'agentGenerateMessage', {
              worldId: game.worldId,
              playerId: player.id,
              agentId: this.id,
              conversationId: conversation.id,
              otherPlayerId: otherPlayer.id,
              messageUuid,
              type: 'start',
            });
            return;
          } else {
            // Wait on the other player to say something up to the awkward deadline.
            return;
          }
        }
        // See if the conversation has been going on too long and decide to leave.
        const tooLongDeadline = started + MAX_CONVERSATION_DURATION;
        if (tooLongDeadline < now || conversation.numMessages > MAX_CONVERSATION_MESSAGES) {
          console.log(`${player.id} leaving conversation with ${otherPlayer.id}.`);
          const messageUuid = crypto.randomUUID();
          conversation.setIsTyping(now, player, messageUuid);
          this.startOperation(game, now, 'agentGenerateMessage', {
            worldId: game.worldId,
            playerId: player.id,
            agentId: this.id,
            conversationId: conversation.id,
            otherPlayerId: otherPlayer.id,
            messageUuid,
            type: 'leave',
          });
          return;
        }
        // Wait for the awkward deadline if we sent the last message.
        if (conversation.lastMessage.author === player.id) {
          const awkwardDeadline = conversation.lastMessage.timestamp + AWKWARD_CONVERSATION_TIMEOUT;
          if (now < awkwardDeadline) {
            return;
          }
        }
        // Wait for a cooldown after the last message to simulate "reading" the message.
        const messageCooldown = conversation.lastMessage.timestamp + MESSAGE_COOLDOWN;
        if (now < messageCooldown) {
          return;
        }
        // Grab the lock and send a message!
        console.log(`${player.id} continuing conversation with ${otherPlayer.id}.`);
        const messageUuid = crypto.randomUUID();
        conversation.setIsTyping(now, player, messageUuid);
        this.startOperation(game, now, 'agentGenerateMessage', {
          worldId: game.worldId,
          playerId: player.id,
          agentId: this.id,
          conversationId: conversation.id,
          otherPlayerId: otherPlayer.id,
          messageUuid,
          type: 'continue',
        });
        return;
      }
    }
  }

  startOperation<Name extends keyof AgentOperations>(
    game: Game,
    now: number,
    name: Name,
    args: Omit<FunctionArgs<AgentOperations[Name]>, 'operationId'>,
  ) {
    if (this.inProgressOperation) {
      throw new Error(
        `Agent ${this.id} already has an operation: ${JSON.stringify(this.inProgressOperation)}`,
      );
    }
    const operationId = game.allocId('operations');
    console.log(`Agent ${this.id} starting operation ${name} (${operationId})`);
    game.scheduleOperation(name, { operationId, ...args } as any);
    this.inProgressOperation = {
      name,
      operationId,
      started: now,
    };
  }

  serialize(): SerializedAgent {
    return {
      id: this.id,
      playerId: this.playerId,
      toRemember: this.toRemember,
      lastConversation: this.lastConversation,
      lastInviteAttempt: this.lastInviteAttempt,
      inProgressOperation: this.inProgressOperation,
      activeTask: this.activeTask,
    };
  }
}

export const serializedActiveTask = v.object({
  requesterId: v.string(),
  phase: v.union(v.literal('working'), v.literal('consulting'), v.literal('reporting'), v.literal('followup'), v.literal('tool')),
  consultTarget: v.optional(v.string()),
  gatheredInfo: v.string(),
  question: v.optional(v.string()), // legacy field from old code
});

export const serializedAgent = {
  id: agentId,
  playerId: playerId,
  toRemember: v.optional(conversationId),
  lastConversation: v.optional(v.number()),
  lastInviteAttempt: v.optional(v.number()),
  inProgressOperation: v.optional(
    v.object({
      name: v.string(),
      operationId: v.string(),
      started: v.number(),
    }),
  ),
  activeTask: v.optional(serializedActiveTask),
};
export type SerializedAgent = ObjectType<typeof serializedAgent>;

type AgentOperations = typeof internal.aiTown.agentOperations;

export async function runAgentOperation(ctx: MutationCtx, operation: string, args: any) {
  let reference;
  switch (operation) {
    case 'agentRememberConversation':
      reference = internal.aiTown.agentOperations.agentRememberConversation;
      break;
    case 'agentGenerateMessage':
      reference = internal.aiTown.agentOperations.agentGenerateMessage;
      break;
    case 'agentDoSomething':
      reference = internal.aiTown.agentOperations.agentDoSomething;
      break;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
  await ctx.scheduler.runAfter(0, reference, args);
}

export const agentSendMessage = internalMutation({
  args: {
    worldId: v.id('worlds'),
    conversationId,
    agentId,
    playerId,
    text: v.string(),
    messageUuid: v.string(),
    leaveConversation: v.boolean(),
    operationId: v.string(),
    startTask: v.optional(serializedActiveTask),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      author: args.playerId,
      text: args.text,
      messageUuid: args.messageUuid,
      worldId: args.worldId,
    });
    await insertInput(ctx, args.worldId, 'agentFinishSendingMessage', {
      conversationId: args.conversationId,
      agentId: args.agentId,
      timestamp: Date.now(),
      leaveConversation: args.leaveConversation,
      operationId: args.operationId,
      startTask: args.startTask,
    });
  },
});

export const findConversationCandidate = internalQuery({
  args: {
    now: v.number(),
    worldId: v.id('worlds'),
    player: v.object(serializedPlayer),
    otherFreePlayers: v.array(v.object(serializedPlayer)),
  },
  handler: async (ctx, { now, worldId, player, otherFreePlayers }) => {
    const { position } = player;
    const candidates = [];

    for (const otherPlayer of otherFreePlayers) {
      // Find the latest conversation we're both members of.
      const lastMember = await ctx.db
        .query('participatedTogether')
        .withIndex('edge', (q) =>
          q.eq('worldId', worldId).eq('player1', player.id).eq('player2', otherPlayer.id),
        )
        .order('desc')
        .first();
      if (lastMember) {
        if (now < lastMember.ended + PLAYER_CONVERSATION_COOLDOWN) {
          continue;
        }
      }
      candidates.push({ id: otherPlayer.id, position });
    }

    // Sort by distance and take the nearest candidate.
    candidates.sort((a, b) => distance(a.position, position) - distance(b.position, position));
    return candidates[0]?.id;
  },
});
