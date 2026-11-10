# `lib/list/dict.js`

Pure logic of the generic dictionary: named lists of {word, note} entries, stored as one JSON doc in a real file via /fs (list kind "dict", list_kinds/dict*.json `dataFile`, default dict.json).

**Decisions homed here**: [D-dictionary](#d-dictionary)

<a id="d-dictionary"></a>

## D-dictionary — storing, registering and using words are generic parts; a backend's text is never read

**Decided**: completion candidates come from a generic dictionary that knows no backend.

- **Storing**: a person yanks part of an output (it enters the kill ring) and presses `p` in the dictionary panel: each line is
  registered with what is before the first `:` as the word and the rest as its note (`lib/list/dict.js`)
- **Registering**: words are added and removed freely in the dictionary panel (`list.html?config=dict`, kind `dict`); the data is
  `dict.json` through `/fs` (`{lists: {<name>: [{word, note}]}}`)
- **Using**: candidates for the word being typed (a completion source of `lib/code/code-editor.js`, `dict.words`)
- **Scope**: decided by how the skin is assembled — a skin binds its dictionary panel to an input by name and gives that panel's words to
  that input only (`lib/skin/skin-dict.js`). One panel = one list (`?list=`)

**Alternatives**: read a backend's listing (`xipe help` …) and register it automatically; a dedicated method returning the listing
structured; choose the list by the panel's URL; store in `localStorage`.

**Why not**: reading text meant for people breaks Xipe Totec's rule (input and output are not for parsing) and breaks Tezcatl each time
the output's look changes. With a yank, a person chooses what to take and Tezcatl interprets nothing. A dedicated method: see
`D-xipe-dialogue`. Combining panels is the skin's job (`D-skin-as-container`). A dictionary grows: it lives in a file one can edit by
hand and keep in git.

**What it removed**: depending on each backend's listing format; the same mechanism works for Emacs' or a shell's output.

**Files**: `lib/list/dict.js`, `lib/skin/skin-dict.js`, `lib/list/list-kinds.js` (`dict`), `list_kinds/dict.json`,
`panels/tool/list.html`, `lib/code/code-editor.js`, `panels/skins/xipe.html`.
