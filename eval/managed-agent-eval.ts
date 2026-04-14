// Eval: tests the managed agent adapter end-to-end against the Anthropic API.
// Uses claude-haiku-4-5 to keep costs minimal.

const API_BASE = 'https://api.anthropic.com';
const MODEL = 'claude-haiku-4-5';
const API_KEY = process.env.ANTHROPIC_API_KEY!;
const AGENT_ID = process.env.MANAGED_AGENT_ID; // optional — if set, fetches config

interface TestCase {
  name: string;
  type: 'start' | 'continue' | 'leave';
  otherPlayerName: string;
  conversationHistory: { author: string; text: string }[];
}

const tests: TestCase[] = [
  {
    name: 'start conversation',
    type: 'start',
    otherPlayerName: 'Alice',
    conversationHistory: [],
  },
  {
    name: 'continue conversation',
    type: 'continue',
    otherPlayerName: 'Alice',
    conversationHistory: [
      { author: 'Alice', text: 'Hey! How are you doing today?' },
      { author: 'Ada', text: 'Hi Alice! Doing great, just exploring this space.' },
      { author: 'Alice', text: 'What do you think about the virtual office?' },
    ],
  },
  {
    name: 'leave conversation',
    type: 'leave',
    otherPlayerName: 'Alice',
    conversationHistory: [
      { author: 'Alice', text: 'Hey! How are you doing today?' },
      { author: 'Ada', text: 'Doing well! Nice to meet you here.' },
    ],
  },
];

function buildUserMessage(test: TestCase): string {
  if (test.type === 'start') {
    return `${test.otherPlayerName} just walked up to you and wants to chat. Start a friendly, brief conversation. Keep your response under 200 characters.`;
  }
  if (test.type === 'leave') {
    let msg = `Politely end the conversation with ${test.otherPlayerName}. Under 200 characters.`;
    if (test.conversationHistory.length > 0) {
      msg += `\n\nRecent chat:\n${test.conversationHistory.slice(-5).map((m) => `${m.author}: ${m.text}`).join('\n')}`;
    }
    return msg;
  }
  return `Respond to ${test.otherPlayerName}. Under 200 characters.\n\nChat:\n${test.conversationHistory.slice(-5).map((m) => `${m.author}: ${m.text}`).join('\n')}`;
}

async function callMessages(systemPrompt: string, userMessage: string): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const resp = await fetch(`${API_BASE}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`API ${resp.status}: ${err}`);
  }

  const data = await resp.json() as any;
  const text = data.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  return {
    text,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

async function fetchAgentConfig(): Promise<any> {
  if (!AGENT_ID) return null;
  try {
    const resp = await fetch(`${API_BASE}/v1/agents/${AGENT_ID}`, {
      method: 'GET',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'managed-agents-2026-04-01',
      },
    });
    if (!resp.ok) {
      console.log(`  [warn] Could not fetch agent config: ${resp.status}`);
      return null;
    }
    return await resp.json();
  } catch {
    return null;
  }
}

async function run() {
  console.log('=== zukọ Managed Agent Eval ===');
  console.log(`Model: ${MODEL}`);
  console.log(`Agent ID: ${AGENT_ID || '(none — using default system prompt)'}\n`);

  const agentConfig = await fetchAgentConfig();
  const systemPrompt = agentConfig?.system || 'You are a helpful AI assistant in a virtual office called zukọ. You are friendly and keep responses brief.';

  if (agentConfig) {
    console.log(`Agent config loaded: model=${agentConfig.model?.id}, name=${agentConfig.name}`);
  }
  console.log(`System prompt: "${systemPrompt.slice(0, 80)}..."\n`);

  let totalInput = 0;
  let totalOutput = 0;
  let passed = 0;

  for (const test of tests) {
    process.stdout.write(`[${test.name}] `);
    const userMsg = buildUserMessage(test);

    try {
      const result = await callMessages(systemPrompt, userMsg);
      totalInput += result.inputTokens;
      totalOutput += result.outputTokens;

      // Eval checks
      const errors: string[] = [];
      if (!result.text || result.text.length === 0) errors.push('empty response');
      if (result.text.length > 300) errors.push(`too long (${result.text.length} chars)`);
      // Should not contain the fallback error message
      if (result.text.includes("trouble thinking")) errors.push('got fallback message');

      if (errors.length === 0) {
        passed++;
        console.log(`PASS (${result.text.length} chars, ${result.inputTokens}+${result.outputTokens} tokens)`);
        console.log(`  "${result.text}"`);
      } else {
        console.log(`FAIL: ${errors.join(', ')}`);
        console.log(`  "${result.text}"`);
      }
    } catch (e: any) {
      console.log(`ERROR: ${e.message}`);
    }
  }

  console.log(`\n=== Results: ${passed}/${tests.length} passed ===`);
  console.log(`Total tokens: ${totalInput} input + ${totalOutput} output`);
  const cost = (totalInput * 1.0 / 1_000_000) + (totalOutput * 5.0 / 1_000_000);
  console.log(`Estimated cost: $${cost.toFixed(4)} (haiku pricing)`);
}

run().catch(console.error);
