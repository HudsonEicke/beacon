# SSH Keys

How to create an SSH key on a computer and use it to log in to your server. It works for any Linux server, whether it's a fresh one or one that only accepts keys. Each computer gets **its own key**, so losing one computer means removing one line on the server, and every other computer keeps working.

Placeholders used below:

- `<user>`: the server login, e.g. `ubuntu`
- `<server-ip>`: the server's IPv4 address
- `<label>`: a name for this computer's key, e.g. `desktop-windows` or `laptop-mac`

> **The two key files:** `id_ed25519` is the **private** key. It never leaves the computer it was made on: no email, chat, USB stick, cloud folder or git repo. `id_ed25519.pub` is the **public** key. It's safe to copy anywhere, and it's what goes on the server.

## 1. Create the key

### Windows (PowerShell)

```powershell
ssh-keygen -t ed25519 -C "<label>"
```

- Press Enter to accept the default location (`$env:USERPROFILE\.ssh\id_ed25519`).
- **Set a passphrase** and save it in your password manager.
- Keep the key out of OneDrive and other synced folders.

### macOS and Linux (including WSL)

```sh
ssh-keygen -t ed25519 -C "<label>"
```

- Press Enter to accept the default location (`~/.ssh/id_ed25519`).
- **Set a passphrase** and save it in your password manager.
- In WSL, keep the key in your Linux home (`~/.ssh`), not under `/mnt/c`. Windows file permissions don't map properly there, and SSH may refuse the key.

**Check:** the folder should be `700` and the private key `600`. `ssh-keygen` sets this, but if SSH ever complains about permissions:

```sh
chmod 700 ~/.ssh && chmod 600 ~/.ssh/id_ed25519
```

## 2. Add the key to the server

How you do this depends on whether the server still accepts password logins.

### If the server accepts passwords (a new server)

Run this from the computer the key is on. It asks for the server user's password once.

**macOS and Linux:**

```sh
ssh-copy-id -i ~/.ssh/id_ed25519.pub <user>@<server-ip>
```

**Windows** has no `ssh-copy-id`, so append the key with this instead:

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh <user>@<server-ip> "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Once keys from at least two computers work (step 3), turn off password login. For a Beacon server, that's in [self-hosting.md section 5](self-hosting.md#5-secure-the-server).

### If the server only accepts keys

A new computer can't add itself, so add its public key **from a computer that already has access**.

1. Copy the new computer's `.pub` file to a computer that has access. It's public, so any method is fine.
2. From that computer, **append** it to the server:

   **Windows:**

   ```powershell
   type .\<label>.pub | ssh <user>@<server-ip> "cat >> ~/.ssh/authorized_keys"
   ```

   **macOS and Linux:**

   ```sh
   cat <label>.pub | ssh <user>@<server-ip> "cat >> ~/.ssh/authorized_keys"
   ```

   Or log in, run `nano ~/.ssh/authorized_keys`, and paste the key as a new line at the end.

> **Always append with `>>`.** A single `>` replaces the file and removes every other key.

## 3. Test it

From the computer you just added:

```sh
ssh <user>@<server-ip>
```

It should ask for your key's passphrase, not the server's password. The first time, check the fingerprint it shows (your provider's console can show the server's), then type `yes` to trust it.

## 4. Optional: a shortcut name

Add this to `~/.ssh/config`. On Windows that's `$env:USERPROFILE\.ssh\config`; open it with `notepad $env:USERPROFILE\.ssh\config`.

```
Host beacon
    HostName <server-ip>
    User <user>
    IdentityFile ~/.ssh/id_ed25519
```

Then `ssh beacon` connects. Any name works in place of `beacon`.

## Managing keys

**List the keys that can log in** (on the server):

```sh
cat ~/.ssh/authorized_keys
```

Each line is one key, and its label is the last word.

**Remove a computer's access:** delete its line from `~/.ssh/authorized_keys` on the server (`nano ~/.ssh/authorized_keys`). Do this straight away if a computer is lost, stolen or retired.

**Change a key's label** (on the computer that owns the key; it asks for the passphrase):

```powershell
# Windows
ssh-keygen -c -C "<new-label>" -f $env:USERPROFILE\.ssh\id_ed25519
```

```sh
# macOS and Linux
ssh-keygen -c -C "<new-label>" -f ~/.ssh/id_ed25519
```

The key itself doesn't change. Update the label at the end of its line in the server's `authorized_keys` as well.

**Add a passphrase to an existing key:**

```sh
ssh-keygen -p -f ~/.ssh/id_ed25519
```

## If no computer has access

1. Log in through your provider's **web console** (sometimes called KVM or VNC) with the server user's password. The console doesn't use SSH, so it still works.
2. Turn password login back on for a moment. Set `PasswordAuthentication yes` in the file where you turned it off (on a Beacon server, `/etc/ssh/sshd_config.d/00-hardening.conf`), then run `sudo systemctl restart ssh`.
3. From the new computer, add its key as in [step 2 for servers that accept passwords](#if-the-server-accepts-passwords-a-new-server).
4. Set it back to `PasswordAuthentication no`, restart SSH again, and check that password login is refused:

   ```sh
   ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password <user>@<server-ip>
   ```

   This should fail with `Permission denied (publickey)`.

To avoid needing this, keep working keys on at least two computers, and keep the server user's password in your password manager.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Permission denied (publickey)` | The key isn't on the server, or SSH is using a different key. Check the server's `authorized_keys` from a computer that has access, and pass the key explicitly: `ssh -i <path-to-key> <user>@<server-ip>`. |
| `WARNING: UNPROTECTED PRIVATE KEY FILE!` | Fix the permissions (step 1). On Windows, generate the key with `ssh-keygen` instead of copying the file in. |
| `REMOTE HOST IDENTIFICATION HAS CHANGED!` | Expected after **reinstalling** the server. Remove the old entry with `ssh-keygen -R <server-ip>`. If you didn't reinstall, stop and find out why the server's key changed before connecting. |
| A command prints errors about `$env:` while logged in to the server | You ran a command meant for your own computer on the server. Type `exit` to get back to your own computer's prompt. |
