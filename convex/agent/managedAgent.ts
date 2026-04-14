// Managed Agent adapter.
// For the demo: calls Anthropic Messages API directly with the agent's config.
// Future: full Managed Agents sessions with tools + container.

const API_BASE = 'https://api.anthropic.com';

export interface ManagedAgentContext {
  type: 'start' | 'continue' | 'leave';
  agentName: string;
  otherPlayerName: string;
  message: string;
  conversationHistory: { author: string; text: string }[];
}

export async function callManagedAgent(
  apiKey: string,
  agentId: string,
  context: ManagedAgentContext,
): Promise<string> {
  try {
    console.log(`[managed] Agent ${agentId}, type=${context.type}, talking to ${context.otherPlayerName}`);

    // Fetch the agent config to get its system prompt
    const agentConfig = await fetchAgentConfig(apiKey, agentId);
    const systemPrompt = agentConfig?.system || 'You are a helpful AI assistant in a virtual office called zukọ.';

    // Build messages
    let userMessage = '';
    if (context.type === 'start') {
      userMessage = `${context.otherPlayerName} just walked up to you and wants to chat. Start a friendly, brief conversation. Keep your response under 200 characters.`;
    } else if (context.type === 'leave') {
      userMessage = `Politely end the conversation with ${context.otherPlayerName}. Under 200 characters.`;
      if (context.conversationHistory.length > 0) {
        userMessage += `\n\nRecent chat:\n${context.conversationHistory.slice(-5).map((m) => `${m.author}: ${m.text}`).join('\n')}`;
      }
    } else {
      userMessage = `Respond to ${context.otherPlayerName}. Under 200 characters.\n\nChat:\n${context.conversationHistory.slice(-5).map((m) => `${m.author}: ${m.text}`).join('\n')}`;
    }

    // Call Messages API directly
    const resp = await fetch(`${API_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: agentConfig?.model?.id || 'claude-haiku-4-5',
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error(`[managed] Messages API failed: ${resp.status} ${err}`);
      return fallbackMessage(context.type);
    }

    const data = (await resp.json()) as { content: { type: string; text: string }[] };
    const text = data.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    console.log(`[managed] Response: ${text.slice(0, 100)}`);
    return text || fallbackMessage(context.type);
  } catch (e: any) {
    console.error(`[managed] Error: ${e.message}`);
    return fallbackMessage(context.type);
  }
}

async function fetchAgentConfig(apiKey: string, agentId: string): Promise<any> {
  try {
    const resp = await fetch(`${API_BASE}/v1/agents/${agentId}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'managed-agents-2026-04-01',
      },
    });
    if (!resp.ok) {
      console.error(`[managed] Failed to fetch agent config: ${resp.status}`);
      return null;
    }
    return await resp.json();
  } catch (e: any) {
    console.error(`[managed] Failed to fetch agent: ${e.message}`);
    return null;
  }
}

function fallbackMessage(type: string): string {
  if (type === 'leave') {
    return "I need to step away for a moment. Talk later!";
  }
  return "Sorry, I'm having a bit of trouble thinking right now. Can you try again?";
}
