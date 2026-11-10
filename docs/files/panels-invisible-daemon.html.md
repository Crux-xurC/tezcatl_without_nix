# `panels/invisible/daemon.html`

The page of daemon (session services).

**Decisions homed here**: [D-session-service](#d-session-service)

<a id="d-session-service"></a>

## D-session-service — windows arranged by the window manager; the invisible hosts in a daemon shipped with the launcher

**Decided**: day to day, panels may open as separate windows arranged by the OS window manager (`window.open` from `main.html`,
`launcher.html`, tree's `o`). Then the invisible aggregators a skin used to host (`killring.html` — the kill ring; `cursor.html` — cursor
and context) have no home, so **`panels/invisible/daemon.html`** holds them in hidden iframes and `main.html` embeds it hidden. The
daemon is a singleton by a **soft election** on the BroadcastChannel (the incumbent answers `daemon.here`; started together, the
smallest id is active). It also opens alone.

The kill ring is fed from everywhere: `copy` in `code-editor.js` / `xterm.html` → `killring.add` (read-only viewers and terminal
selections too). **Mirroring the outside clipboard** is opt-in in `panel-frame.js` (each panel reads `navigator.clipboard.readText()`
on its own `focus`; `ui.startup.clipboardMirror` in `config.json`). **Delivering** (`deliver` in `list-kinds.js`) is `killring.yank` for
code and `insert` for others, with `writeText` each time.

**Explicit marks are another matter** (no aggregator): tree's path bookmarks and dired's set of marks are made only by an explicit `m`,
so that panel keeps the set itself — nothing to gather from everywhere. (dired's batch operations are now rows of a
run_table: `D-run-table`.)

**Alternatives**: keep the skin as host (no host in the window model); the daemon reading the clipboard (`readText()` needs document
focus, and a tiled daemon window is never focused); composing skins of skins (a new skin = "A beside B").

**Why not** (composition): all frames share one flat `BroadcastChannel`, so A and B would both fire `yield` / `killring` / `command`
twice, two `killring.html` would fight over the same kept key, and `panes.mount`'s `opts.id` would collide. **What is composed
is the layout spec (data), not skins.**

**What it removed**: aggregators nobody reads without a skin; where to mirror the clipboard (per panel, by the focus constraint); the
double firing and storage races of composition.

**Trade-off (accepted)**: the `main.html` window is load-bearing (closing it stops the session services — keep it open). Electing
again after the active daemon window closes is not implemented. Clipboard mirroring assumes Chromium (Firefox needs a gesture: no-op).

**Files**: `panels/invisible/daemon.html`, `main.html`, `lib/core/panel-frame.js`, `lib/code/code-editor.js`, `lib/list/list-kinds.js`,
`panels/resident/xterm.html`, `config.json` (`ui.startup`).

## Selection and revision notes

(Moved from the comments of `panels/invisible/daemon.html`, 2026-09-10.)

daemon.html -- the session-services host. Holds the invisible aggregators (killring.html = kill-ring store, cursor.html = cursor/context
aggregator) as hidden iframes so they stay alive for the whole session, independent of any skin. main.html embeds this hidden; it can also be
opened standalone (?debug shows a status line) in the "many windows, WM tiles them" workflow.

Singleton by soft election over the panel bus (BroadcastChannel), so main.html + a standalone daemon window never end up with two
killring.html fighting the same kept key (the skin-of-skins hazard):

  * an ALREADY-ACTIVE daemon answers a newcomer's `daemon.hello` with `daemon.here` -> the newcomer goes dormant at once (incumbent wins);
  * two daemons starting together see each other's `daemon.hello`; after a short window the one with the lexically-lowest id activates, the
    rest stay dormant.

Known limit (v0): if the active daemon's window is closed, dormant ones do not re-elect -- reopen main.html to restart session services.

Renders nothing by default. Not vent. NOT here: the clipboard mirror -- navigator.clipboard.readText() needs the document focused and this
window is tiled away most of the time, so that lives per-panel in lib/core/panel-frame.js, gated by config.json ui.startup.clipboardMirror.

Record: made with the kill ring and the tree's bookmarks, solving where the invisible aggregators live once a skin is no longer their only
host (`D-session-service`). Re-election stays "reload the launcher"; a dormant daemon taking over automatically (`daemon.bye` on
`pagehide`, then an election) is recorded as an approach only, low priority.
