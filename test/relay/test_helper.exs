# This repository's own (not from upstream): upstream's tests are standalone
# scripts that start ExUnit themselves; sync/sync.sh removes that, so it starts here.
ExUnit.start(capture_log: true)
