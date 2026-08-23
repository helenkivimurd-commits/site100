# Going live

Target: a small Linux VPS (Hetzner CX22 or similar, ~€4/month). Pick
**Falkenstein** or **Helsinki** — both EU, both close to Estonia.

Serverless hosts (Vercel, Netlify) will **not** work: this app writes to disk
for uploads and orders, and their filesystems are read-only at runtime.

Throughout, replace `kivimurd.ee` with your domain.

---

## 1. Create the GitHub repository

Sign up at <https://github.com/signup> if you haven't, then create a
**private** repository named `site`. Private matters — the repo doesn't contain
secrets, but it does contain your whole business logic.

Then, on your Mac:

```bash
cd /Users/kristjan/Downloads/site
git remote add origin https://github.com/YOUR_USERNAME/site.git
git push -u origin main
```

GitHub will ask for a password — use a **personal access token**, not your
account password. Create one at <https://github.com/settings/tokens>, scope
`repo`.

## 2. Create the server

Create an Ubuntu 24.04 VPS. Add your SSH key during creation. Then:

```bash
ssh root@YOUR_SERVER_IP

adduser --system --group --home /srv/hkp hkp
apt update && apt upgrade -y
apt install -y curl git ufw

curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs

ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 3. Install Caddy (this is what gives you HTTPS)

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

**Point your domain's A record at the server IP before the next step** —
Caddy proves it owns the domain over HTTP to get the certificate.

## 4. Deploy the app

```bash
cd /srv/hkp
git clone https://github.com/YOUR_USERNAME/site.git
cd site
npm ci
npm run build
chown -R hkp:hkp /srv/hkp
```

## 5. Secrets

```bash
cp .env.local.example .env.local
nano .env.local
chmod 600 .env.local
chown hkp:hkp .env.local
```

Fill in:

| Variable | Value |
|---|---|
| `ADMIN_PASSWORD` | A **new** one. Generate with `openssl rand -base64 24` |
| `B2_BUCKET` | Your bucket name |
| `B2_ENDPOINT` | `https://s3.<region>.backblazeb2.com`, from the bucket details |
| `B2_REGION` | The region in that endpoint, e.g. `eu-central-003` |
| `B2_KEY_ID` | B2 → Application Keys. Restrict the key to this one bucket |
| `B2_APP_KEY` | The secret half. **Shown once, at creation** |
| `STRIPE_SECRET_KEY` | Your `sk_live_…` key |
| `STRIPE_WEBHOOK_SECRET` | From step 7 |
| `NEXT_PUBLIC_BASE_URL` | `https://kivimurd.ee` — https, no trailing slash |
| `RESEND_API_KEY` | Optional, for confirmation emails |

Do **not** reuse the development admin password. It has been typed over plain
HTTP on your laptop.

## 6. Start it

```bash
cp /srv/hkp/site/deploy/hkp.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now hkp

cp /srv/hkp/site/deploy/Caddyfile /etc/caddy/Caddyfile
# edit the domain in that file first
systemctl reload caddy

systemctl status hkp --no-pager
```

Visit `https://kivimurd.ee`. The certificate appears within seconds.

## 7. Stripe live webhook

In the Stripe dashboard (**live mode**, not test) go to
**Developers → Webhooks → Add endpoint**:

- URL: `https://kivimurd.ee/api/stripe/webhook`
- Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`

Copy the signing secret into `.env.local`, then `systemctl restart hkp`.

## 8. Upload the photos

Originals go to the B2 bucket, **not** to the server — that is what keeps a
40 GB VPS disk from filling up after one race.

For an existing archive, upload straight from your Mac with `rclone`. Objects
must be keyed `originals/<photo-id>.<ext>`, where the photo id is the filename
lowercased with the extension stripped — that is what `findOriginal()` matches
on.

```bash
# one-time: configure a remote called "b2" with your key id and app key
rclone config

# then, from the folder holding the originals
rclone copy . b2:YOUR_BUCKET/originals/ --progress --transfers 8
```

Verify the count before trusting it:

```bash
rclone size b2:YOUR_BUCKET/originals/
```

After that, use `https://kivimurd.ee/admin` to upload and tag — new uploads go
to the bucket on their own.

## 9. Backups — do not skip this

The B2 bucket, `/srv/hkp/data/photos.json` and `.data/orders.json` are the business.
Losing the orders file means paying customers can no longer download.

```bash
cat > /etc/cron.daily/hkp-backup <<'SH'
#!/bin/sh
d=/srv/hkp/backups/$(date +%F)
mkdir -p "$d"
cp /srv/hkp/data/photos.json "$d/"
cp /srv/hkp/site/.data/orders.json "$d/" 2>/dev/null
find /srv/hkp/backups -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +
SH
chmod +x /etc/cron.daily/hkp-backup
```

That covers the small files. B2 keeps its own redundant copies, so a failed
disk won't lose the originals — but it will faithfully replicate a mistaken
deletion. **The originals are irreplaceable: keep them on your Mac and an
external drive as well.** Consider switching on Object Lock or lifecycle
versioning on the bucket so an accidental delete is recoverable.

---

## Deploying a change later

```bash
# on your Mac
git add -A && git commit -m "what changed" && git push

# on the server
cd /srv/hkp/site && git pull && npm ci && npm run build
systemctl restart hkp
```


**Do not deploy while photos are uploading.** The last step restarts the app,
and an upload in progress is writing the catalogue; a restart mid-upload loses
that photo, and before the write was made atomic could have truncated the whole
catalogue. Let the upload finish first. A few thousand photos take a few hours,
since the admin uploads them one at a time.

**Live data is not in this directory.** The catalogue is `/srv/hkp/data/photos.json`
and the renders are under `/srv/hkp/renders/`, both deliberately outside the git
working tree — `git clean -fd` in `/srv/hkp/site` once deleted every render, and
`git reset --hard` would reset a catalogue kept in the repo to empty. Nothing in
`/srv/hkp/site` needs preserving across a deploy except `.env.local`.

If the renders are ever lost again, they rebuild from the B2 originals:

```
cd /srv/hkp/site && node --env-file=.env.local scripts/rebuild-renders.mjs
```

There are a few seconds of downtime on restart. Fine at this scale.

---

## Rules this setup depends on

**One process only.** `photos.json`, `orders.json` and the rate limiter are all
guarded in memory. A second process silently corrupts the first two and doubles
the third. Never add PM2 cluster mode or a second container without moving that
state to a database first.

**Node stays on 127.0.0.1.** The rate limiter trusts `X-Forwarded-For`, which
only Caddy may set. Exposing port 3000 publicly lets anyone forge it.

**HTTPS before you ever open `/admin`.** The password is sent base64-encoded,
which is trivially reversed.

## Still outstanding before real customers

- GDPR: `.data/orders.json` holds customer emails. Decide how long you keep
  them and how you delete on request
- A refund policy page — Stripe asks for the URL
- VAT: Stripe Tax is not switched on
- No `charge.refunded` webhook, so refunds don't revoke download links

## Reading bib numbers automatically

`hkp-bibscan.timer` runs `scripts/bib-scan.mjs` every five minutes. It picks up
photos that have no bib and have not been reviewed, reads the original out of
the B2 bucket, and fills in a number when it is confident enough.

Measured against 60 photos tagged by hand, at the thresholds in that script:
**48% of photos get a correct bib, 7% get a wrong one, 47% are left blank.**
So it removes about half the typing and never claims to do more.

It will not overwrite a bib typed by hand, will not touch a reviewed photo, and
never marks anything reviewed — every photo still has to be looked at. It saves
through the app's own PATCH endpoint rather than writing the catalogue file, so
its writes queue behind uploads instead of racing them.

    systemctl status hkp-bibscan.timer      # is it running
    journalctl -u hkp-bibscan -n 50         # what it has been doing
    systemctl start hkp-bibscan.service     # scan now, do not wait

To try a threshold change without saving anything:

    cd /srv/hkp/site && DRY_RUN=1 node --env-file=.env.local scripts/bib-scan.mjs

`/srv/hkp/data/ocr-seen.json` records which photos have already been looked at.
Delete it to have everything scanned again. To turn the whole thing off:

    systemctl disable --now hkp-bibscan.timer
