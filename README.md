# Tag Navigator Companion

Autocompletion for inline tags in the Joplin Markdown editor (CodeMirror 6), built as a companion to [Inline Tag Navigator](https://github.com/alondmnt/joplin-plugin-tag-navigator).

- Requires Inline Tag Navigator: without it (or while it is disabled) this plugin does nothing.
- Tags are found with the same settings as Tag Navigator (tag regex, exclude regex, code blocks, nested tags, HTML notes). Changes to those settings apply after switching notes, after a sync, at most a minute later, or immediately via *Reload tags now* in the plugin settings.
- Works with any tag prefix your regex allows, e.g. `#tag`, `@person`, `!status`, `//2026`. Suggestions open when a word starts with a symbol (not a letter or digit).
- Search mode (setting):
  - *Fuzzy* (default): the typed characters only need to appear in order, e.g. `@pj` finds `@person/john`.
  - *Ranked*: typing `@jo` suggests `@person/john`. Prefix matches come first, then nested segments, then substrings, each ranked by the number of notes.
- Joplin's native tags are neither read nor written.

## Keys

- `Tab` completes the selected suggestion up to the next level (`#pro` → `#project/` → `#project/alpha`) and keeps the list open; on the last level it inserts the tag.
- `Shift-Tab` goes one level up (`#project/alpha/` → `#project/`).
- `Enter` inserts the whole selected tag, `Esc` closes the list.
- Without an open list, `Tab` and `Shift-Tab` indent as usual.

## Development

```sh
npm install
npm test
npm run dist   # creates publish/*.jpl
```
