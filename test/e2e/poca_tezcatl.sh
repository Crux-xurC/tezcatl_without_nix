#!/usr/bin/env bash
# test/e2e/poca_tezcatl.sh -- the stack's pages and relay, as a box row of a
# test Poca starts them (poca_gate.mjs): POCA_SECRET comes from that Poca, so
# the relay checks it (D-poca-secret). The same settings as stack.sh's relay,
# without TEZCATL_AUTH=off. Stays in the foreground; Poca stops the group.
#
# This repository's own replacement of tezcatl's (sync/replaced.txt; upstream's
# is sync/upstream/test/e2e/poca_tezcatl.sh): no Nix, the relay from this
# repository's _build serving the pages itself (as stack.sh here).
set -u
here="$(cd "$(dirname "$0")" && pwd)"
tz="$(cd "$here/../.." && pwd)"
E2E_DIR="${E2E_DIR:-${TMPDIR:-/tmp}/tezcatl-e2e}"
PAGES_PORT="${PAGES_PORT:-4021}"
RELAY_PORT="${RELAY_PORT:-4101}"
VENT_PORT="${VENT_PORT:-4099}"

cd "$E2E_DIR/relay" && exec env ERL_LIBS="$tz/_build/dev/lib" ELIXIR_ERL_OPTIONS="+fnu" PATH="$tz/lsp/bin:$PATH" \
  TEZCATL_PAGES_PORT="$PAGES_PORT" TEZCATL_PAGES_DIR="$E2E_DIR/pages" \
  TEZCATL_RELAY_PORT="$RELAY_PORT" TEZCATL_VENT_PORT="$VENT_PORT" \
  TEZCATL_FS_ROOT="$E2E_DIR/fsroot" TEZCATL_MIRROR_DIR="$E2E_DIR/mirror" TEZCATL_WORK_DIR="$E2E_DIR/work" \
  TEZCATL_IDS_DIR="$E2E_DIR/ids" TEZCATL_ALLOWED_ORIGINS="http://127.0.0.1:$PAGES_PORT" XIPE_TOTEC_LSP=off \
  elixir --no-halt -e '{:ok, _} = Application.ensure_all_started(:tezcatl_relay)' >"$E2E_DIR/poca-relay.log" 2>&1
