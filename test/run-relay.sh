#!/usr/bin/env bash
# test/run-relay.sh -- ExUnit for the Elixir relay's pure logic.
#
# This repo is not a mix project (main.exs + Code.require_file),
# so each test/relay/*_test.exs is a standalone `elixir` script:
# it starts ExUnit, pulls its module(s) under test in with Code.require_file,
# and ExUnit's at_exit hook runs the cases and sets the exit status.
#
# These need NOTHING running -- they exercise pure functions only (the Origin
# allow-list, start/resize param validation, child-exit decoding). That is
# the opposite of test/run.sh, which brings up an emacs-vent daemon for the
# wire-level flow. A live emacs-vent + relay + PTY run is a separate job.
#
# Needs the devShell's Elixir/OTP 27 AND its BEAM deps on ERL_LIBS (cowboy,
# erlexec, ...). Run it from inside `nix develop`, or just run it directly:
# when cowboy is not on the code path it re-execs itself once through
# `nix develop --command`. (Neither `elixir` on PATH nor IN_NIX_SHELL is a
# reliable signal -- a stray host Elixir, or a different project's nix shell,
# has one without the other. Probing for cowboy.app is what actually matters.)
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
self="$here/$(basename "$0")"
cd "$here/.."

have_cowboy() {
  command -v erl >/dev/null 2>&1 &&
    erl -noshell -eval 'halt(case code:where_is_file("cowboy.app") of non_existing -> 1; _ -> 0 end).' \
      >/dev/null 2>&1
}

if ! have_cowboy; then
  if [ -n "${TEZCATL_RELAY_TEST_REEXEC:-}" ]; then
    echo "run-relay.sh: cowboy still not on the code path after 'nix develop'." >&2
    exit 1
  fi
  export TEZCATL_RELAY_TEST_REEXEC=1
  exec nix develop --command "$self" "$@"
fi

shopt -s nullglob
files=(test/relay/*_test.exs)
if [ ${#files[@]} -eq 0 ]; then
  echo "run-relay.sh: no test/relay/*_test.exs found" >&2
  exit 1
fi

status=0
for f in "${files[@]}"; do
  echo "=== $f ==="
  elixir "$f" || status=1
done

exit "$status"
