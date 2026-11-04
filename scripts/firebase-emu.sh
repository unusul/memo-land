#!/usr/bin/env bash
# Runs the Firebase CLI with the JDK the emulators need, without changing the global JAVA_HOME.
# Only the demo-memo-land project is used: the demo- prefix keeps the emulators away from real projects.
#   firebase-emu.sh start          → auth + firestore emulators in the foreground
#   firebase-emu.sh test [args]    → engine-google tests against fresh emulators (args go to vitest)
set -euo pipefail

export JAVA_HOME="${FIREBASE_JAVA_HOME:-D:/Work/Programmi/Java/jdk25.0.2_10}"
export PATH="$(cygpath -u "$JAVA_HOME")/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
EMU=(--only auth,firestore --project demo-memo-land)

case "${1:-}" in
  start) exec npx firebase emulators:start "${EMU[@]}" ;;
  test) shift; exec npx firebase emulators:exec "${EMU[@]}" "npm test -w @attivita/engine-google -- $*" ;;
  *) echo "usage: $0 start | test [vitest args]" >&2; exit 2 ;;
esac
