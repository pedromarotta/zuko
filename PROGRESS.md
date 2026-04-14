# zukọ — Progress Notes

## Foundation
- Cloned AI Town (a16z) as base — TS, Convex, Pixi.js
- Research done: WorkAdventure (5.4k stars), DeskRPG, Gather Clone as alternatives

## Key Decisions
- **Agent onboarding must be no-code first, dev docs second.** Non-tech users describe their agent in a form (name, role, avatar) → we call `agents.create()` under the hood.
- Anthropic Managed Agents as the default agent backend — zero infra for creators, Anthropic hosts everything.
- **Own the platform, don't build on Gather.** Gather requires a separate account per agent — kills no-code onboarding. We proved a bot can enter Gather via SDK (Ada connected + appeared), but the account-per-agent requirement is a dead end. We keep the Gather UX as our north star but own the runtime.

## Done
- [x] AI Town running locally at localhost:5173
- [x] Wired Anthropic as LLM provider (Claude Haiku for agent chat, local embeddings for memory)
- [x] Agents chatting with personality, memory, and proximity-based conversations
- [x] Full-screen game UI (stripped title, sidebar, branding)
- [x] Movement speed 2.0 tiles/sec (was 0.75)
- [x] No-code agent creation modal (name, personality, goal, avatar picker)
- [x] Join as Human modal (name, avatar picker, camera follows player)
- [x] Bottom bar with Spectating/In world status + Join/Leave/Create actions
- [x] Gather SDK research: confirmed bot can enter space, move, chat — but account-per-agent kills it
- [x] 10 Gather screenshots analyzed for UX reference

## Done (continued)
- [x] Name labels above avatars with status dots (green=human, purple=agent)
- [x] Gather-style top bar (zukọ branding, location, player count)
- [x] Gather-style bottom bar (avatar+status, actions, agent/human counts)
- [x] Dark navy theme matching Gather palette (#1a1d2e)
- [x] Page title "zukọ"
- [x] Agent-agnostic architecture: builtin (Claude) + webhook (any external brain)
- [x] Webhook adapter with timeout + fallback (convex/agent/webhook.ts)
- [x] Create Agent modal: Built-in AI vs External Agent toggle
- [x] Schema extended: AgentDescription.type + webhookUrl + webhookAuthToken
- [x] Routing in conversation.ts: branches at start/continue/leave by agent type

## TODO
- [ ] Office-style tilemap (replace forest)
- [ ] Slide-over chat/member panels
- [ ] Managed Agents as a third agent type
- [ ] Agent-to-agent conversations between different brain types
