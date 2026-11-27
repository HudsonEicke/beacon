# Frontend

The Beacon web app: React 19 and TypeScript, built with Vite. It uses Redux Toolkit for state, React Router for pages, SignalR for live updates, Tailwind CSS with shadcn/ui components, and react-hook-form with zod for forms.

## Run it locally

You need Node 24 and the [Backend](../Backend/README.md) running.

Create `Frontend/.env` with the API's address:

```sh
VITE_API_URL=http://localhost:5297
```

Then:

```sh
npm ci
npm run dev
```

Open http://localhost:5173.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type checks, then builds to `dist/` |
| `npm run lint` | ESLint |
| `npm test` | Vitest in watch mode |
| `npm run test:run` | Vitest once, as CI runs it |

How to write tests is in [docs/testing.md](../docs/testing.md#2-frontend).

## Folder structure

```
Frontend/
├── src/
│   ├── components/
│   │   ├── <feature>/    # components grouped by feature: channel, message, server, ...
│   │   └── ui/           # shadcn/ui components
│   ├── pages/            # one folder per route
│   ├── store/            # Redux slices; hubEvents.ts has one action per SignalR event
│   ├── services/
│   │   └── hub/          # SignalR connection and event handlers
│   ├── hooks/
│   ├── lib/              # helper functions
│   ├── types/            # API types, matching the backend DTOs
│   └── test/             # shared test setup and helpers
├── Caddyfile             # production server: serves the app and proxies /api
└── Dockerfile
```

Tests sit next to the file they test (`messageTime.ts` → `messageTime.test.ts`).

## Adding shadcn components

`npx shadcn add <component>` writes to `Frontend/@/components/ui/` instead of `src/components/ui/`, and imports `cn` from `'cn'`. After adding a component, move the file into `src/components/ui/` and change the import to `@/lib/utils`.
