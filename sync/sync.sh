#!/usr/bin/env bash
# sync/sync.sh -- regenerate this repository from tezcatl (the upstream).
#
#   sync/sync.sh <path to the tezcatl repository> [<rev>]     (rev: main)
#
# tezcatl is written for Nix: the relay runs as `elixir main.exs`, which loads
# lib/relay/*.exs with Code.require_file, with its BEAM packages from Nix.
# This repository is the same tree made a Mix project. Changes flow one way,
# tezcatl -> here: never edit an upstream file here, change tezcatl and sync.
#
# What it does, from `git archive <rev>` of tezcatl (only committed files):
#   - drops flake.nix, flake.lock and nix/
#   - does not take the files in sync/replaced.txt (replaced by this
#     repository's own work); keeps upstream's version of each under
#     sync/upstream/ and, when one changed, prints the difference -- carry it
#     into the replacement by hand
#   - lib/relay/*.exs  -> lib/relay/*.ex, without their Code.require_file lines
#   - test/relay/*_test.exs: without ExUnit.start and Code.require_file
#     (test/relay/test_helper.exs starts ExUnit). A test that defines a module
#     of the relay's own (a stand-in) is moved to test/relay_isolated/, run by
#     bin/test one file at a time, since `mix test` loads every file into one VM
#   - README.md -> README.tezcatl.md (README.md here is this repository's own)
#   - .gitignore: upstream's, then sync/gitignore.extra
#   - removes the files the previous sync wrote (.upstream-files) that upstream
#     no longer has; refuses when an upstream file would overwrite one of this
#     repository's own
#   - records the upstream commit in sync/UPSTREAM
#
# It refuses to run on a dirty working tree (commit or stash first), so that
# `git diff` after it shows exactly what the sync changed.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
upstream="${1:?usage: sync/sync.sh <path to tezcatl> [<rev>]}"
rev="${2:-main}"
upstream="$(cd "$upstream" && pwd)"

cd "$here"
if [ -n "$(git status --porcelain)" ]; then
  echo "sync: the working tree is not clean; commit or stash first" >&2
  exit 1
fi

commit="$(git -C "$upstream" rev-parse --verify "$rev^{commit}")"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
git -C "$upstream" archive "$commit" | tar -x -C "$tmp"

# --- drop what is Nix's; set aside what this repository replaces ----------------
rm -rf "$tmp/flake.nix" "$tmp/flake.lock" "$tmp/nix"
replaced="$(sed -e 's/#.*//' -e '/^[[:space:]]*$/d' "$here/sync/replaced.txt" | awk '{print $1}')"
mkdir -p "$tmp/.replaced"
for p in $replaced; do
  if [ ! -f "$tmp/$p" ]; then
    echo "sync: upstream no longer has $p (sync/replaced.txt) -- see whether its replacement is still needed" >&2
    continue
  fi
  mkdir -p "$tmp/.replaced/$(dirname "$p")"
  mv "$tmp/$p" "$tmp/.replaced/$p"
done
mv "$tmp/.replaced" "$here/.replaced.new"

# --- lib/relay: .exs -> .ex, no require_file ---------------------------------
shopt -s nullglob
for f in "$tmp"/lib/relay/*.exs; do
  grep -v '^Code\.require_file(' "$f" > "${f%.exs}.ex"
  rm "$f"
done

# --- test/relay: no ExUnit.start, no require_file ----------------------------
# the modules the relay defines, to find tests that define a stand-in of one
relay_modules="$(grep -ho '^ *defmodule [A-Za-z0-9_.]*' "$tmp"/lib/relay/*.ex | awk '{print $2}' | sort -u)"
mkdir -p "$tmp/test/relay_isolated"
for f in "$tmp"/test/relay/*_test.exs; do
  perl -0pi -e '
    s/^ExUnit\.start\([^\n]*\)\n//mg;
    s/^for [^\n]*,\n\s*do: Code\.require_file\([^\n]*\n//mg;
    s/^Code\.require_file\([^\n]*\n//mg;
  ' "$f"
  if grep -q 'Code\.require_file' "$f"; then
    echo "sync: $f still has a Code.require_file in a form this script does not know" >&2
    exit 1
  fi
  for m in $(grep -ho '^ *defmodule [A-Za-z0-9_.]*' "$f" | awk '{print $2}'); do
    if grep -qx "$m" <<<"$relay_modules"; then
      echo "sync: $(basename "$f") defines a stand-in $m -> test/relay_isolated/"
      mv "$f" "$tmp/test/relay_isolated/"
      break
    fi
  done
done
rmdir "$tmp/test/relay_isolated" 2>/dev/null || true

# --- README: upstream's is kept as README.tezcatl.md; README.md is this repository's own
mv "$tmp/README.md" "$tmp/README.tezcatl.md"

# --- .gitignore ----------------------------------------------------------------
{ cat "$tmp/.gitignore"; echo; cat "$here/sync/gitignore.extra"; } > "$tmp/.gitignore.new"
mv "$tmp/.gitignore.new" "$tmp/.gitignore"

# --- the list of upstream files, and collisions with this repository's own -----
( cd "$tmp" && find . -type f -o -type l | sed 's|^\./||' | LC_ALL=C sort ) > "$here/.upstream-files.new"
touch "$here/.upstream-files"
while IFS= read -r p; do
  if [ -e "$here/$p" ] && ! grep -qxF "$p" "$here/.upstream-files"; then
    if git -C "$here" ls-files --error-unmatch "$p" >/dev/null 2>&1; then
      echo "sync: upstream now has $p, which is this repository's own" >&2
      rm -rf "$here/.upstream-files.new" "$here/.replaced.new"
      exit 1
    fi
  fi
done < "$here/.upstream-files.new"

# --- remove what the previous sync wrote, then write ---------------------------
while IFS= read -r p; do
  [ -n "$p" ] && rm -f "$here/$p"
done < "$here/.upstream-files"
find "$here" -mindepth 1 -type d -empty -not -path "$here/.git*" -not -path "$here/_build*" \
  -not -path "$here/deps*" -delete
cp -a "$tmp/." "$here/"
mv "$here/.upstream-files.new" "$here/.upstream-files"

# --- the replaced files: upstream's versions, and what changed -------------------
for p in $replaced; do
  [ -f "$here/.replaced.new/$p" ] || continue
  if [ -f "$here/sync/upstream/$p" ] && ! cmp -s "$here/sync/upstream/$p" "$here/.replaced.new/$p"; then
    echo
    echo "sync: $p changed upstream -- carry this into its replacement (sync/replaced.txt):"
    diff -u "$here/sync/upstream/$p" "$here/.replaced.new/$p" || true
  fi
done
rm -rf "$here/sync/upstream"
mv "$here/.replaced.new" "$here/sync/upstream"
echo "$commit" > "$here/sync/UPSTREAM"

echo
echo "sync: tezcatl $commit"
echo "sync: review with git status / git diff, then bin/test"
