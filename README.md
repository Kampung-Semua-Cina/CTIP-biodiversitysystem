# Smart Ground-Truthing and Digital Biodiversity System

COS30049 Computing Technology Innovation Project (Swinburne Sarawak University), built with
NeuonAI Sdn Bhd and Sarawak Forestry Corporation. Pilot site: Niah National Park.

A digital replacement for paper-based plant documentation: a botanist field app that
works offline, a web knowledge system for conservation officers, a security layer, and
an IoT node that protects endangered specimens.

## Repository layout

| Path | What it is |
|---|---|
| `apps/mobile` | Botanist Field App (React Native + Expo SDK 57, Android only) |
| `apps/web` | Officer, Admin and Visitor web interfaces (React + Vite) |
| `apps/firmware` | ESP32 sensor node (PlatformIO) |
| `services/api` | REST API (Node + Express) |
| `services/anomaly-detection` | Sensor anomaly detection (Python) |
| `packages/design-system` | Shared color, spacing, radius and typography tokens |
| `packages/hooks` | Platform-neutral React hooks, including plant search/filter |
| `packages/types` | Shared plant, persona and security integration contracts |
| `packages/ui` | Shared plant and field components with web/native renderers |
| `packages/api-contract` | OpenAPI spec, the single source of truth for the API |
| `infra` | Mosquitto broker config, Supabase migrations and RLS policies |
| `docs` | Architecture diagrams and testing evidence |

See [CLAUDE.md](CLAUDE.md) for the full project context, decisions already made, and
what is out of scope.

## Prerequisites

- Node.js 24 and npm
- Python 3 (for anomaly detection). Use `python`, not `python3`, on Windows
- Expo Go on an Android device or emulator, matching SDK 57
- PlatformIO (for firmware only)

## Getting started

The web app, mobile app and shared packages use npm workspaces. Install once at
the repository root (PowerShell):

```powershell
npm install
```

Run either app from the repository root:

```powershell
npm run dev:web
npm run dev:mobile
```

Build and lint the web app with `npm run build:web` and `npm run lint:web`.
The API service remains a separate package and is installed from
`services/api`.

### Shared app foundation

`apps/web` and `apps/mobile` consume the same `@ctip/types`, `@ctip/hooks`, and
`@ctip/ui` workspace packages. UI components have web and React Native
implementations selected by the platform; navigation and device capabilities
remain app-specific. The current plant records and operational screens are
illustrative previews, not connected to the API.

Authentication, server-enforced role permissions, encryption, and key
management are backend integration requirements. The persona selector is only
a UI preview and must never be treated as access control. QR scanning, camera,
GPS capture, durable offline storage, synchronization, review actions, reports,
and sensor feeds need their platform or API integrations before production use.
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
