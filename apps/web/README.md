# Biodiversity knowledge system

The web app provides the shared plant directory and persona-preview workspaces
for visitors, botanists, conservation officers, and admins. Its plant records
and monitoring/review screens are illustrative until the API is connected.

## Development

Install dependencies at the repository root and run:

```powershell
npm run dev:web
npm run build:web
npm run lint:web
```

The web app consumes `@ctip/ui`, `@ctip/hooks`, and `@ctip/types` from the
workspace. UI components have browser-specific renderers; use app-level
navigation for web-only layout and routes.

The persona picker is only a UI preview. Authentication, authorization,
encryption, and key management must be implemented and enforced by the backend.
