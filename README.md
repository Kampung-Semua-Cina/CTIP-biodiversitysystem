# Smart Ground-Truthing and Digital Biodiversity System

COS30049 Computing Technology Innovation Project (Swinburne Sarawak), built with
NeuonAI Sdn Bhd and Sarawak Forestry Corporation. Pilot site: Niah National Park.

A digital replacement for paper-based plant documentation: a botanist field app that
works offline, a web knowledge system for conservation officers, a security layer, and
an IoT node that protects endangered specimens.

## Repository layout

| Path | What it is |
|---|---|
| `apps/mobile` | Botanist Field App (React Native + Expo SDK 57, Android only) |
| `apps/web` | Officer, Admin and Visitor web interfaces (React + Vite) |
| `apps/firmware` | ESP32 sensor node (Arduino IDE sketch) |
| `services/api` | REST API (Node + Express) |
| `services/anomaly-detection` | Sensor anomaly detection (Python) |
| `packages/api-contract` | OpenAPI spec, the single source of truth for the API |
| `supabase` | Supabase CLI project: `config.toml`, SQL migrations (tables, RLS policies, storage) |
| `infra` | Mosquitto broker config |
| `docs` | Architecture diagrams and testing evidence |

See [CLAUDE.md](CLAUDE.md) for the full project context, decisions already made, and
what is out of scope.

## Prerequisites

- Node.js 24 and npm
- Python 3 (for anomaly detection). Use `python`, not `python3`, on Windows
- Expo Go on an Android device or emulator, matching SDK 57
- Arduino IDE with the ESP32 board package (for firmware only)

## Getting started

Each app has its own `package.json`. Install and run from inside its folder
(PowerShell):

```powershell
# Web
cd apps/web
npm install
npm run dev

# Mobile
cd apps/mobile
npm install
npm start

# API
cd services/api
npm install
```

Never commit `.env` files, Supabase keys or MQTT certificates. Copy values from the
team's shared secrets instead.

## Task tracking

Sprint backlog lives in Jira, project **CTIP**: https://kampungsemuacina.atlassian.net.
Each workstream has a starting ticket (CTIP-13 to CTIP-18); pick one up in the team
chat or standup, and it gets assigned to you in Jira. New work within a workstream
goes to whoever owns it, unless it's raised otherwise.

## Contributing

- Branch per task, named after the Jira issue key, for example
  `feature/CTIP-15-local-sqlite-schema`.
- Commit messages start with the issue key, for example
  `CTIP-15: add specimen recording form`.
- Never push to `main`. Open a PR; it needs at least one approval and passing CI.
  Changes to `packages/api-contract/` need two approvals.
- Pull `main` before branching and keep branches short-lived.
