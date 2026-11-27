# Testing

How to run the tests for each layer of the stack, and how to run all of them before opening a pull request. Each layer has its own CI workflow, and a workflow only runs when a pull request changes files it covers.

| Layer | Folder | Tools | Needs | CI workflow |
| --- | --- | --- | --- | --- |
| Backend | `Backend.Tests/` | xUnit v3, Testcontainers | .NET 10 SDK, Docker for the integration tests | `Backend / test` |
| Frontend | `Frontend/` | Vitest, React Testing Library, MSW | Node 24 | `Frontend / build` |
| End-to-end | `E2E/` | Playwright (Chromium, Firefox, WebKit) | Node 24, Docker, port 80 free | `E2E / test` |

## 1. Backend

The tests are in `Backend.Tests/`, split in two:

- **Unit tests** (`Unit/`) test single services, such as JWT handling and encryption. They need nothing else.
- **Integration tests** (`Integration/`) run the API in memory and call its endpoints and the SignalR hub. They start a throwaway `postgres:17` container with Testcontainers, and the API runs the migrations against it on startup, so **Docker must be running**. They never touch a real database, and every run starts empty.

### Run the tests

From the repo root:

```sh
dotnet test                                                  # everything
dotnet test --filter-namespace Backend.Tests.Unit            # unit tests only, no Docker needed
dotnet test --filter-class Backend.Tests.Integration.AuthTests   # one test class
```

The tests run on Microsoft.Testing.Platform (set in `global.json`), so filters use its options (`--filter-namespace`, `--filter-class`, `--filter-method`), not `--filter "FullyQualifiedName~..."`.

On WSL without a Linux .NET SDK, the Windows SDK works on the same folder: use `dotnet.exe` in place of `dotnet`.

The integration tests run in the Development environment, where the login rate limiter is off. The end-to-end tests run the production setup.

CI runs `dotnet restore --locked-mode`, `dotnet build` and `dotnet test`. If you change a package, commit the updated `packages.lock.json` too.

### Writing tests

- **Unit or integration:** write a unit test for a service that works without HTTP or the database. Create it directly and pass settings with `Options.Create(...)`. Anything that goes through an endpoint or the hub is an integration test. Keep the namespace the same as the folder (`Backend.Tests.Unit` or `Backend.Tests.Integration`), since the unit-only filter depends on it.
- **Integration test classes** inherit `IntegrationTestBase` and take a `TestWebApplicationFactory` in their constructor. Send requests with `client` and `CreateRequest` or `Send`.
- **Setup helpers:** `IntegrationTestBase` has setup helpers such as `RegisterTwoUsers`, `CreateServerWithMember` and `CreateDmConversation`. Each one fails the test straight away with the API's error if its request doesn't succeed. Add new setup helpers there instead of copying them between classes.
- **Usernames:** all test classes share one database for the whole run, and it isn't cleared between tests, so give every user a username no other test uses (32 characters at most). The existing tests use short names from the test name, such as `frsendA`.
- **Check the result, not only the status code:** read the response body, and check the state afterwards with `GetJson` or `GetStatus`, or with `WithDatabase` for things the API doesn't expose.
- **SignalR:** `await using HubTestClient hub = await HubTestClient.Connect(factory, token);` returns once the connection has joined its groups. `hub.Next("EventName")` waits for an event, and `hub.AssertNoEvent("EventName")` checks one never arrives. A new event has to be added to `EventArgumentTypes` in `HubTestClient`, with the argument types the backend sends, before a test can wait for it.
- **Style:** name tests `Method_Condition_ExpectedResult`, mark the `//arrange`, `//act` and `//assert` parts, write explicit types instead of `var`, and pass `TestContext.Current.CancellationToken` to async calls.

## 2. Frontend

The tests are next to the code they test (`src/**/*.test.ts(x)`). They run in jsdom with MSW standing in for the API, so they need no backend.

### Run the tests

From `Frontend/`:

```sh
npm ci
npm run test:run                              # run once
npm test                                      # watch mode, reruns on save
npx vitest run src/lib/messageTime.test.ts    # one file
npm run lint
npm run build                                 # also type checks
```

CI runs `npm run lint`, `npm run build` and `npm run test:run`.

### Writing tests

- Name the file after the file it tests (`messageTime.ts` → `messageTime.test.ts`) and put it in the same folder.
- **Components:** render with `renderWithProviders(ui, { preloadedState, route })` from `src/test/renderWithProviders.tsx`. It gives each test a new store and a `MemoryRouter`, and returns `user` (user-event) and `store`. Find elements by role and label the way a user would, and interact through `user`, not `fireEvent`.
- **API calls:** MSW has no default handlers, and a request no test expected fails the test. Declare the requests a test expects with `server.use(http.get(apiUrl('/path'), ...))`, using `server` and `apiUrl` from `src/test/server.ts`. Handlers are reset and `localStorage` is cleared after each test.
- **Store logic:** for thunks and listeners, make a store with `setupTestStore(preloadedState)`. Build preloaded state on top of `emptyRootState()`.
- **Test data:** use the `make...` factories in `src/test/factories.ts` (`makeUser`, `makeMessage`, `makeServer`, ...) and override only the fields the test cares about.
- **Hub events:** `createFakeHubConnection()` from `src/test/fakeHubConnection.ts` stands in for SignalR. Pass its `connection` to the handler module's register function (for example `registerServerEvents(connection, store)`), then play a server event with `emit('EventName', ...args)`, which is type-checked against the hub's event types.
- Tests run with `TZ=UTC`, so dates format the same on every machine.

## 3. End-to-end

Playwright drives the real app in Chromium, Firefox and WebKit. The tests run against the same Docker stack as a deployment (Postgres, the API, and Caddy serving the frontend), built from your working tree, so they also check the Dockerfiles, the Caddy proxy and SignalR over WebSockets.

### Start the stack

You need Docker and Node 24. Port 80 must be free, so stop your normal local stack first.

The stack reads its secrets from `.env` in the repo root (copy `.env.example` if you don't have one). `E2E/compose.e2e.yaml` always serves on `http://localhost` and keeps its own containers, images and volumes, so it never touches your normal stack's data.

From the repo root:

```sh
docker compose -f compose.yaml -f E2E/compose.e2e.yaml up -d --build --wait
```

Rerun this after changing the app, so the tests see your changes.

### Run the tests

From `E2E/`:

```sh
npm ci
npx playwright install --with-deps    # first time, and after updating @playwright/test
npm test                              # all three browsers
npm test -- --project=chromium        # one browser
npm run test:ui                       # Playwright's UI mode
npm run report                        # open the last HTML report
npm run lint
npm run typecheck
```

Every test makes its own users with random names, so you can rerun the tests against a stack that's already up. To run against another address, set `E2E_BASE_URL`.

### Stop the stack

From the repo root:

```sh
docker compose -f compose.yaml -f E2E/compose.e2e.yaml down --volumes
```

### WSL without sudo

`--with-deps` needs sudo to install the browsers' system libraries. Without sudo, Chromium and Firefox usually still start, but WebKit doesn't. Run the tests in Microsoft's Playwright image instead, which has the libraries. From `E2E/`:

```sh
docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.65.1-noble npx playwright test
```

Keep the image tag the same as the `@playwright/test` version in `E2E/package-lock.json`.

### Writing tests

- Import `test` and `expect` from `support/fixtures`, not from `@playwright/test`.
- `createUser` registers a user through the API. `openAs` opens a separate browser for that user, already logged in, and waits until the chat hub is connected. Use one `openAs` per user when testing live updates.
- Do setup that isn't what the test is about through the API (`support/api.ts`). Do the steps under test in the browser.
- Find elements by role and accessible name (`getByRole`, `getByLabel`). If an element has no accessible name, add an `aria-label` to the component.

### In CI

The workflow generates throwaway secrets, builds and starts the stack, then lints, type checks and runs the tests in all three browsers. Failed tests are retried twice, and a trace is kept for each retry. The HTML report is uploaded as the `playwright-report` artifact on the workflow run. If anything fails, the container logs are printed in the job output.

## 4. Running everything

Run all three layers before opening a pull request. Docker must be running. From the repo root:

```sh
# backend
dotnet test

# frontend
(cd Frontend && npm run lint && npm run build && npm run test:run)

# end-to-end
docker compose -f compose.yaml -f E2E/compose.e2e.yaml up -d --build --wait
(cd E2E && npm run lint && npm run typecheck && npm test)
docker compose -f compose.yaml -f E2E/compose.e2e.yaml down --volumes
```

The backend integration tests and the E2E stack can run at the same time. Testcontainers gives its database a random port, so it doesn't clash with the E2E stack.

On a pull request, CI runs the three workflows in parallel. A change to the backend, frontend or database also runs the E2E workflow, since the end-to-end tests cover all of them.

## 5. Troubleshooting

- **Backend integration tests fail with a Docker error:** Docker isn't running, or your user can't reach it. Unit tests still run with `--filter-namespace Backend.Tests.Unit`.
- **E2E tests fail straight away with "wasn't ready after 120s":** the stack isn't up, or something else is using port 80. Check with `docker compose -f compose.yaml -f E2E/compose.e2e.yaml ps` and `... logs`.
- **"Host system is missing dependencies to run browsers":** run `npx playwright install --with-deps`, or use the Docker image (see [WSL without sudo](#wsl-without-sudo)).
- **An E2E test passes locally but fails in CI:** download the `playwright-report` artifact from the workflow run and open it with `npx playwright show-report <folder>`. The trace of the retry shows each step, the page, and the network requests.
