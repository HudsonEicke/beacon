# Backups and Restoring

How the nightly database backup works, what you need to keep safe, and how to restore: as a routine test, onto the live server, or onto a brand-new server after losing the old one.

Placeholders used below:

- `<domain>`: the site's domain, e.g. `chat.example.com`
- `<server-ip>`: the server's IPv4 address
- `<dump>`: a backup file name, e.g. `messaging_app-2026-11-13T0800Z.dump`
- `<repo-url>`: the app's git repository

## 1. How it works

`deploy/backup.sh` runs every night at 08:00 UTC from a systemd timer (`beacon-backup.timer`). Each run:

1. Dumps the database with `pg_dump -Fc` to `/var/backups/beacon/`.
2. Checks the dump with `pg_restore --list`.
3. Uploads it through an encrypted rclone remote (`r2crypt:` by default) to an R2 bucket.
4. Checks the upload with `rclone cryptcheck`.
5. Keeps only the newest dump on the server.

Every deploy also runs the backup first, and stops if it fails (see [deployment.md](deployment.md)).

The bucket's lifecycle rule deletes dumps **14 days** after upload, so you can go back up to two weeks. Settings are in `/etc/beacon/backup.env` (template: `deploy/backup.env.example`).

Useful commands:

```sh
systemctl list-timers beacon-backup.timer       # next and last run
sudo journalctl -u beacon-backup.service        # output of past runs
sudo systemctl start beacon-backup.service      # run a backup now
sudo rclone ls r2crypt:                         # backups in the bucket
```

## 2. What to keep in your password manager

If the server is lost, everything needed to rebuild it has to be somewhere else. **Without the first two items, the backups can't be used.**

- [ ] **`.env` values:** `ENCRYPTION_SECRET_KEY` (message text is encrypted with it; a restored database is unreadable without it), `POSTGRES_PASSWORD`, `JWT_SECRET_KEY`
- [ ] **rclone crypt password and salt** (`password` and `password2` of the crypt remote)
- [ ] **R2 token:** Access Key ID, Secret Access Key, and the S3 endpoint (`https://<account-id>.r2.cloudflarestorage.com`)
- [ ] Logins (with 2FA) for the VPS provider and Cloudflare
- [ ] An SSH key on more than one computer (see [ssh-keys.md](ssh-keys.md))

## 3. Test a restore

Do this every few months, and after big schema changes. It restores the newest backup into a throwaway Postgres container and compares it with the live database. The live containers aren't touched.

```sh
sudo rclone ls r2crypt:
sudo rclone copy r2crypt:<dump> /tmp/restore-test/

sudo docker run -d --name restore-test -e POSTGRES_PASSWORD=test postgres:17
until sudo docker exec restore-test pg_isready -U postgres -h 127.0.0.1; do sleep 1; done
sudo docker cp /tmp/restore-test/<dump> restore-test:/tmp/backup.dump
sudo docker exec restore-test createdb -U postgres messaging_app
sudo docker exec restore-test pg_restore -U postgres -d messaging_app /tmp/backup.dump
```

`pg_restore` should print nothing. Then compare row counts (run from the app folder, e.g. `~/beacon`):

```sh
Q="SELECT 'users', count(*) FROM users UNION ALL SELECT 'servers', count(*) FROM servers UNION ALL SELECT 'messages', count(*) FROM messages UNION ALL SELECT 'conversationmessages', count(*) FROM conversationmessages;"
sudo docker compose exec -T postgres psql -U postgres -d messaging_app -c "$Q"
sudo docker exec restore-test psql -U postgres -d messaging_app -c "$Q"
```

The counts should match, or the live ones be higher if messages were sent after the backup. Clean up:

```sh
sudo docker rm -fv restore-test
sudo rm -rf /tmp/restore-test
```

## 4. Restore onto the live server

For undoing a mistake, such as data deleted by accident. **Everything since the backup is lost**, so take a fresh backup first in case you need to go back. Don't merge to `main` until you're done, because a deploy would restart the API in the middle of the restore.

```sh
cd ~/beacon
sudo systemctl start beacon-backup.service
sudo rclone ls r2crypt:
sudo rclone copy r2crypt:<dump> /tmp/restore/
```

The newest dump is also kept in `/var/backups/beacon/`, so for that one you can skip the download.

Stop the API so nothing writes to the database, then replace the database with the backup:

```sh
sudo docker compose stop api
sudo docker compose cp /tmp/restore/<dump> postgres:/tmp/backup.dump
sudo docker compose exec postgres dropdb -U postgres messaging_app
sudo docker compose exec postgres createdb -U postgres messaging_app
sudo docker compose exec postgres pg_restore -U postgres -d messaging_app /tmp/backup.dump
sudo docker compose exec postgres rm /tmp/backup.dump
sudo docker compose start api
sudo rm -rf /tmp/restore
```

Users stay logged in only if their refresh token is in the backup; anyone who logged in after it will need to log in again.

## 5. Restore onto a new server

For when the old server is gone. The new server gets the same `.env` secrets and the newest backup.

**1. Set up the server.** Harden it as in [self-hosting.md section 5](self-hosting.md#5-secure-the-server), install Docker as in [section 6](self-hosting.md#6-install-by-hand-until-the-installer-is-ready), and add your SSH keys ([ssh-keys.md](ssh-keys.md)).

**2. Install rclone from its GitHub releases.** Ubuntu's apt package (1.60) is too old for R2 and fails uploads with `501 NotImplemented`.

```sh
cd /tmp
curl -fsSLO https://github.com/rclone/rclone/releases/download/v<version>/rclone-v<version>-linux-amd64.deb
curl -fsSLO https://github.com/rclone/rclone/releases/download/v<version>/SHA256SUMS
sha256sum --check --ignore-missing SHA256SUMS
sudo apt install ./rclone-v<version>-linux-amd64.deb
cd ~
```

**3. Let the R2 token work from the new server.** If the token has client IP filtering, edit it in Cloudflare (R2 → Manage API tokens) and replace the old server's IP with `<server-ip>`. Otherwise every rclone command fails with an access error.

**4. Recreate the rclone remotes as root,** with the **same** crypt password and salt from your password manager. Use `read` so the secrets stay out of your shell history:

```sh
read -rp 'R2 endpoint: ' R2_ENDPOINT
read -rp 'Access Key ID: ' R2_KEY_ID
read -rsp 'Secret Access Key: ' R2_SECRET; echo
read -rsp 'Crypt password: ' CRYPT_PW; echo
read -rsp 'Crypt salt: ' CRYPT_SALT; echo

sudo rclone config create r2 s3 \
  provider=Cloudflare \
  endpoint="$R2_ENDPOINT" \
  access_key_id="$R2_KEY_ID" \
  secret_access_key="$R2_SECRET" \
  acl=private \
  no_check_bucket=true

sudo rclone config create r2crypt crypt \
  remote=r2:beacon-backups \
  filename_encryption=off \
  directory_name_encryption=false \
  password="$CRYPT_PW" \
  password2="$CRYPT_SALT" \
  --obscure

unset R2_ENDPOINT R2_KEY_ID R2_SECRET CRYPT_PW CRYPT_SALT
sudo rclone ls r2crypt:
```

The last command should list the backups. If a wrong crypt password was entered, the listing still works but downloads fail to decrypt, so check by downloading in step 7.

**5. Point the domain at the new server.** In Cloudflare DNS, change the `A` record for `<domain>` to `<server-ip>` (DNS only). Wait until it resolves to the new IP before step 8, so Caddy can get a certificate.

**6. Clone the app and recreate `.env`** with the values from your password manager. `ENCRYPTION_SECRET_KEY` **must** be the old value. The others can be new: a new `POSTGRES_PASSWORD` is fine because the database is created fresh, and a new `JWT_SECRET_KEY` only logs everyone out.

```sh
git clone <repo-url> ~/beacon
cd ~/beacon
cp .env.example .env
chmod 600 .env
nano .env
```

**7. Start only the database and restore the newest backup into it:**

```sh
sudo rclone ls r2crypt:
sudo rclone copy r2crypt:<dump> /tmp/restore/

sudo docker compose up -d postgres
until sudo docker compose exec postgres pg_isready -U postgres -h 127.0.0.1; do sleep 1; done
sudo docker compose cp /tmp/restore/<dump> postgres:/tmp/backup.dump
sudo docker compose exec postgres dropdb -U postgres messaging_app
sudo docker compose exec postgres createdb -U postgres messaging_app
sudo docker compose exec postgres pg_restore -U postgres -d messaging_app /tmp/backup.dump
sudo docker compose exec postgres rm /tmp/backup.dump
sudo rm -rf /tmp/restore
```

On a fresh volume, Postgres creates an empty `messaging_app` database on first start. `dropdb` and `createdb` make sure it's blank before the restore. Start only `postgres` here, not the API: the API runs the migrations when it starts, and the tables it would create would collide with the restore. The dump includes the `schemaversions` table, so after the restore the API knows which migrations have already run.

**8. Start everything** from the prebuilt images. This runs `latest`, the newest build of `main`, until step 10 puts the server back on the deployed commit.

```sh
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
```

Open `https://<domain>`, log in with an existing account, and open a channel with old messages. If messages fail to load, check `sudo docker compose logs api`: decryption errors there mean `ENCRYPTION_SECRET_KEY` doesn't match the old one.

**9. Turn the nightly backups back on** on the new server:

```sh
sudo install -m 755 -o root -g root deploy/backup.sh /usr/local/sbin/beacon-backup
sudo install -m 644 deploy/beacon-backup.service deploy/beacon-backup.timer /etc/systemd/system/
sudo install -d -m 700 /etc/beacon
sudo install -m 600 deploy/backup.env.example /etc/beacon/backup.env
sudo nano /etc/beacon/backup.env
sudo systemctl daemon-reload
sudo systemctl start beacon-backup.service
sudo journalctl -u beacon-backup.service --no-pager
sudo systemctl enable --now beacon-backup.timer
```

In `backup.env`, set `BEACON_DIR` and, if you use one, `HEALTHCHECK_URL`. The journal should end with `Backup complete`.

**10. Turn deploys back on.** Follow the [server setup in deployment.md](deployment.md#server) to install `beacon-deploy` and create the `deploy` user with a new key. Then, in the `production` environment on GitHub, update `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` and `DEPLOY_HOST` for the new server ([GitHub setup](deployment.md#github)). Do this step after step 9, because each deploy runs the backup first.

To check it, open the newest Deploy run in the Actions tab and choose **Re-run jobs → deploy**. It should pass, and the server is then on that commit instead of `latest`.

## 6. Troubleshooting

- **`501 NotImplemented` on upload:** rclone is too old; install the current release (section 5, step 2).
- **`AccessDenied` / `403` from rclone:** the R2 token's IP filter doesn't include this server, or the token was deleted.
- **A downloaded dump fails to decrypt or `pg_restore` says it isn't a valid archive:** the crypt password or salt doesn't match the ones used when the backup was made.
- **`Backup failed` in the journal:** the lines above it show which step failed. A failed run isn't retried until the next night; run `sudo systemctl start beacon-backup.service` after fixing it.
- **A dump you need is missing:** dumps are deleted 14 days after upload by the bucket's lifecycle rule.
