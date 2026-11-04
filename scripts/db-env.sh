#!/usr/bin/env bash
# Writes the local Supabase URL and keys (from the VM) into git-ignored .env.local files
# for the tests of engine-central and for the web app. Keys are the CLI's local defaults.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VM_HOST=192.168.56.10
STATUS="$(ssh -p 2222 -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes xrob@localhost 'cd ~/memo-land && ~/bin/supabase status -o env 2>/dev/null')"
get() { printf '%s\n' "$STATUS" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p"; }

URL="$(get API_URL | sed "s/127.0.0.1/$VM_HOST/")"
ANON="$(get ANON_KEY)"
SERVICE="$(get SERVICE_ROLE_KEY)"
MAIL="$(get MAILPIT_URL | sed "s/127.0.0.1/$VM_HOST/")"

umask 077
printf 'VITE_SUPABASE_URL=%s\nVITE_SUPABASE_ANON_KEY=%s\nSUPABASE_SERVICE_ROLE_KEY=%s\n' "$URL" "$ANON" "$SERVICE" \
  > "$ROOT/packages/engine-central/.env.local"
if [ -d "$ROOT/apps/web" ]; then
  # The web dev server proxies /sb to the VM, so the browser only talks to localhost (also for email links).
  printf 'VITE_SUPABASE_URL=http://localhost:5173/sb\nVITE_SUPABASE_ANON_KEY=%s\nSUPABASE_PROXY_TARGET=%s\n' "$ANON" "$URL" > "$ROOT/apps/web/.env.local"
fi
echo "Supabase API: $URL  ·  mailbox: $MAIL"
