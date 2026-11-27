# Backend.Tests

xUnit v3 tests for the [Backend](../Backend/README.md).

- **Unit tests** check single services, such as JWT handling, encryption and presence. They need nothing else to run.
- **Integration tests** run the whole API in memory and call its endpoints and the SignalR hub. Each run starts a throwaway `postgres:17` container with Testcontainers, so **Docker must be running**. They never touch a real database.

## Run them

From the repo root:

```sh
dotnet test                                     # everything
dotnet test --filter-namespace Backend.Tests.Unit   # unit tests only, no Docker
```

More options and how to write tests are in [docs/testing.md](../docs/testing.md#1-backend).

## Folder structure

```
Backend.Tests/
├── Helpers/        # test database, in-memory API host, hub client and base class
├── Integration/    # one file per controller, plus the hub
└── Unit/
```
