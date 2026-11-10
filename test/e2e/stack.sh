#!/usr/bin/env bash
# This repository's own replacement of tezcatl's test/e2e/stack.sh (sync/replaced.txt;
# upstream's is sync/upstream/test/e2e/stack.sh): the same stack without Nix.
# The relay runs from this repository's _build (mix compile first, here), its
# dependencies on ERL_LIBS as the dev shell had them, and serves the pages
# itself (app/pages.ex) instead of python3. Xipe Totec and the fake Xipe server
# use the same ERL_LIBS. `emacs` uses the Emacs on PATH (EMACS to choose one).
#
# test/e2e/stack.sh up|down|restart-fake|emacs -- an isolated stack for the headless-Chromium
# checks in this directory. Never touches the real one (:4000
# Emacs, :4100 relay, :4001 pages, xipe_totec's own tables/).
#
#   pages    :PAGES_PORT   a shadow of this repo (symlinks) whose config.json
#                          points at the test relay; served by the relay's VM
#   relay    :RELAY_PORT   this repo's relay (app/application.ex), cwd = $E2E_DIR/relay (own
#                          xipe.json), FS root = $E2E_DIR/fsroot
#   xipe     :XIPE_PORT    a *copy* of ../xipe_totec (its state is __DIR__-
#                          relative) on a copy of its calc_sample fixture with a
#                          few evaluated rows -- spawned by the relay (root ".")
#                          The project is $E2E_DIR/fsroot/xproj: under the FS
#                          root, so a function's place can be opened in a code_editor
#   fake     :FAKE_XIPE_PORT  fake_xipe.exs (root "fake", mode connect)
#   chromium :CDP_PORT     headless, remote debugging
#   emacs    :VENT_PORT    only with `stack.sh emacs` (after `up`): the Emacs of
#                          ../editor/emacs (magit, emacs-vent) on the port the
#                          relay's vent uplink retries; state, log and cwd in
#                          $E2E_DIR (cwd: $E2E_DIR/fsroot/git, a repository).
#                          The other scenarios expect no Emacs: start it for
#                          the ones that need it (decode_emacs_magit.mjs)
#
# Env: E2E_DIR (default $TMPDIR/tezcatl-e2e), the *_PORT above, XIPE_TOTEC_DIR,
#      EDITOR_EMACS_DIR.
#      E2E_SECRET: the relay runs with it as Poca's secret (D-poca-secret;
#      secret_gate.mjs); unset, without authentication (TEZCATL_AUTH=off).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
tz="$(cd "$here/../.." && pwd)"
E2E_DIR="${E2E_DIR:-${TMPDIR:-/tmp}/tezcatl-e2e}"
PAGES_PORT="${PAGES_PORT:-4021}"
RELAY_PORT="${RELAY_PORT:-4101}"
XIPE_PORT="${XIPE_PORT:-4201}"
FAKE_XIPE_PORT="${FAKE_XIPE_PORT:-4202}"
CDP_PORT="${CDP_PORT:-9223}"
VENT_PORT="${VENT_PORT:-4099}"   # nothing listens here: the relay's vent uplink just retries
XIPE_TOTEC_DIR="${XIPE_TOTEC_DIR:-$tz/../xipe_totec}"
CHROMIUM="${CHROMIUM:-chromium}"
# editor/emacs beside the repository (../editor/emacs), found from a worktree too
EDITOR_EMACS_DIR="${EDITOR_EMACS_DIR:-$(cd "$(git -C "$tz" rev-parse --path-format=absolute --git-common-dir)/../.." && pwd)/editor/emacs}"

# what nix develop gave: the BEAM packages (here: mix's build) and UTF-8 file names
export ERL_LIBS="$tz/_build/dev/lib"
export ELIXIR_ERL_OPTIONS="+fnu"

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

wait_port() {
  local p="$1" what="$2"
  for _ in $(seq 1 240); do port_open "$p" && return 0; sleep 0.5; done
  echo "stack.sh: $what did not open :$p (logs in $E2E_DIR)" >&2
  return 1
}

# start "$name" <command...> -- in its own session so `down` can kill the group
start() {
  local name="$1"; shift
  setsid "$@" >"$E2E_DIR/$name.log" 2>&1 </dev/null &
  echo "$! $name" >>"$E2E_DIR/pids"
}

start_fake() {
  start fake env FAKE_XIPE_PORT=$FAKE_XIPE_PORT elixir "$here/fake_xipe.exs"
}

# stop the fake Xipe server and start it again on the same port -- what
# restarting Xipe Totec looks like to the relay's "connect" entry
# (xipe_restart.mjs)
restart_fake() {
  local pid
  pid="$(awk '$2 == "fake" { print $1 }' "$E2E_DIR/pids" | tail -1)"
  [ -n "$pid" ] && kill -- "-$pid" 2>/dev/null || true
  sed -i '/ fake$/d' "$E2E_DIR/pids"
  for _ in $(seq 1 40); do port_open "$FAKE_XIPE_PORT" || break; sleep 0.25; done
  if port_open "$FAKE_XIPE_PORT"; then echo "stack.sh: the fake xipe still holds :$FAKE_XIPE_PORT" >&2; return 1; fi
  echo "stack.sh: fake xipe stopped"
  start_fake
  wait_port "$FAKE_XIPE_PORT" "fake xipe"
  echo "stack.sh: fake xipe up again on :$FAKE_XIPE_PORT"
}

up() {
  for p in "$PAGES_PORT" "$RELAY_PORT" "$XIPE_PORT" "$FAKE_XIPE_PORT" "$CDP_PORT"; do
    if port_open "$p"; then echo "stack.sh: :$p is already in use (stack already up? run: $0 down)" >&2; exit 1; fi
  done
  ( cd "$tz" && MIX_ENV=dev mix compile ) >/dev/null || { echo "stack.sh: mix compile failed (mix deps.get first?)" >&2; exit 1; }
  rm -rf "$E2E_DIR"
  mkdir -p "$E2E_DIR"/{pages,relay,fsroot/xproj,xt,chrome}
  : >"$E2E_DIR/pids"

  # local/ (git-ignored, a person's own) may not exist in a fresh checkout; frame_skin.mjs and
  # frame_block.mjs write into it while running, so it must be there to be linked
  mkdir -p "$tz/local"
  # pages: every top-level entry symlinked, config.json rewritten to the test relay
  for f in "$tz"/* "$tz"/.[!.]*; do
    [ -e "$f" ] || continue
    [ "$(basename "$f")" = config.json ] && continue
    ln -s "$f" "$E2E_DIR/pages/$(basename "$f")"
  done
  sed "s#ws://127.0.0.1:4100#ws://127.0.0.1:$RELAY_PORT#g" "$tz/config.json" >"$E2E_DIR/pages/config.json"

  # relay: this repo's code, its own cwd (xipe.json is read from the cwd)
  ln -s "$tz/lib" "$tz/lsp.json" "$E2E_DIR/relay/"
  cat >"$E2E_DIR/relay/xipe.json" <<EOF
{ ".":    { "mode": "spawn", "installDir": "$E2E_DIR/xt", "command": ["elixir", "main.exs", "serve"], "port": $XIPE_PORT },
  "fake": { "mode": "connect", "host": "127.0.0.1", "port": $FAKE_XIPE_PORT } }
EOF

  # xipe_totec: a copy, on a copy of its fixture (+ a 4x4 matrix), with evaluated rows
  if [ -d "$XIPE_TOTEC_DIR/lib" ]; then
    cp -r "$XIPE_TOTEC_DIR"/{lib,main.exs,info.json,pipelines.json} "$E2E_DIR/xt/"
    cp -r "$XIPE_TOTEC_DIR/test/fixtures/calc_sample/." "$E2E_DIR/fsroot/xproj/"
    sed -i 's/^  def wide_list, do: Enum.to_list(1..100)$/&\n  def mat, do: for(i <- 0..3, do: for(j <- 1..4, do: i * 4 + j))/' "$E2E_DIR/fsroot/xproj/calc.exs"
    (
      cd "$E2E_DIR/xt"
      export XIPE_TOTEC_LSP=off
      elixir main.exs choice project "$E2E_DIR/fsroot/xproj"
      elixir main.exs scan
      elixir main.exs do \
        node/resolve module=Calc name=add arity=2 -- effect/set 'id=$0.id' effect=pure -- row/add 'node=$0.id' args=1,2 \
        -- node/resolve module=Calc name=square arity=1 -- effect/set 'id=$3.id' effect=pure -- row/add 'node=$3.id' 'args=[⟦$2.id⟧]' \
        -- node/resolve module=Calc name=average arity=1 -- effect/set 'id=$6.id' effect=pure -- row/add 'node=$6.id' 'args=[[]]' \
        -- node/resolve module=Calc name=mat arity=0 -- effect/set 'id=$9.id' effect=pure -- row/add 'node=$9.id' 'args=[]' \
        -- eval 'call_ids=[$2.id,$5.id,$8.id,$11.id]'
    ) >"$E2E_DIR/xipe-setup.log" 2>&1 || echo "stack.sh: xipe_totec setup had errors (see xipe-setup.log)" >&2
  else
    echo "stack.sh: no xipe_totec at $XIPE_TOTEC_DIR -- root \".\" will not work" >&2
  fi

  # The pages: the relay's VM serves $E2E_DIR/pages (TEZCATL_PAGES_*). This
  # machine's local.env is not read here (bin/t reads it), so the test relay
  # never points at real files
  # (TEZCATL_MIRROR_DIR, TEZCATL_WORK_DIR and TEZCATL_IDS_DIR too: the copies, the work place and the id lists of the tests stay in $E2E_DIR).
  # The database (D-db-backend): the relay's default MariaDB account, or E2E_DB_USER (e.g. an account made for the
  # tests only), but always its database tezcatl_e2e, never tezcatl.
  start relay bash -c "cd '$E2E_DIR/relay' && exec env PATH='$tz/lsp/bin':\"\$PATH\" TEZCATL_PAGES_PORT=$PAGES_PORT TEZCATL_PAGES_DIR='$E2E_DIR/pages' TEZCATL_RELAY_PORT=$RELAY_PORT TEZCATL_VENT_PORT=$VENT_PORT \
    TEZCATL_FS_ROOT='$E2E_DIR/fsroot' TEZCATL_MIRROR_DIR='$E2E_DIR/mirror' TEZCATL_WORK_DIR='$E2E_DIR/work' TEZCATL_IDS_DIR='$E2E_DIR/ids' TEZCATL_DB_NAME=tezcatl_e2e ${E2E_DB_USER:+TEZCATL_DB_USER='$E2E_DB_USER'} TEZCATL_ALLOWED_ORIGINS=http://127.0.0.1:$PAGES_PORT XIPE_TOTEC_LSP=off \
    TEZCATL_AUTH=off POCA_SECRET='${E2E_SECRET:-}' \
    elixir --no-halt -e '{:ok, _} = Application.ensure_all_started(:tezcatl_relay)'"
  start_fake
  start chromium "$CHROMIUM" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
    --remote-debugging-port="$CDP_PORT" --window-size=1200,800 --user-data-dir="$E2E_DIR/chrome" about:blank

  wait_port "$PAGES_PORT" pages
  wait_port "$CDP_PORT" chromium
  wait_port "$RELAY_PORT" relay
  wait_port "$FAKE_XIPE_PORT" "fake xipe"
  echo "stack.sh: up  (pages :$PAGES_PORT  relay :$RELAY_PORT  fake xipe :$FAKE_XIPE_PORT  cdp :$CDP_PORT  dir $E2E_DIR)"
}

# the Emacs of ../editor/emacs (its init.el: emacs-vent, magit) on :VENT_PORT.
# emacs-vent-port is set before init.el turns the mode on; its state
# (TEZCATL_EMACS_STATE_DIR), emacs-vent's log (XDG_STATE_HOME), the trash a discarded
# file goes to (XDG_DATA_HOME: magit.discard-file) and the daemon's
# name are the stack's own, so the real Emacs (:4000, its socket) is untouched.
# Its cwd -- the default-directory the magit.* intents read -- is a repository.
emacs() {
  [ -f "$E2E_DIR/pids" ] || { echo "stack.sh: the stack is not up (run: $0 up)" >&2; exit 1; }
  if port_open "$VENT_PORT"; then echo "stack.sh: :$VENT_PORT is already in use" >&2; exit 1; fi
  [ -e "$EDITOR_EMACS_DIR/init.el" ] || { echo "stack.sh: no $EDITOR_EMACS_DIR/init.el" >&2; exit 1; }
  local bin
  bin="$(command -v "${EMACS:-emacs}")" || { echo "stack.sh: no Emacs on PATH (EMACS=<path>)" >&2; exit 1; }
  mkdir -p "$E2E_DIR"/{emacs/state,emacs/xdg-state,emacs/xdg-data,fsroot/git}
  git -C "$E2E_DIR/fsroot/git" init -q 2>/dev/null || true
  start emacs bash -c "cd '$E2E_DIR/fsroot/git' && exec env TEZCATL_EMACS_STATE_DIR='$E2E_DIR/emacs/state' XDG_STATE_HOME='$E2E_DIR/emacs/xdg-state' XDG_DATA_HOME='$E2E_DIR/emacs/xdg-data' \
    '$bin' -Q --eval '(setq emacs-vent-port $VENT_PORT)' --load '$EDITOR_EMACS_DIR/init.el' --fg-daemon=tezcatl-e2e-$VENT_PORT"
  wait_port "$VENT_PORT" emacs
  echo "stack.sh: emacs up on :$VENT_PORT (cwd $E2E_DIR/fsroot/git, log $E2E_DIR/emacs.log)"
}

down() {
  [ -f "$E2E_DIR/pids" ] || { echo "stack.sh: nothing recorded in $E2E_DIR/pids"; return 0; }
  while read -r pid name; do
    kill -- "-$pid" 2>/dev/null && echo "stack.sh: stopped $name" || true
  done <"$E2E_DIR/pids"
  rm -f "$E2E_DIR/pids"

  # the relay's beam.smp runs in a session of its own and exits a little after
  # its wrapper -- wait for the ports; if one stays open, stop its holder, but
  # only when that process is ours (its cwd is inside $E2E_DIR)
  for p in "$PAGES_PORT" "$RELAY_PORT" "$XIPE_PORT" "$FAKE_XIPE_PORT" "$CDP_PORT" "$VENT_PORT"; do
    for _ in $(seq 1 20); do port_open "$p" || break; sleep 0.5; done
    if port_open "$p"; then
      for pid in $(ss -ltnpH "sport = :$p" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do
        case "$(readlink "/proc/$pid/cwd" 2>/dev/null)" in
          "$E2E_DIR"*) kill "$pid" && echo "stack.sh: stopped the holder of :$p (pid $pid)" ;;
          *) echo "stack.sh: :$p is held by pid $pid outside $E2E_DIR -- left alone" >&2 ;;
        esac
      done
    fi
  done
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  restart-fake) restart_fake ;;
  emacs) emacs ;;
  *) echo "usage: $0 up|down|restart-fake|emacs" >&2; exit 2 ;;
esac
