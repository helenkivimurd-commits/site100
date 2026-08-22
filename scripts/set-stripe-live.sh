#!/usr/bin/env bash
#
# Switches the live site from Stripe test keys to live keys.
#
#   bash scripts/set-stripe-live.sh
#
# You paste the two values when it asks. They go straight from your keyboard
# into /srv/hkp/site/.env.local on the server — they are never printed, never
# written to a file on this Mac, never put in the command line (where `ps` could
# see them), and never saved into your shell history.
#
# Re-runnable. It backs up .env.local on the server before changing anything,
# and tells you the backup's name.

set -euo pipefail

SERVER="root@80.208.227.234"
KEYFILE="$HOME/.ssh/id_rsa"
ENVFILE="/srv/hkp/site/.env.local"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\033[31m%s\033[0m\n' "$1" >&2; exit 1; }

bold "Switching h_kivimurd Photography to LIVE Stripe keys"
echo
echo "You need two values from the Stripe dashboard, both with test mode OFF:"
echo "  1. the live secret key       — starts with rk_live_ (restricted) or sk_live_"
echo "  2. the live signing secret   — starts with whsec_"
echo
echo "Nothing appears on screen while you paste. That is normal — keep going"
echo "and press Enter."
echo

printf 'Live secret key: '
read -rs SECRET_KEY
echo
printf 'Live webhook signing secret: '
read -rs WEBHOOK_SECRET
echo
echo

# Checked here rather than on the server, so a wrong paste never leaves this Mac.
# rk_live_ is a restricted key, which is what this site should normally use:
# it only needs Checkout Sessions write, and the Stripe account is a shared
# company one, so a full-access key on this server would be over-privileged.
# sk_live_ is accepted too.
case "$SECRET_KEY" in
  rk_live_*) KEY_KIND="restricted live key" ;;
  sk_live_*) KEY_KIND="standard live key" ;;
  rk_test_*|sk_test_*) fail "That is a TEST key. Turn test mode OFF in Stripe and copy the live one." ;;
  pk_*)      fail "That is the publishable key (pk_). This site needs the secret key (sk_live_ or rk_live_)." ;;
  "")        fail "Nothing was pasted for the secret key." ;;
  *)         fail "That does not look like a Stripe secret key — it should start with rk_live_ or sk_live_." ;;
esac

case "$WEBHOOK_SECRET" in
  whsec_*) ;;
  sk_*)    fail "That is an API key, not the webhook signing secret. The signing secret starts with whsec_." ;;
  "")      fail "Nothing was pasted for the signing secret." ;;
  *)       fail "That does not look like a signing secret — it should start with whsec_." ;;
esac

echo "Both values look right ($KEY_KIND). Updating the server..."
echo

# The two secrets travel on stdin. The command line below holds only code, so
# they never appear in the server's process list.
printf '%s\n%s\n' "$SECRET_KEY" "$WEBHOOK_SECRET" | ssh -i "$KEYFILE" "$SERVER" '
python3 -c "
import os, sys, time

env_path = \"'"$ENVFILE"'\"
secret_key = sys.stdin.readline().strip()
webhook_secret = sys.stdin.readline().strip()

with open(env_path) as fh:
    lines = fh.read().splitlines()

backup = env_path + \".bak-\" + time.strftime(\"%Y%m%d-%H%M%S\")
with open(backup, \"w\") as fh:
    fh.write(\"\n\".join(lines) + \"\n\")
os.chmod(backup, 0o600)

wanted = {\"STRIPE_SECRET_KEY\": secret_key, \"STRIPE_WEBHOOK_SECRET\": webhook_secret}
seen = set()
out = []
for line in lines:
    key = line.split(\"=\", 1)[0] if \"=\" in line else None
    if key in wanted:
        out.append(key + \"=\" + wanted[key])
        seen.add(key)
    else:
        out.append(line)
for key, value in wanted.items():
    if key not in seen:
        out.append(key + \"=\" + value)

tmp = env_path + \".tmp\"
with open(tmp, \"w\") as fh:
    fh.write(\"\n\".join(out) + \"\n\")
os.chmod(tmp, 0o600)
os.replace(tmp, env_path)

import shutil
shutil.chown(env_path, \"hkp\", \"hkp\")
print(\"  .env.local updated, backup saved as \" + os.path.basename(backup))
"
systemctl restart hkp
sleep 5
printf "  service: "; systemctl is-active hkp
printf "  mode now: "; grep -oE "^STRIPE_SECRET_KEY=(sk|rk)_[a-z]*" '"$ENVFILE"' | sed "s/.*_//"
'

echo
bold "Done."
echo
echo "Now make one real purchase with a real card to prove it end to end."
echo "Check afterwards that:"
echo "  - the payment shows in Stripe with test mode OFF"
echo "  - the receipt email arrives"
echo "  - the download link in it works"
echo
echo "To go back to test keys, restore the backup named above and run:"
echo "  ssh root@80.208.227.234 'systemctl restart hkp'"
