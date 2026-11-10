# `lib/vent/agenda-intent.js`

The `agenda` browser backend: opens the agenda list.

**Takes part in**: [D-task-list](lib-task-task-list.js.md#d-task-list)

## Selection and revision notes

Called from `resolver.js`' `browser.backend` branch like `compile-intent.js`, but it does one thing: `window.open(url, 'tezcatl-agenda')`
with `url` = `panels/tool/list.html?config=agenda`.

No "reuse inside the skin, else fall back" mechanism as `compile.cutoff.open` has: the agenda is not disposable but one lasting panel, so
the browser's standard behaviour — opening a window of the same name again brings the existing one forward — is enough; there was no reason
to build an announce / confirm protocol.

Everything after the panel opens (changing states, adding tasks) is the agenda panel's own keys; none of it appears in this intent (tasks
not shown are never changed from a minibuffer). The agenda is now the task list (`D-task-list`).
