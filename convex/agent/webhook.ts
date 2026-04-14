// Webhook adapter for external agents.
// Calls a user-provided URL with conversation context, expects { text: string } back.

const WEBHOOK_TIMEOUT = 10000; // 10 seconds

export interface WebhookContext {
  type: 'start' | 'continue' | 'leave';
  agent: {
    name: string;
    identity: string;
    plan: string;
  };
  otherPlayer: {
    name: string;
  };
  conversationHistory: { author: string; text: string }[];
  memories: string[];
}

export async function callWebhook(
  webhookUrl: string,
  context: WebhookContext,
  authToken?: string,
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(context),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`Webhook returned ${response.status}: ${await response.text()}`);
      return fallbackMessage(context);
    }

    const json = (await response.json()) as { text?: string };
    if (!json.text || typeof json.text !== 'string') {
      console.error('Webhook returned invalid response:', json);
      return fallbackMessage(context);
    }

    return json.text;
  } catch (e: any) {
    if (e.name === 'AbortError') {
      console.error(`Webhook timed out after ${WEBHOOK_TIMEOUT}ms: ${webhookUrl}`);
    } else {
      console.error(`Webhook error: ${e.message}`);
    }
    return fallbackMessage(context);
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackMessage(context: WebhookContext): string {
  if (context.type === 'leave') {
    return "I need to step away for a moment. Talk later!";
  }
  return "Sorry, I'm having a bit of trouble thinking right now. Can you try again?";
}
