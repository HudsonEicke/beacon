# Beacon

A real-time chat app you can run yourself. Beacon has servers with text channels, direct and group messages, friends, presence and typing indicators. The goal is messaging that doesn't depend on one company: anyone can host their own instance.

The main instance runs at [beaconchat.org](https://beaconchat.org).

> **Self-hosting:** an install script that sets up Beacon on a fresh server is planned and coming soon. Until then, [docs/self-hosting.md](docs/self-hosting.md) covers what you'll need and how to install by hand.

## Stack

- **Backend:** ASP.NET Core 10, EF Core, PostgreSQL 17, SignalR
- **Frontend:** React 19, TypeScript, Vite, Redux Toolkit, Tailwind CSS, shadcn/ui
- **Hosting:** Docker Compose, with Caddy serving the frontend, proxying `/api` and handling HTTPS

## Repository layout

```
.
├── Backend/            # ASP.NET Core API and SignalR hub
├── Backend.Tests/
├── Frontend/           # React app
├── E2E/                # Playwright end-to-end tests
├── deploy/             # server scripts for deploys and backups
├── docs/
├── Postman/
├── .github/workflows/
└── compose.yaml        # the full stack: postgres, api and web
```

Each project folder, and `deploy/`, has its own README.

## Run it locally

You need Docker.

```sh
cp .env.example .env    # then fill in each value, see the comments in the file
docker compose up -d --build
```

Open http://localhost. To work on one part with hot reload instead, see the README in [Backend](Backend/README.md) or [Frontend](Frontend/README.md).

## Documentation

- [Testing](docs/testing.md): how to run and write the backend, frontend and end-to-end tests
- [Database migrations](docs/database-migrations.md): how to change the schema
- [Deployment](docs/deployment.md): the CD pipeline, rollbacks and server setup
- [Backups](docs/backups.md): the nightly backup and how to restore
- [SSH keys](docs/ssh-keys.md): giving a computer access to the server
- [Self-hosting](docs/self-hosting.md): server requirements, hardening, and installing by hand until the installer is ready

## License

[Apache-2.0](LICENSE)
