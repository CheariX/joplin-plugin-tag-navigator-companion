# Tag Navigator Companion

Autocompletion for inline tags in the Joplin Markdown editor (CodeMirror 6), built as a companion to [Inline Tag Navigator](https://github.com/alondmnt/joplin-plugin-tag-navigator).

- Requires Inline Tag Navigator: without it (or while it is disabled) this plugin does nothing.
- Tags are found with the same settings as Tag Navigator (tag regex, exclude regex, code blocks, nested tags, HTML notes). Changes to those settings apply after switching notes, after a sync, at most a minute later, or immediately via *Reload tags now* in the plugin settings.
- Works with any tag prefix your regex allows, e.g. `#tag`, `@person`, `!status`, `//2026`. Suggestions open when a word starts with a symbol (not a letter or digit).
- Typing `@jo` also suggests `@person/john`: prefix matches first, then nested segments, then substrings, each ranked by the number of notes.
- Joplin's native tags are neither read nor written.

## Keys

- `Enter` accepts the selected suggestion, `Esc` closes the list.
- `Tab` either completes the common prefix of all suggestions and then accepts, or accepts right away (setting *Tab key in tag suggestions*).

## Development

```sh
npm install
npm test
npm run dist   # creates publish/*.jpl
```
