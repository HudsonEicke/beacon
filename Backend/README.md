# Backend

The Beacon API: an ASP.NET Core 10 app with REST endpoints, a SignalR hub for live updates, and PostgreSQL through EF Core. Its schema comes from SQL migrations that run when it starts.

## Run it locally

You need the .NET 10 SDK and a PostgreSQL 17 database. Docker is the quickest way to get one:

```sh
docker run -d --name beacon-dev-db -p 5432:5432 -e POSTGRES_PASSWORD=<password> -e POSTGRES_DB=messaging_app postgres:17
```

Create `Backend/appsettings.Development.json` (it's gitignored) with your local values:

```json
{
  "ConnectionStrings": {
    "MessagingAppContext": "Host=localhost;Database=messaging_app;Username=postgres;Password=<password>"
  },
  "JwtSettings": { "SecretKey": "<openssl rand -hex 32>" },
  "EncryptionSettings": { "SecretKey": "<openssl rand -hex 32>" }
}
```

Then, from `Backend/`:

```sh
dotnet run
```

The API listens on http://localhost:5297 and creates the schema in an empty database on its first start. Auth rate limiting is off in Development.

## Configuration

The defaults are in `appsettings.json`. In Docker, they're overridden with environment variables such as `JwtSettings__SecretKey`.

| Section | What it controls |
| --- | --- |
| `ConnectionStrings:MessagingAppContext` | Connection string for the PostgreSQL database |
| `JwtSettings` | Key for signing tokens, issuer, audience, and how long access and refresh tokens last |
| `EncryptionSettings` | Key that encrypts message text in the database. Never change it once the database has data. |
| `CleanupSettings` | Background job that deletes expired refresh tokens and old invites |
| `RateLimitSettings` | Request limit per IP on the auth endpoints |
| `AllowedOrigins` | CORS origins, for the Vite dev server. Not needed behind Caddy, where everything comes from one origin. |

## Endpoints

- **REST:** `/auth`, `/users`, `/servers`, `/channels`, `/messages`, `/conversations`, `/conversation-messages`, `/friends`, `/invites`. In Docker, Caddy serves these under `/api`.
- **SignalR hub:** `/hubs/chat`. The access token is passed in the `access_token` query string.
- **Health check:** `/health` returns 200 when the database is reachable.

There are example requests in `http/`, which you can run from VS Code or Rider, and in the Postman collection in `../Postman/`.

## Folder structure

```
Backend/
├── Configuration/        # typed appsettings sections
├── Controllers/
├── Data/
│   ├── Migrations/       # numbered SQL files, each run once by DbUp
│   └── MessagingAppContext.cs
├── Hubs/                 # SignalR hub and connection tracking
├── Models/
│   ├── Entities/         # one class per table
│   └── DTOs/<Feature>/   # request and response types
├── Services/
├── http/                 # .http files for trying the endpoints
└── Program.cs
```

## Related docs

- [Database migrations](../docs/database-migrations.md)
- [Tests](../Backend.Tests/README.md)
