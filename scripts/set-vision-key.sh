#!/usr/bin/env bash
#
# Stores a Google Cloud Vision API key on the server so the bib reader can be
# measured against it.
#
#   bash scripts/set-vision-key.sh
#
# You paste the key when it asks. It goes straight from your keyboard into
# /srv/hkp/site/.env.local — never printed, never written to a file on this
# Mac, never put on a command line where other programs could read it, and
# never saved into your shell history.

set -euo pipefail

SERVER="root@80.208.227.234"
KEYFILE="$HOME/.ssh/id_rsa"
ENVFILE="/srv/hkp/site/.env.local"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\033[31m%s\033[0m\n' "$1" >&2; exit 1; }

bold "Storing a Google Cloud Vision key"
echo
echo "Paste the API key from Google Cloud. Nothing appears on screen while you"
echo "paste — that is normal. Then press Enter."
echo

printf 'Vision API key: '
read -rs VISION_KEY
echo
echo

# Checked here, so a wrong paste never leaves this Mac.
case "$VISION_KEY" in
  AIza*) ;;
  "")    fail "Nothing was pasted." ;;
  sk_*|rk_*) fail "That is a Stripe key, not a Google one. A Google API key starts with AIza." ;;
  *)     fail "That does not look like a Google API key — they start with AIza." ;;
esac
[ ${#VISION_KEY} -ge 30 ] || fail "That key looks too short to be complete."

echo "Key looks right. Storing it on the server..."
echo

printf '%s\n' "$VISION_KEY" | ssh -i "$KEYFILE" "$SERVER" '
python3 -c "
import os, sys, time

env_path = \"'"$ENVFILE"'\"
key = sys.stdin.readline().strip()

with open(env_path) as fh:
    lines = fh.read().splitlines()

backup = env_path + \".bak-\" + time.strftime(\"%Y%m%d-%H%M%S\")
with open(backup, \"w\") as fh:
    fh.write(\"\n\".join(lines) + \"\n\")
os.chmod(backup, 0o600)

out, seen = [], False
for line in lines:
    if line.split(\"=\", 1)[0] == \"GOOGLE_VISION_API_KEY\":
        out.append(\"GOOGLE_VISION_API_KEY=\" + key); seen = True
    else:
        out.append(line)
if not seen:
    out.append(\"GOOGLE_VISION_API_KEY=\" + key)

tmp = env_path + \".tmp\"
with open(tmp, \"w\") as fh:
    fh.write(\"\n\".join(out) + \"\n\")
os.chmod(tmp, 0o600)
os.replace(tmp, env_path)

import shutil
shutil.chown(env_path, \"hkp\", \"hkp\")
print(\"  stored, backup saved as \" + os.path.basename(backup))
"'

echo
bold "Done."
echo "Tell Claude the key is in place and it will run the measurement."
