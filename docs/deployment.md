# Deployment

Every push to `main` is tested, built and deployed by the **Deploy** workflow (`.github/workflows/deploy.yml`). Pushes that only change docs, Markdown files, the Postman collection or the license are skipped.

```
push to main
  ├─ Backend tests  ─┐
  ├─ Frontend tests ─┼─→ publish: build the api and web images, push them to GHCR
  └─ E2E tests ──────┘     tagged with the commit SHA and latest
                              └─→ deploy: SSH to the server, which runs beacon-deploy <sha>
```

On the server, `deploy/beacon-deploy.sh` (installed as `/usr/local/sbin/beacon-deploy`):

1. checks that the SHA is a commit on `origin/main`, and refuses anything else
2. runs the backup service, and stops if the backup fails
3. checks out that commit (detached), so `compose.yaml` matches the images
4. writes `BEACON_VERSION=<sha>` to `release.env` (`.env` is never touched)
5. pulls the `api` and `web` images for that commit and restarts them. The API applies any new [migrations](database-migrations.md) as it starts.
6. waits up to a minute for `/api/health` to return 200 over HTTPS
7. removes images that have been unused for a week

Runs go one at a time, in push order. If several pushes land during a run, only the newest waits, since it includes the others.

The repo is public, so **workflow logs are public**. The deploy script prints its steps but never the app's logs.

## Rolling back

In the Actions tab, open the Deploy run of the commit you want, then **Re-run jobs → deploy**. Its images are still in GHCR, so nothing is rebuilt.

A rollback doesn't undo migrations, so the older version runs against the newer schema. See the rules in [database-migrations.md](database-migrations.md).

## When a deploy fails

- **Before "Starting":** nothing changed for the running app. Fix the cause and re-run the job.
- **Health check failed:** the new version is running but not healthy. On the server, check `sudo docker compose logs api`, then fix forward or roll back.

## Running Compose by hand on the server

Compose reads only `.env` by default, so plain `docker compose up -d` uses the `latest` images, which come from the newest successful build of `main`. To stay on the deployed commit, pass both files:

```sh
sudo docker compose --env-file .env --env-file release.env up -d
```

After the first deploy, `git status` on the server shows a detached HEAD. That's expected. Don't `git pull` there, because the deploy script manages the checkout.

## One-time setup

### Server

Copy `deploy/beacon-deploy.sh`, `deploy/deploy.env.example` and `deploy/beacon-deploy.sudoers` from the repo, then install them:

```sh
sudo install -m 755 -o root -g root deploy/beacon-deploy.sh /usr/local/sbin/beacon-deploy
sudo install -d -m 700 /etc/beacon
sudo install -m 600 deploy/deploy.env.example /etc/beacon/deploy.env
sudo nano /etc/beacon/deploy.env
sudo visudo -cf deploy/beacon-deploy.sudoers
sudo install -m 440 -o root -g root deploy/beacon-deploy.sudoers /etc/sudoers.d/beacon-deploy
```

The sudoers file must be installed **without a dot in its name**, or sudo ignores it.

Create the `deploy` user. It has no password and isn't in the `docker` group (membership there is equivalent to root). It can only run `beacon-deploy`.

```sh
sudo adduser --disabled-password --gecos "" deploy
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
```

Create a key for GitHub Actions. It has no passphrase, since nobody is there to type one:

```sh
ssh-keygen -t ed25519 -N "" -C github-actions-deploy -f ~/github-deploy
cat ~/github-deploy.pub
sudo nano /home/deploy/.ssh/authorized_keys
```

In `authorized_keys`, put the public key after these options, all on one line:

```
restrict,command="sudo /usr/local/sbin/beacon-deploy \"$SSH_ORIGINAL_COMMAND\"" ssh-ed25519 AAAA... github-actions-deploy
```

`command=` makes every login with this key run the deploy script and nothing else. `restrict` turns off terminals and forwarding.

```sh
sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

If `/etc/ssh/sshd_config.d/` has an `AllowUsers` line, add `deploy` to it and restart SSH.

Check that the key works and is locked down:

```sh
ssh -i ~/github-deploy -o IdentitiesOnly=yes deploy@<server-ip>
```

It should print `usage: beacon-deploy <full 40-character commit SHA>` and disconnect. If you're asked for a password, or get a shell, the key or its options aren't set up right.

### GitHub

In the repo's **Settings → Environments**, create `production`:

- **Deployment branches and tags:** Selected branches and tags → `main`
- **Secrets:**
  - `DEPLOY_SSH_KEY`: the whole private key, from `cat ~/github-deploy`
  - `DEPLOY_KNOWN_HOSTS`: the server's host key, built on the server so it can be trusted:
    ```sh
    echo "<server-ip> $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
    ```
- **Variables:** `DEPLOY_HOST` = `<server-ip>`

Then delete the key from the server, since GitHub has the only copy it needs:

```sh
shred -u ~/github-deploy ~/github-deploy.pub
```

### Container images

The first publish creates the `beacon-api` and `beacon-web` packages. They take the repo's visibility, so in this public repo they're public, and the server pulls them without logging in. Nothing needs setting up.

If the packages are private (for example, published from a private fork), the deploy fails at "Pulling images". For each package, go to **Package settings → Change visibility → Public**, then re-run the deploy job.
