# `lib/vent/resolver.js`

Resolves typed intent ids and runs intents: `M-:` wrapped with a correlation id, keys, browser backends, a trace.

**Decisions homed here**: [D-intent-resolution](#d-intent-resolution), [D-intent-later](#d-intent-later)

**Takes part in**: [D-decode-emacs](lib-vent-decode-table.js.md#d-decode-emacs), [D-run-table](lib-task-run-table.js.md#d-run-table)

<a id="d-intent-resolution"></a>

## D-intent-resolution — the mapping source is a JSON dictionary; the layer stands apart, before the middleware

**Decided**: `command/binding_map.json` (editor-neutral `{id, keys?, host?, disabled?}`), `command/dialects/emacs/intent_map.json`
(the index of Emacs extensions) with `command/dialects/emacs/extensions/<extension>.json` (the intents: `kind` `eval`/`keys`, `form`,
`sequence` …; ids `<extension>.<name>`), and `lib/vent/resolver.js`. An intent id typed in Form is looked up; on a hit `kind:"eval"`
becomes an `M-:` wrapped with a correlation id (`condition-case` + `json-serialize` + `decode-coding-string 'utf-8` — emacs-vent-out
does not send a unibyte `message` — + `tez:<corr> ok/err`), `kind:"keys"` the raw key sequence. On a miss, the `D-empty-middleware`
path. Embedding values and wrapping are common (`lib/vent/elisp.js`); an extension is a file plus its name in the index (the browser
cannot list a directory) — one JSON for every intent would hide whose each is and where to add.

**Alternatives**: implement it **inside** the input middleware; a mapping format of its own (not JSON).

**Why not**: the middleware's type is narrow (InputEvents → InputEvents); a correlation id, a `condition-case` wrapper, `json-serialize`
and parsing the result — a round trip waiting for an answer — do not fit it. A separate layer before it, bypassing it on a hit, was
simpler. JSON for consistency with the other settings.

**What it removed**: how to squeeze mapping into the middleware's type; the middleware stays identity.

**Seeing and stopping**: the `M-:` channel is a string eval through keystrokes — a thin pipe where failures stack (a valid form, a
JSON-able value, position-independent, landing in the minibuffer, unibyte messages, a 3 s timeout, one frame's payload — not a limit of size: 40 MB arrive in 2 s, measured 2026-10-23). **No new
`kind`** (`D-single-input` holds); two things on the browser's side instead:

- **Seeing**: `resolver.js` keeps a trace entry per `dispatch()`, updates its status in place on `settle()`/`abort()`, and posts the
  whole of `renderTrace()` (a pure function) on `resolver.trace`; `panels/resident/code_el_intent.html` shows it. Each entry is the
  unsent Elisp (the extension's form as it is) with `[status]` — a readable projection, not the wire itself
- **Stopping**: the input panel's "unstick Emacs (C-g)" → `resolver.abort()`: a plain `C-g`, the last pending eval `aborted`. `C-g`
  is global: it unsticks Emacs, it does not cancel "this" command

Rejected: bringing back an `eval` kind (would undo `D-single-input`). Control characters in `elispLit` are escaped (`\t \r \n \f \v`,
others as three-digit octal) — a `\t` in a parameter fired completion inside `M-:` and broke the form.

**Dispatch is sequential by practice, not enforced**: `pending` is keyed by corr, so several evals can be in flight; `post.refresh`
is the only system-started re-entry from `settle()` into `dispatch()`.

**Verified**: `magit.unstaged-files` and the others go round on the real machine; stage, unstage and commit work in a real repository.

**Files**: `lib/vent/resolver.js`, `lib/vent/elisp.js`, `command/binding_map.json`, `command/dialects/emacs/`,
`lib/vent/input-panel.js`, `lib/vent/output-panel.js`, `panels/resident/code_el_intent.html`, `panels/skins/intent.html`.

<a id="d-intent-later"></a>

## D-intent-later — an intent that takes long starts a process and is answered when it ends

**Decided** (crux, 2026-10-23): an Emacs intent with `"emacs": {"kind": "eval", "later": true}` has a form that **starts a process and
returns it** (Magit's `magit-start-git`). The wrapper (`lib/vent/elisp.js` `wrapLater`) answers `tez:<corr> took <pid>` at once and puts
a sentinel on the process: the one it had (Magit's) is kept on the process (`tez-sentinel`) and called first, then, when the process
has ended, `tez:<corr> ok {"exit": 0, "output": …}` or `tez:<corr> err "exited <n>: <output>"`. `output` is what a function the form put
on the process (`tez-output`) makes of it — for Magit, the process' section of the `magit-process` buffer, colours removed — the last
2 000 characters, a text to show, never read by Tezcatl. On `took` the resolver stops its 3 s limit (the entry is `running`); the input
panel tells the asker `intent.took`, and the askers (decode_emacs, run_table's `run from`, the `intent` line) stop their 6 s limit and
say it is running. There is no limit after `took`: a process that never ends is never answered (as a hanging Xipe Totec, scope.md).

`browser.post.commands` (beside `post.refresh`): tezcatl-commands run once the intent answered ok — `check.update-all` after
`magit.checkout`, `magit.branch-create`, `magit.pull`, so that files a checkout or a pull changed are compared by every `code_editor` of the
frame used last (D-logbook: nothing watches the disk; this is asked on behalf of the person, and said on the receiving side).

**Alternatives**: (b) a per-intent time limit (`timeoutMs`) with the form still run synchronously; (c) push and pull typed in a terminal,
not intents.

**Why not**: (b) Emacs is stopped while git talks to the network, and a passphrase prompt in the minibuffer would wait behind the eval;
(c) the answer would be human text in a PTY, and a table's keys (`P` on a branch) could not run it. A process with a sentinel needs nothing
new from emacs-vent: the answer is a `message` (emacs-vent advises `message`, so a sentinel's is carried), the same channel as `M-:`.

**Pitfalls**: the sentinel is set without a closure — `add-function` on `(process-sentinel p)` expands to a setter closure that is void
when `M-:` evaluates with dynamic binding (found in a batch Emacs, 2026-10-23); the lambda reads only its arguments and the process'
properties. `abort()` (C-g) does not stop the process: its answer later is "late … ignored". Prompts for a passphrase or a password are
Magit's (the minibuffer of Emacs): a person answers them by typing to Emacs from the input line; tezcatl does not show that one is asked.

**Verified**: `test/e2e/magit_branch.mjs` (a real Emacs, a bare remote: fetch, pull, push, `set-upstream`, refusals), `test/e2e/magit_stash.mjs` (`post.commands` after a stash, pop, apply); `test/resolver.test.js`.

**Files**: `lib/vent/elisp.js`, `lib/vent/resolver.js`, `lib/vent/input-panel.js`, `lib/vent/decode-emacs-page.js`,
`lib/task/run-table-page.js`, `lib/skin/intent-commands.js`, `command/dialects/emacs/extensions/magit.json`, `command/command_map.json`
(`check.update-all`).

## Notes from verification

**Spec** — two kinds of files because "which keys go to which intent id" (`command/binding_map.json`, editor-neutral) and "what an intent
is" (`command/dialects/emacs/…`, Emacs' `emacs.kind` / `form` / `sequence`) are separate concerns. `bindingsById` lets an intent id typed
directly reach any binding, `keys` or not. `wrap()` builds a fixed `condition-case` + `json-serialize` + `tez:<corr> ok/err <payload>` — the
only way to get correlated answers through the existing path where `M-:`'s value rides a `message` event (`D-single-input`) without a new
event type. `load()` also fetches the dialect-free `command/intents/browser.json` (optional) and merges it; `dispatch()` hands an intent with
`browser.backend` to a function registered with `registerLocal(name, fn)` before the `uplinkAlive` check, sending nothing to emacs-vent
(`lib/vent/compile-intent.js` — `"compile"`, `lib/vent/agenda-intent.js` — `"agenda"`). It keeps a trace for `code_el_intent`
(`resolver.trace`, `renderTrace()`), `abort(corr?)`, and checks `result.table` / `result.book` on loading.

**Does not** — resolve `params[].from` (`input-panel.js` fetches `"selection"` / `"list-item"`; the resolver gets finished `{name: value}`
args); a candidate UI; enforcing `needs` (deferred).

**Pitfalls** — `uplinkAlive` starts **optimistically `true`**: until the first `GET /windows` poll answers it tries to send ("fails open,
not closed"). `TIMEOUT_MS` is 3 s (was 8; the uplink watch fails fast). `settle()` treats an unknown `corr` as a "late" log line, not an
error — a real answer after the timeout and an unknown `corr` are both ignored alike. `(if (null v) :null v)` in `wrap()` lets a form whose
value is unused end with `nil` instead of writing `:null`. `fill()` replaces `{{name}}` (`/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g`); a name in
neither `params` nor `locals` throws and **the whole intent is not sent** (never a half-substituted string). `elispLit` escapes by `type`
(`string` / `path`: `\`, `"`, control characters as `\t \r \n \f \v` or three-digit octal); `int` / `bool` / `enum` go in as literals.

*Verified 2026-09-06; the trace (2026-09-09) and `browser.backend` (2026-09-13) not re-verified.*

## Selection and revision notes

(Moved from the comments of `lib/vent/resolver.js`, 2026-09-10; the intents now live in `command/`, and `browser.backend`, `result.table`, `result.book` came later.)

Resolver -- the one interposed layer between input.html's form and the wire
(browser global + CommonJS module).

  typed command (an intent id, or kbd notation)
    -> binding_map.json lookup
         miss -> caller sends the raw InputEvents unchanged
         hit  -> dialects/<dialect>/intent_map.json entry decides what goes out

Lookup tries, in order: (1) the typed text IS a binding's intent id,
verbatim -- the v0 substitute for a candidate/palette UI (planned as
follow-up work; once it exists to preview what is about to fire, `keys`
bindings can come back without the ambiguity below); (2) the typed text
parses as kbd notation and matches a binding's `keys`. v0's seed bindings
carry no `keys` at all: Emacs prefix maps a user may have rebound (M-g,
C-c, ...) are not ours to silently pre-empt, so nothing is claimed until
the candidate panel can show what a keystroke is about to trigger.

v0 handles the two combinations that actually work end to end:

  emacs.kind "eval"  (requires a string `form`) + result.via "message"
    Builds  M-: <wrapper> RET  where <wrapper> is the FIXED shape:
      (let ((message-log-max nil))
        (condition-case e
            (let ((v <form>))
              (message "tez:%s ok %s" "<corr>"
                       (decode-coding-string (json-serialize (if (null v) :null v)) 'utf-8)))
          (quit  (message "tez:%s err %s" "<corr>"
                          (decode-coding-string (json-serialize "interrupted") 'utf-8)))
          (error (message "tez:%s err %s" "<corr>"
                          (decode-coding-string (json-serialize (error-message-string e)) 'utf-8))))
        nil)
    The trailing nil is so eval-expression's own echo is a harmless "nil"
    rather than a copy of the payload. The real channel is the "tez:" line,
    matched back by /^tez:(\S+) (ok|err) (.*)$/ on message events.
    `json-serialize` returns a UNIBYTE string (raw UTF-8 bytes); a `message`
    built from one is silently NOT emitted as a vent `message` event, so any
    non-ASCII payload -- a kanji filename in an `ok` array, and the curly
    quotes in nearly every built-in Emacs error string on the `err` path --
    would never produce a "tez:" line and the request would time out with a
    misleading "no tez: line" instead of the real result. `decode-coding-string
    ... 'utf-8` turns those bytes back into a multibyte string so the frame
    goes out. (The root cause is emacs-vent-out dropping unibyte messages;
    this only fixes the wrapper's own three messages.)
    `nil -> :null` is the wrapper's job: a `form` that returns nothing
    useful should just end in a plain `nil`, never write `:null` itself
    (redundant -- the wrapper already coerces it).
    `idempotent` describes ONLY whether re-running `form` is safe -- NOT
    the row as a whole. A row's `post.refresh` re-running is a separate,
    already-debounced concern (REFRESH_DEBOUNCE_MS) and does not enter
    into this flag.

  emacs.kind "keys"  (requires a string `sequence`, kbd notation) + result.via "none"
    Sends the intent's real default key sequence, no correlation, no
    completion signal -- a deliberate degenerate path. Pick a sequence
    whose meaning does not depend on Tezcatl having some particular
    buffer current (Tezcatl never opens display buffers -- overview.md
    §4.2 -- so a sequence that only means something in e.g. a
    magit-status buffer can never correctly fire).

Fails fast on a known-down uplink (GET /windows' `uplink` field, polled
every UPLINK_POLL_MS) rather than waiting out TIMEOUT_MS on every request.

params[].from "selection" / "list-item" are resolved entirely on the
input-panel.js side (this module never looks at `from` -- it only ever
sees the collected {name: value} args). "list-item" needs a place to read
another intent's last result from: getLastResult(id) exposes the cache
dispatch()/settle() keep for exactly that; dispatch()'s optional onSettle
callback lets the panel populate a picker once a "fetch it now" dispatch
resolves.

Dispatch is one-at-a-time by convention, not enforced: `pending` is a map
keyed by corr, so several eval requests can be in flight at once, and
`post.refresh` re-enters dispatch() from settle() (the one system-initiated
dispatch). The trace / `resolver.trace` bus event below feeds the
code_el_intent transcript panel (D-intent-resolution: seeing) and `abort()` sends a
bare C-g to unstick a wedged Emacs -- both UI-local (D-stateless-relay).

Deferred (not in v0): emacs-vent-send-context recovery, `needs`
enforcement, locals beyond $context.*, exec-stdout (④) / temp-file (③)
vias, rendering post.refresh results anywhere but the log.
3s, not the "wait and see" 8s of the first cut: most of what an 8s
timeout used to wait through is now caught instantly by the uplink
check below. What is left to time out on is emacs-vent genuinely being
unresponsive with a live uplink, which is rarer and does not want a
human sitting in front of the Form field for 8s to learn that.
This tab's stable-ish id for correlation ("<tab>-<n>").
Set once by input-panel via attach(). dispatch()/onInbound() use them.
canonKey -> binding   (only bindings that declare `keys`)
intent id -> binding (every binding, v0's palette substitute)
id -> intent row
corrId -> { intent, timer, onSettle }
intent id -> timestamp (debounce)
Last known "ok" payload per intent id -- the params[].from:"list-item"
source (a param whose value is picked from another intent's last result,
e.g. magit.stage-file's path from magit.unstaged-files). Populated
opportunistically whenever anything settles ok, including refreshes.
--- trace (D-intent-resolution: seeing; for the code_el_intent panel) -----
One entry per dispatch(); settle()/abort() rewrite its status in place; on every change the whole of renderTrace() is posted on the
`resolver.trace` bus. UI-local (D-stateless-relay): nothing reaches emacs-vent. The skin takes it and code.sets the target pane.
most-recent eval corr, for a bare abort()
Optimistic until the first poll answers -- a slow/failed /windows fetch
must not itself block dispatch (fails open, not closed).
--- load -----------------------------------------------------------------
The relay's own /windows, derived from the vent connection's ws(s):// URL
(same host:port the browser already talks to, per connections[0].url).
nothing to poll -- stay optimistic
a malformed/unreachable body leaves the last known value alone.
transient fetch failure: keep last known value
Returns an array of human-readable problem strings (non-fatal; the bad
rows are skipped). Fatal shape errors throw.
Every valid binding is reachable by typing its intent id verbatim
(the v0 palette substitute) -- whether or not it also declares `keys`.
id-only binding, fine
shallow refresh-cycle guard (depth-1 dispatch means A->B->A cannot loop
at runtime, but flag it so the maps stay honest).
--- lookup -------------------------------------------------------------
Canonical, order-preserving key: "<sorted mods>|<key>" per event, space-joined.
typedText: whatever is in the form field. Returns { binding, intent } or
null (no match -- caller sends the text as raw InputEvents).

Tried in order: (1) an exact intent id, verbatim -- works for every
binding, keys or no keys (the v0 palette substitute); (2) kbd notation
matching a binding's `keys`, for the (currently empty in the v0 seed)
bindings that declare one.
--- dispatch ---------------------------------------------------------
intent: the row. args: { <paramName>: rawStringValue } from the form.
ctx: last context message or null. onSettle (optional): function(status,
payload) called once this specific dispatch settles ("ok" | "err",
parsed payload or the raw string on a parse failure) -- used by list-item
"fetch to populate the picker" UI, not a general subscription mechanism.
Returns true if something was sent.
Fail fast: the relay's own gun connection to emacs-vent is known down
(GET /windows' `uplink`, polled). Sending would just be dropped by
vent_uplink.exs and, for an "eval" row, waste TIMEOUT_MS finding that
out the slow way.
--- inbound (correlation) --------------------------------------------
Either an id we never dispatched, or one that already settled --
most often a timeout fired and then the real answer showed up late.
Per the design decision: do not resurrect a request the UI has
already reported as failed -- log it as a distinct "late" case so
an operator can tell "never came back" apart from "came back after
the UI gave up".
depth-1 post.refresh
refresh intents are param-free in v0
--- {{ }} substitution ---------------------------------------------------
$context.* only in v0. Throws on an unresolvable required local.
Elisp string literal. Every control char is escaped to its backslash form
(\t \r \n \f \v, else 3-digit octal) so the wrapped expression -- which is
then re-encoded to keystrokes by text.js -- carries no literal tab / CR: a
raw \t inside the M-: minibuffer would fire completion and corrupt the
expression; a raw \r is a C0 control text.js silently drops.
`json-serialize` hands back a UNIBYTE string; a `message` assembled from
one is not emitted as a vent `message` event (emacs-vent-out drops it), so
wrap every payload in `decode-coding-string ... 'utf-8` to get a multibyte
string back before it reaches `message`. See the file header for why this
matters (non-ASCII ok payloads; curly quotes in built-in error strings).
Pure: fill {{params}} -> M-: wrapper -> keystroke events. Throws (via
fill) on a missing required param / bad template. Shared by dispatch()
and exposed for tests.
Send a bare C-g to unstick a wedged Emacs (a minibuffer read the M-:
landed in, a slow eval). Marks the most-recent still-pending eval entry
`aborted` and clears its timer; other in-flight entries are left to time
out on their own. C-g is global -- by the time the user reacts the intent
may already have finished -- so this is "unstick Emacs", not "undo this
intent". `corr` optional: without it, the most recent pending eval.
--- renderTrace: entries[] -> the code_el_intent document (pure) --------
pure internals, for tests (test/resolver.test.js) -- no DOM, no bus
