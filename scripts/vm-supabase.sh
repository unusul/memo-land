#!/usr/bin/env bash
# Runs the Supabase CLI inside the UbuntuDocker VM (Docker Desktop does not run on this PC).
# Copies ./supabase to ~/memo-land/supabase in the VM first, then runs: supabase <args>.
# The services are reachable from Windows at http://192.168.56.10:54321.
set -euo pipefail

VM_SSH=(ssh -p 2222 -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes xrob@localhost)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

"${VM_SSH[@]}" 'rm -rf ~/memo-land/supabase/migrations ~/memo-land/supabase/tests && mkdir -p ~/memo-land'
tar -C "$ROOT" -czf - supabase/config.toml supabase/migrations $( [ -d "$ROOT/supabase/tests" ] && echo supabase/tests ) $( [ -f "$ROOT/supabase/seed.sql" ] && echo supabase/seed.sql ) \
  | "${VM_SSH[@]}" 'tar -C ~/memo-land -xzf -'
"${VM_SSH[@]}" "cd ~/memo-land && ~/bin/supabase $*"
