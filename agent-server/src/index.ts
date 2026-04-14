import { Game } from "@gathertown/gather-game-client";
import Anthropic from "@anthropic-ai/sdk";

// --- Config ---
const SPACE_ID = process.env.GATHER_SPACE_ID!;
const GATHER_API_KEY = process.env.GATHER_API_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

if (!SPACE_ID || !GATHER_API_KEY || !ANTHROPIC_API_KEY) {
  console.error("Missing env vars: GATHER_SPACE_ID, GATHER_API_KEY, ANTHROPIC_API_KEY");
  process.exit(1);
}

// --- Agent definition ---
const AGENT_NAME = process.env.AGENT_NAME || "Ada";
const AGENT_IDENTITY =
  process.env.AGENT_IDENTITY ||
  "You are Ada, a friendly AI assistant who lives in this virtual office. You're helpful, concise, and have a warm personality. You keep responses short (under 200 characters) since this is a chat.";
const AGENT_PLAN =
  process.env.AGENT_PLAN || "Be helpful and have interesting conversations with coworkers.";

// --- Anthropic client ---
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// --- Conversation memory (per player) ---
const conversations = new Map<
  string,
  { role: "user" | "assistant"; content: string }[]
>();

async function getAgentResponse(playerId: string, playerName: string, message: string): Promise<string> {
  let history = conversations.get(playerId) || [];
  history.push({ role: "user", content: `${playerName}: ${message}` });

  // Keep last 20 messages to avoid context bloat
  if (history.length > 20) history = history.slice(-20);
  conversations.set(playerId, history);

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    system: `${AGENT_IDENTITY}\nYour goal: ${AGENT_PLAN}\nKeep responses under 200 characters. Be natural and conversational.`,
    messages: history,
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  history.push({ role: "assistant", content: text });
  conversations.set(playerId, history);

  return text;
}

// --- Gather connection ---
// Gather expects the space ID with a backslash separator internally
const formattedSpaceId = SPACE_ID.replace("/", "\\");
const game = new Game(formattedSpaceId, () => Promise.resolve({ apiKey: GATHER_API_KEY }));

game.connect();

game.subscribeToConnection((connected) => {
  if (connected) {
    console.log(`✓ Connected to Gather space: ${SPACE_ID}`);
    console.log(`  Agent: ${AGENT_NAME}`);

    // Enter the space
    game.enter({
      name: AGENT_NAME,
      isNpc: true,
    } as any);

    console.log(`✓ ${AGENT_NAME} entered the space`);

    // Set status
    setTimeout(() => {
      game.setTextStatus("🤖 AI Agent — talk to me!");
      game.setName(AGENT_NAME);
      console.log(`✓ Status set`);
    }, 2000);
  } else {
    console.log("✗ Disconnected from Gather");
  }
});

// --- Handle incoming chats ---
game.subscribeToEvent("playerChats", async (data, context) => {
  const chatData = data.playerChats;
  if (!chatData) return;

  const senderId = chatData.senderId;
  const contents = chatData.contents;
  const recipient = chatData.recipient;

  // Only respond to DMs sent to our agent or messages near us
  if (!senderId || !contents) return;

  // Don't respond to our own messages
  const myId = game.engine?.clientUid;
  if (senderId === myId) return;

  // Get sender name
  const sender = game.players[senderId];
  const senderName = sender?.name || "Someone";

  console.log(`💬 ${senderName}: ${contents}`);

  try {
    const response = await getAgentResponse(senderId, senderName, contents);
    console.log(`🤖 ${AGENT_NAME}: ${response}`);

    // Reply in chat — DM back to the sender
    const mapId = sender?.map || "";
    game.chat(
      recipient === "LOCAL_CHAT" ? "LOCAL_CHAT" : senderId,
      myId ? [myId] : [],
      mapId,
      { contents: response },
    );
  } catch (err) {
    console.error("Error generating response:", err);
  }
});

// --- Wander around randomly ---
const WANDER_INTERVAL = 15000; // Move every 15 seconds

setInterval(() => {
  const directions = ["Left", "Right", "Up", "Down"] as const;
  const dir = directions[Math.floor(Math.random() * directions.length)];
  const steps = 2 + Math.floor(Math.random() * 4);

  for (let i = 0; i < steps; i++) {
    setTimeout(() => {
      game.move(dir as any);
    }, i * 200);
  }
  setTimeout(() => {
    game.move(dir as any, true); // stopped = true
  }, steps * 200);
}, WANDER_INTERVAL);

console.log(`🚀 zukọ agent server starting...`);
console.log(`   Space: ${SPACE_ID}`);
console.log(`   Agent: ${AGENT_NAME}`);
