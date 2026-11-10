#!/usr/bin/env bash
# test/run.sh -- bring the emacs-vent loop up, then run the Tezcatl tests.
#
# The unit tests (`node --test test/*.test.js') are self-contained and need
# nothing running. This script is for the wire-level / manual-E2E flow and
# for the "one command starts the whole loop" habit: it launches the
# emacs-vent harness on 127.0.0.1:4000, waits for it, runs the unit tests,
# then stops the Emacs it started (an already-running vent is left alone).
#
# Override the launch for your own setup by exporting TEZCATL_EMACS_CMD:
#   TEZCATL_EMACS_CMD='emacs -Q -l ~/src/emacs-vent/init.el --fg-daemon' ./test/run.sh
# Other knobs: TEZCATL_VENT_PORT (default 4000).
#
# Default launch: when a directory editor/emacs sits beside this repository
# (../editor/emacs, a flake building an Emacs that loads emacs-vent), run its
# emacs-vent app (Emacs -Q --load its init.el) as a foreground daemon. init.el decides where emacs-vent's
# elisp comes from (a local dir today). Otherwise fall back to a plain
# `emacs' on PATH loading ~/dev/emacs-vent/init.el.
set -euo pipefail
cd "$(dirname "$0")/.."

vent_host=127.0.0.1
vent_port="${TEZCATL_VENT_PORT:-4000}"

editor_emacs="$(cd .. 2>/dev/null && pwd)/editor/emacs"
if [ -e "$editor_emacs/flake.nix" ]; then
  default_cmd="nix run $editor_emacs -- --fg-daemon"
else
  default_cmd="emacs -Q -l $HOME/dev/emacs-vent/init.el --fg-daemon"
fi
: "${TEZCATL_EMACS_CMD:=$default_cmd}"

port_open() { (exec 3<>"/dev/tcp/$vent_host/$vent_port") 2>/dev/null; }

started=""
if port_open; then
  echo "run.sh: emacs-vent already up on $vent_host:$vent_port"
else
  echo "run.sh: starting emacs-vent -> $TEZCATL_EMACS_CMD"
  setsid bash -c "$TEZCATL_EMACS_CMD" >/tmp/tezcatl-vent.log 2>&1 &
  started=$!
  ok=""
  for _ in $(seq 1 60); do
    if port_open; then ok=1; break; fi
    sleep 0.5
  done
  if [ -z "$ok" ]; then
    echo "run.sh: emacs-vent did not open $vent_host:$vent_port (see /tmp/tezcatl-vent.log)" >&2
    [ -n "$started" ] && kill -- "-$started" 2>/dev/null || true
    exit 1
  fi
fi

cleanup() { [ -n "$started" ] && kill -- "-$started" 2>/dev/null || true; }
trap cleanup EXIT

node --test test/*.test.js
