# deploy

Scripts and config installed on the server, for deploys and nightly backups. Nothing in this folder runs in CI or locally.

```
deploy/
├── beacon-deploy.sh          # run over SSH by the Deploy workflow
├── beacon-deploy.sudoers
├── deploy.env.example
├── backup.sh                 # nightly database backup to R2
├── backup.env.example
├── beacon-backup.service
└── beacon-backup.timer       # runs the backup at 08:00 UTC
```

How to install and use them: [deployment.md](../docs/deployment.md) and [backups.md](../docs/backups.md).
