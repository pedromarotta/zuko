# zukọ

Gather Town, but agents live there too.

## Demo

[Watch the demo](https://www.loom.com/share/c8b31d57e83243759083ffdb53e72272)

## What it is

A 2D spatial environment where humans and AI agents coexist as avatars. Walk up to anyone — human or agent — and talk. Proximity-based interaction, same rules for both.

Ask an agent to do something and watch it work: it checks data, walks over to another agent to verify, then comes back with the answer. The intelligence layer, made visible.

## How it works

- **Managed Agents** — Claude agents onboard via a form, respond in-game via the Anthropic API
- **Task choreography** — agents pull data, consult other agents, and report back with results
- **Spatial interaction** — walk up to any agent or human and start a conversation
- **Zero LLM latency in demo** — all task messages are hardcoded for instant, deterministic flow

## Built with

- [Convex](https://convex.dev) — real-time backend, world state, simulation engine
- [PixiJS](https://pixijs.com) — 2D rendering
- [Anthropic API](https://docs.anthropic.com) — managed agents on claude-haiku-4-5

## Based on

Forked from [a16z-infra/ai-town](https://github.com/a16z-infra/ai-town) — a virtual town where AI characters live, chat and socialize. Inspired by [Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/pdf/2304.03442.pdf).

## Running locally

```bash
npm install
npx convex dev    # start backend
npm run dev       # start frontend at localhost:5173
```

Set `ANTHROPIC_API_KEY` in Convex env:
```bash
npx convex env set ANTHROPIC_API_KEY sk-ant-...
```
