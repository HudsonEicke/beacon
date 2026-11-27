# E2E tests

Playwright tests that drive the real app in Chromium, Firefox and WebKit. They run against the same Docker stack as a deployment: Postgres, the API, and Caddy serving the frontend. That way they also check the Dockerfiles, the Caddy proxy and SignalR over WebSockets.

## Run them

You need Docker, Node 24, a `.env` in the repo root, and port 80 free. Start the stack from the repo root:

```sh
docker compose -f compose.yaml -f E2E/compose.e2e.yaml up -d --build --wait
```

Then from `E2E/`:

```sh
npm ci
npx playwright install --with-deps    # first time only
npm test
```

Running one browser, UI mode, WSL without sudo, CI, and how to write tests are all covered in [docs/testing.md](../docs/testing.md#3-end-to-end).

## Folder structure

```
E2E/
├── tests/
├── support/
│   └── fixtures.ts       # createUser and openAs; import test and expect from here
├── global-setup.ts       # waits for the stack to be ready
└── compose.e2e.yaml      # override that keeps the E2E stack separate from yours
```
