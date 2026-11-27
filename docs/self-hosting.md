# Self-Hosting

> **Status: the installer is planned and coming soon.** This page lists what you'll need to set up before running it, so you can prepare ahead of time. Until it's ready, you can [install by hand](#6-install-by-hand-until-the-installer-is-ready).

The installer sets up the app on a fresh server in one run. It can't create accounts with outside services for you, so a few things (a domain, and optionally file storage) are set up by hand first. For each optional piece, the installer asks whether you want it, shows the steps from this page, and then checks that everything works before continuing.

## 1. Server

- [ ] A VPS or dedicated server running **Ubuntu 26.04 or 24.04 LTS**, or **Debian 12+**
- [ ] At least **2 vCPU and 2 GB RAM** (4 GB recommended)
- [ ] A **public IPv4 address**
- [ ] SSH access as a user with `sudo`
- [ ] Ports **80** and **443** (TCP) open to the internet, including in your provider's firewall if it has one. Opening **443 (UDP)** too is optional, and lets browsers use HTTP/3.

Choose a server region close to your users. Voice and video (planned) use a lot of outbound bandwidth, so a provider with generous or unmetered bandwidth will keep costs down.

## 2. Domain (required)

A domain is needed for HTTPS. Browsers only allow microphone, camera and screen-share access on HTTPS sites, so without a domain those features won't work.

- [ ] Buy a domain or pick a subdomain of one you own, e.g. `chat.example.com`
- [ ] Create an **A record** pointing it at your server's public IPv4 address (the installer prints this)
- [ ] Don't create an **AAAA record** unless your server is set up for IPv6. Otherwise certificate requests can fail.
- [ ] If your DNS is on Cloudflare, set the record to **DNS only** (grey cloud) for the install, so the server can get its HTTPS certificate directly
- [ ] Wait for the record to take effect. Check with `dig +short chat.example.com`, which should print your server's IP.

HTTPS certificates are obtained and renewed automatically, with no email or account needed. Let's Encrypt no longer sends expiry warning emails, so set up the uptime monitor in section 5 to find out if HTTPS ever stops working.

The installer checks that the domain points at the server before it requests a certificate.

## 3. File storage (optional)

> File uploads aren't in Beacon yet. This section applies once they are, and is here so you can plan ahead.

By default, files are stored on the server's own disk. That's fine for small instances. Use S3-compatible storage if you'd rather not depend on the server's disk space, or want files kept separate from the server.

### Local disk (default)

- [ ] Nothing to set up. Files are kept in a Docker volume and should be included in your backups.

### S3-compatible storage

Works with any S3-compatible provider. Common choices:

- **Cloudflare R2** has no download (egress) fees and a free tier.
- **Backblaze B2** is cheap per GB stored.
- **Amazon S3** is the original and very reliable, but downloads are charged per GB beyond AWS's free monthly allowance, which adds up if people download files often.

Checklist:

- [ ] Create a **bucket** for this instance only. Keep it **private**, with no public access.
- [ ] Create an **API key/token** with **read and write access to that bucket only**
  - R2: *R2 → Manage API tokens → Create API token*, permission *Object Read & Write*, limited to the bucket
  - B2: *Application Keys → Add a New Application Key*, access limited to the bucket
  - Amazon S3: in *IAM*, create a user with a policy allowing `s3:GetObject`, `s3:PutObject` and `s3:DeleteObject` on `arn:aws:s3:::<bucket>/*`, then create an access key for that user. Don't use your root account's keys.
- [ ] Add a **CORS rule** to the bucket so browsers can upload to it directly:
  - Allowed origin: `https://chat.example.com` (your domain)
  - Allowed methods: `GET`, `PUT`
  - Allowed headers: `Content-Type`
- [ ] Write these down. The installer will ask for them:
  - **Endpoint URL**, e.g. R2: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, B2: shown on the bucket's page, Amazon S3: `https://s3.<region>.amazonaws.com`
  - **Bucket name**
  - **Access key ID** and **secret access key**
  - **Region**, if your provider needs one (R2 uses `auto`; for Amazon S3 use the bucket's region, e.g. `us-east-1`)

The installer tests the credentials with a small upload, a download, and a delete before saving them.

You can switch from local disk to S3 later by running the installer again. Files that were already uploaded aren't moved automatically.

## 4. What the installer asks

| Prompt | Default | Notes |
|---|---|---|
| Domain | none (required) | Must already point at this server |
| File storage | `local` | `local` or `s3`. For `s3`, see the checklist above |

Secrets such as database passwords and encryption keys are **generated automatically** and saved to `.env`. Running the installer again keeps them. **Don't delete or regenerate `.env`.** Losing the encryption key makes encrypted data in the database unreadable for good.

## 5. Secure the server

The installer doesn't change your SSH or firewall settings, because a mistake there can lock you out. Do these yourself, ideally before installing.

> **If you get locked out:** most VPS providers have a **web console** (sometimes called KVM or VNC) in their dashboard that works without SSH. Find it before you start.

### Required

- [ ] **Turn on 2FA** for your VPS provider, domain registrar, and DNS/storage accounts (e.g. Cloudflare). Anyone who gets into these can take over or wipe your server without touching SSH.
- [ ] **Create a non-root user with sudo**, using a strong password. You'll still need the password for `sudo` after switching to key login.
  ```sh
  adduser <name>
  usermod -aG sudo <name>
  ```
- [ ] **Set up SSH keys**, protected with a passphrase, following [ssh-keys.md](ssh-keys.md). Each computer gets its own key, so add keys from at least two computers. Then losing one doesn't lock you out.
- [ ] **Turn off password login and root login.** Create `/etc/ssh/sshd_config.d/00-hardening.conf` containing:
  ```
  PasswordAuthentication no
  KbdInteractiveAuthentication no
  PermitRootLogin no
  ```
  SSH uses the first value it reads for each setting, and reads this folder in name order. The `00-` prefix makes these settings win over files that some images ship, which turn password login back on (e.g. `50-cloud-init.conf`). Check the config, restart SSH, and check the settings actually in effect:
  ```sh
  sudo sshd -t
  sudo systemctl restart ssh
  sudo sshd -T | grep -E 'passwordauthentication|kbdinteractiveauthentication|permitrootlogin'
  ```
  **Before closing your current session, test logging in from a second terminal.**
- [ ] **Turn on the firewall**, allowing only SSH and web traffic. Allow SSH *before* enabling it:
  ```sh
  sudo ufw allow 22/tcp
  sudo ufw allow 80,443/tcp
  sudo ufw allow 443/udp
  sudo ufw enable
  ```
  If your provider has a network firewall in its dashboard, set the same rules there too.
- [ ] **Turn on automatic security updates, including reboots.** Without reboots, kernel updates install but the old kernel keeps running.
  ```sh
  sudo apt install unattended-upgrades
  sudo dpkg-reconfigure -plow unattended-upgrades
  ```
  Then create `/etc/apt/apt.conf.d/52unattended-upgrades-local` containing the lines below. Use a separate file rather than editing `50unattended-upgrades`, which package updates can replace.
  ```
  Unattended-Upgrade::Automatic-Reboot "true";
  Unattended-Upgrade::Automatic-Reboot-Time "09:00";
  ```
  The time is in the server's time zone, usually UTC. Pick a quiet hour that doesn't overlap the nightly backup at 08:00 UTC. Check the settings with `apt-config dump | grep Automatic-Reboot`.

> ⚠️ **Docker skips `ufw`.** Any port listed under `ports:` in a Compose file is reachable from the internet, even if `ufw` blocks it. The app's Compose file only publishes Caddy's ports (80, and 443 over TCP and UDP). If you add your own services, don't publish their ports, or bind them to `127.0.0.1` (e.g. `127.0.0.1:8080:8080`). Also never mount `/var/run/docker.sock` into a container you don't fully trust, because it gives that container root access to the server.

### Recommended

- [ ] **fail2ban** blocks IPs after repeated failed logins. With key-only SSH this mostly cuts log noise, but it's a cheap extra layer. On Debian 12+, set `backend = systemd` for the `sshd` jail in `/etc/fail2ban/jail.local`.
  ```sh
  sudo apt install fail2ban
  ```
- [ ] **Monitoring:** a free uptime monitor (e.g. UptimeRobot) tells you if the site goes down. A check-in service (e.g. healthchecks.io) tells you if your nightly backup stops running. The backup script pings it when you set `HEALTHCHECK_URL` in `/etc/beacon/backup.env`.
- [ ] **Check what's listening** after setup. Anything you don't recognise should be turned off.
  ```sh
  sudo ss -tulpn
  ```

### A note on Cloudflare Tunnels

Tunnels let you reach a server without opening ports, and work well for websites. But they only carry HTTP-style traffic, not the **UDP** traffic voice and video use (WebRTC). The web app could run behind a tunnel, but voice and video (planned) would still need open ports on the server. The default setup here doesn't use a tunnel.

## 6. Install by hand (until the installer is ready)

This gets the same result as the installer will, using the prebuilt images. Do sections 1, 2 and 5 first.

**1. Install Docker** from Docker's own apt repository, following [Docker's guide for Ubuntu](https://docs.docker.com/engine/install/ubuntu/) or [for Debian](https://docs.docker.com/engine/install/debian/). Ubuntu's `docker.io` package is often behind and doesn't include the Compose plugin.

**2. Get the app and create `.env`:**

```sh
git clone https://github.com/HudsonEicke/beacon.git ~/beacon
cd ~/beacon
cp .env.example .env
chmod 600 .env
for key in POSTGRES_PASSWORD JWT_SECRET_KEY ENCRYPTION_SECRET_KEY; do
  sed -i "s/^$key=.*/$key=$(openssl rand -hex 32)/" .env
done
nano .env    # set DOMAIN to your domain, without https://, e.g. chat.example.com
```

Save the three generated secrets in your password manager now. See [what to keep](backups.md#2-what-to-keep-in-your-password-manager).

**3. Start it:**

```sh
sudo docker compose pull
sudo docker compose up -d
```

The API creates the database schema on its first start, and Caddy gets the HTTPS certificate. Check that it's up:

```sh
curl -fsS https://<your domain>/api/health    # prints Healthy
```

**Updating:** `latest` is the newest build of Beacon's `main` branch, since there are no versioned releases yet. Back up first, because database changes can't be undone. Then:

```sh
cd ~/beacon
git pull
sudo docker compose pull
sudo docker compose up -d
```

`git pull` keeps `compose.yaml` in step with the images. Database changes are applied automatically when the API starts.

## 7. After installing

- [ ] Open `https://<your domain>`, register an account, and send a message
- [ ] Set up the **nightly backup** of the database (and the file volume, once you use local storage), with at least one copy kept off the server. [backups.md](backups.md) covers `deploy/backup.sh`, which uploads each dump to an rclone remote. Use an rclone crypt remote so the dumps are encrypted.
- [ ] Test **restoring** a backup once, so you know it works ([backups.md section 3](backups.md#3-test-a-restore))
- [ ] **Updating:** the installer will come with an update command. Until then, follow the steps in section 6.
