import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { WorldMap, serializedWorldMap } from './worldMap';
import { rememberConversation } from '../agent/memory';
import { GameId, agentId, conversationId, playerId } from './ids';
import {
  continueConversationMessage,
  leaveConversationMessage,
  startConversationMessage,
} from '../agent/conversation';
import { assertNever } from '../util/assertNever';
import { serializedAgent } from './agent';
import { ACTIVITIES, ACTIVITY_COOLDOWN, CONVERSATION_COOLDOWN } from '../constants';
import { api, internal } from '../_generated/api';
import { sleep } from '../util/sleep';
import { serializedPlayer } from './player';

export const agentRememberConversation = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      await rememberConversation(
        ctx,
        args.worldId,
        args.agentId as GameId<'agents'>,
        args.playerId as GameId<'players'>,
        args.conversationId as GameId<'conversations'>,
      );
    } catch (e: any) {
      console.log(`[memory] Failed to remember conversation: ${e.message}`);
    }
    await sleep(Math.random() * 1000);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishRememberConversation',
      args: {
        agentId: args.agentId,
        operationId: args.operationId,
      },
    });
  },
});

export const agentGenerateMessage = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    otherPlayerId: playerId,
    operationId: v.string(),
    type: v.union(v.literal('start'), v.literal('continue'), v.literal('leave')),
    messageUuid: v.string(),
  },
  handler: async (ctx, args) => {
    // Load agent data to check for task state
    const promptData = await ctx.runQuery(internal.agent.conversation.queryPromptData, {
      worldId: args.worldId,
      playerId: args.playerId,
      otherPlayerId: args.otherPlayerId,
      conversationId: args.conversationId,
    });
    const agent = promptData.agent;
    const otherPlayer = promptData.otherPlayer;
    const otherAgent = promptData.otherAgent;

    // Clean up stale tasks from old code (invalid phases or missing requester)
    const validPhases = ['working', 'consulting', 'reporting', 'followup'];
    if (agent.activeTask && !validPhases.includes(agent.activeTask.phase)) {
      console.log(`[task] Clearing stale task with invalid phase: ${agent.activeTask.phase}`);
      agent.activeTask = undefined;
    }

    // === SCRIPTED: Josh gives hardcoded reply when Ada consults him ===
    if (otherAgent?.activeTask?.phase === 'consulting' && args.type === 'continue') {
      console.log(`[task] Josh (${args.playerId}) giving scripted reply to Ada`);
      await ctx.runMutation(internal.aiTown.agent.agentSendMessage, {
        worldId: args.worldId,
        conversationId: args.conversationId,
        agentId: args.agentId,
        playerId: args.playerId,
        text: "FIFO is correct for the €5,100. Other two are straightforward adjustments.",
        messageUuid: args.messageUuid,
        leaveConversation: false,
        operationId: args.operationId,
      });
      return;
    }

    // === SCRIPTED TASK: consulting phase — Ada asks, Josh replies, Ada leaves ===
    if (agent.activeTask?.phase === 'consulting' && args.type === 'continue') {
      console.log(`[task] ${args.playerId} got reply from Josh, leaving with thanks`);
      await ctx.runMutation(internal.aiTown.agent.agentSendMessage, {
        worldId: args.worldId,
        conversationId: args.conversationId,
        agentId: args.agentId,
        playerId: args.playerId,
        text: "Got it, thanks!",
        messageUuid: args.messageUuid,
        leaveConversation: true,
        operationId: args.operationId,
      });
      return;
    }

    // === SCRIPTED TASK: reporting phase — Ada delivers hardcoded report, advance to followup ===
    if (agent.activeTask?.phase === 'reporting' && args.type === 'start') {
      console.log(`[task] ${args.playerId} delivering report, advancing to followup`);
      await ctx.runMutation(internal.aiTown.agent.agentSendMessage, {
        worldId: args.worldId,
        conversationId: args.conversationId,
        agentId: args.agentId,
        playerId: args.playerId,
        text: "Done. Adjusted all 3 logs in ERP — FIFO for €5,100 per Josh, standard for the rest. Country manager notified via email.",
        messageUuid: args.messageUuid,
        leaveConversation: false,
        operationId: args.operationId,
        startTask: {
          requesterId: agent.activeTask.requesterId,
          phase: 'followup',
          consultTarget: agent.activeTask.consultTarget,
          gatheredInfo: agent.activeTask.gatheredInfo,
        },
      });
      return;
    }

    // === SCRIPTED TASK: followup — human asks something else, Ada confirms ===
    if (agent.activeTask?.phase === 'followup' && args.type === 'continue') {
      console.log(`[task] ${args.playerId} handling follow-up`);
      await ctx.runMutation(internal.aiTown.agent.agentSendMessage, {
        worldId: args.worldId,
        conversationId: args.conversationId,
        agentId: args.agentId,
        playerId: args.playerId,
        text: "Meeting set for tomorrow 5 PM. Calendar invite and Slack link sent. ✅",
        messageUuid: args.messageUuid,
        leaveConversation: false,
        operationId: args.operationId,
      });
      return;
    }

    // === SCRIPTED TASK: consulting start — Ada asks Josh the question ===
    if (agent.activeTask?.phase === 'consulting' && args.type === 'start') {
      console.log(`[task] ${args.playerId} asking Josh about ERP adjustment`);
      await ctx.runMutation(internal.aiTown.agent.agentSendMessage, {
        worldId: args.worldId,
        conversationId: args.conversationId,
        agentId: args.agentId,
        playerId: args.playerId,
        text: "Found 3 pending logs — €2,400, €890, €5,100. FIFO for the cross-quarter one?",
        messageUuid: args.messageUuid,
        leaveConversation: false,
        operationId: args.operationId,
      });
      return;
    }

    // === TASK TRIGGER: human talks to managed agent → start task (NO LLM call) ===
    const isHuman = !!otherPlayer.human;
    const isManagedAgent = agent.type === 'managed';
    const hasNoTask = !agent.activeTask;

    if (args.type === 'continue' && isHuman && isManagedAgent && hasNoTask) {
      console.log(`[task] Triggering task for ${args.playerId}`);
      await ctx.runMutation(internal.aiTown.agent.agentSendMessage, {
        worldId: args.worldId,
        conversationId: args.conversationId,
        agentId: args.agentId,
        playerId: args.playerId,
        text: "On it! Checking the ERP and looping in Josh.",
        messageUuid: args.messageUuid,
        leaveConversation: true,
        operationId: args.operationId,
        startTask: {
          requesterId: args.otherPlayerId,
          phase: 'working' as const,
          gatheredInfo: '',
        },
      });
      return;
    }

    // === Managed agent talking to human (no task) — hardcoded greeting, NO LLM ===
    if (isManagedAgent && isHuman && args.type === 'start') {
      await ctx.runMutation(internal.aiTown.agent.agentSendMessage, {
        worldId: args.worldId,
        conversationId: args.conversationId,
        agentId: args.agentId,
        playerId: args.playerId,
        text: "Hey! What can I help you with?",
        messageUuid: args.messageUuid,
        leaveConversation: false,
        operationId: args.operationId,
      });
      return;
    }

    // === NORMAL (non-task) message generation — only for builtin agents ===
    let completionFn;
    switch (args.type) {
      case 'start':
        completionFn = startConversationMessage;
        break;
      case 'continue':
        completionFn = continueConversationMessage;
        break;
      case 'leave':
        completionFn = leaveConversationMessage;
        break;
      default:
        assertNever(args.type);
    }
    const text = await completionFn(
      ctx,
      args.worldId,
      args.conversationId as GameId<'conversations'>,
      args.playerId as GameId<'players'>,
      args.otherPlayerId as GameId<'players'>,
    );

    await ctx.runMutation(internal.aiTown.agent.agentSendMessage, {
      worldId: args.worldId,
      conversationId: args.conversationId,
      agentId: args.agentId,
      playerId: args.playerId,
      text,
      messageUuid: args.messageUuid,
      leaveConversation: args.type === 'leave',
      operationId: args.operationId,
    });
  },
});

export const agentDoSomething = internalAction({
  args: {
    worldId: v.id('worlds'),
    player: v.object(serializedPlayer),
    agent: v.object(serializedAgent),
    map: v.object(serializedWorldMap),
    otherFreePlayers: v.array(v.object(serializedPlayer)),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { player, agent } = args;
    const map = new WorldMap(args.map);
    const now = Date.now();
    // Don't try to start a new conversation if we were just in one.
    const justLeftConversation =
      agent.lastConversation && now < agent.lastConversation + CONVERSATION_COOLDOWN;
    // Don't try again if we recently tried to find someone to invite.
    const recentlyAttemptedInvite =
      agent.lastInviteAttempt && now < agent.lastInviteAttempt + CONVERSATION_COOLDOWN;
    const recentActivity = player.activity && now < player.activity.until + ACTIVITY_COOLDOWN;
    // Decide whether to do an activity or wander somewhere.
    if (!player.pathfinding) {
      if (recentActivity || justLeftConversation) {
        await sleep(Math.random() * 1000);
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            destination: wanderDestination(map),
          },
        });
        return;
      } else {
        // TODO: have LLM choose the activity & emoji
        const activity = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
        await sleep(Math.random() * 1000);
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            activity: {
              description: activity.description,
              emoji: activity.emoji,
              until: Date.now() + activity.duration,
            },
          },
        });
        return;
      }
    }
    const invitee =
      justLeftConversation || recentlyAttemptedInvite
        ? undefined
        : await ctx.runQuery(internal.aiTown.agent.findConversationCandidate, {
            now,
            worldId: args.worldId,
            player: args.player,
            otherFreePlayers: args.otherFreePlayers,
          });

    // TODO: We hit a lot of OCC errors on sending inputs in this file. It's
    // easy for them to get scheduled at the same time and line up in time.
    await sleep(Math.random() * 1000);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishDoSomething',
      args: {
        operationId: args.operationId,
        agentId: args.agent.id,
        invitee,
      },
    });
  },
});

function wanderDestination(worldMap: WorldMap) {
  // Wander someonewhere at least one tile away from the edge.
  return {
    x: 1 + Math.floor(Math.random() * (worldMap.width - 2)),
    y: 1 + Math.floor(Math.random() * (worldMap.height - 2)),
  };
}
