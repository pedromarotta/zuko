// Eval: tests the full scripted task choreography end-to-end.
// Joins as human, starts conversation with Ada, sends message, verifies task phases.
// Also measures timing for each phase.

import { ConvexHttpClient } from 'convex/browser';
import { api, internal } from '../convex/_generated/api';

const CONVEX_URL = process.env.VITE_CONVEX_URL || 'https://agile-newt-102.convex.cloud';
const client = new ConvexHttpClient(CONVEX_URL);

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getWorldState() {
  const status = await client.query(api.world.defaultWorldStatus, {});
  if (!status?.worldId) throw new Error('No world');
  return { worldId: status.worldId, engineId: status.engineId };
}

async function getPlayers(worldId: any) {
  const state = await client.query(api.world.worldState, { worldId });
  return (state as any).world;
}

async function run() {
  console.log('=== Task Choreography Eval (Timed) ===\n');
  const totalStart = Date.now();
  const { worldId } = await getWorldState();

  const world = await getPlayers(worldId);
  const adaPlayer = world.players.find((p: any) => p.id === 'p:13820');
  const adaAgent = world.agents.find((a: any) => a.playerId === 'p:13820');
  if (!adaPlayer || !adaAgent) { console.log('FAIL: Ada not found'); return; }
  if (adaAgent.activeTask) { console.log('SKIP: Ada has active task'); return; }

  const human = world.players.find((p: any) => p.human);
  if (!human) { console.log('SKIP: No human. Join via browser first.'); return; }

  console.log(`Ada at (${adaPlayer.position.x}, ${adaPlayer.position.y}), Human at (${human.position.x}, ${human.position.y})`);

  // Move human next to Ada
  const moveStart = Date.now();
  await client.mutation(api.aiTown.main.sendInput, {
    worldId,
    name: 'moveTo',
    args: {
      playerId: human.id,
      destination: { x: Math.floor(adaPlayer.position.x) - 1, y: Math.floor(adaPlayer.position.y) },
    },
  });
  await sleep(3000);

  // Start conversation
  await client.mutation(api.aiTown.main.sendInput, {
    worldId,
    name: 'startConversation',
    args: { playerId: human.id, invitee: adaPlayer.id },
  });
  await sleep(3000);

  let w = await getPlayers(worldId);
  const conv = w.conversations.find((c: any) =>
    c.participants.some((p: any) => p.playerId === human.id) &&
    c.participants.some((p: any) => p.playerId === adaPlayer.id),
  );
  if (!conv) { console.log('FAIL: No conversation'); return; }

  // Wait for Ada's first message
  await sleep(5000);
  const setupTime = Date.now() - moveStart;
  console.log(`Setup (move + join + first msg): ${(setupTime / 1000).toFixed(1)}s`);

  // Send task request
  const taskStart = Date.now();
  await client.mutation(api.messages.writeMessage, {
    worldId,
    conversationId: conv.id,
    messageUuid: `eval-${Date.now()}`,
    playerId: human.id,
    text: 'Check if there are any pending transactional logs, adjust them in the ERP and notify the country manager. Check with Josh if the adjustment is correct.',
  });

  const timestamps: Record<string, number> = {};
  let lastPhase = '';
  let taskTriggered = false;

  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    w = await getPlayers(worldId);
    const ada = w.agents.find((a: any) => a.playerId === 'p:13820');
    const phase = ada?.activeTask?.phase;

    // Auto-accept invites
    const invite = w.conversations.find((c: any) =>
      c.participants.some((p: any) => p.playerId === human.id && p.status.kind === 'invited'),
    );
    if (invite) {
      await client.mutation(api.aiTown.main.sendInput, {
        worldId,
        name: 'acceptInvite',
        args: { playerId: human.id, conversationId: invite.id },
      });
    }

    if (phase && phase !== lastPhase) {
      timestamps[phase] = Date.now() - taskStart;
      console.log(`  ${phase}: +${(timestamps[phase] / 1000).toFixed(1)}s`);
      lastPhase = phase;
      if (phase === 'working') taskTriggered = true;
    }

    if (phase === 'followup') {
      // Send follow-up
      const conv2 = w.conversations.find((c: any) =>
        c.participants.some((p: any) => p.playerId === human.id) &&
        c.participants.some((p: any) => p.playerId === adaPlayer.id),
      );
      if (conv2) {
        await client.mutation(api.messages.writeMessage, {
          worldId,
          conversationId: conv2.id,
          messageUuid: `eval-fu-${Date.now()}`,
          playerId: human.id,
          text: 'Great, set up a meeting for tomorrow 5pm in calendar and send the link via Slack.',
        });
        await sleep(5000);

        const msgs = await client.query(api.messages.listMessages, { worldId, conversationId: conv2.id });
        const adaMsgs = msgs.filter((m: any) => m.author === adaPlayer.id);
        const hasReport = adaMsgs.some((m: any) => m.text.includes('ERP') || m.text.includes('FIFO'));
        const hasFollowup = adaMsgs.some((m: any) => m.text.includes('Meeting') || m.text.includes('calendar') || m.text.includes('Slack'));

        const totalTime = Date.now() - taskStart;
        const totalWithSetup = Date.now() - totalStart;

        console.log(`\n=== RESULTS ===`);
        console.log(`Task triggered:     ${taskTriggered ? '✅' : '❌'}`);
        console.log(`Report delivered:   ${hasReport ? '✅' : '❌'}`);
        console.log(`Follow-up confirmed:${hasFollowup ? ' ✅' : ' ❌'}`);
        console.log(`\n=== TIMING ===`);
        console.log(`Setup:              ${(setupTime / 1000).toFixed(1)}s`);
        for (const [p, t] of Object.entries(timestamps)) {
          console.log(`  → ${p.padEnd(15)} +${(t / 1000).toFixed(1)}s`);
        }
        console.log(`Task total:         ${(totalTime / 1000).toFixed(1)}s`);
        console.log(`End-to-end:         ${(totalWithSetup / 1000).toFixed(1)}s`);
        console.log(`\nAda messages:`);
        for (const m of adaMsgs) {
          console.log(`  "${m.text}"`);
        }
        return;
      }
    }

    if (!phase && taskTriggered) {
      console.log('  Task cleared unexpectedly');
      break;
    }
  }

  console.log('\nTimed out');
}

run().catch(console.error);
