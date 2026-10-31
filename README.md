# Tag Navigator Companion

Autocompletion for inline tags in the Joplin Markdown editor (CodeMirror 6), built as a companion to [Inline Tag Navigator](https://github.com/alondmnt/joplin-plugin-tag-navigator).

- Requires Inline Tag Navigator: without it (or while it is disabled) this plugin does nothing.
- Tags are found with the same settings as Tag Navigator (tag regex, exclude regex, code blocks, nested tags, HTML notes). Changes to those settings apply after switching notes, after a sync, at most a minute later, or immediately via *Reload tags now* in the plugin settings.
- Works with any tag prefix your regex allows, e.g. `#tag`, `@person`, `!status`, `//2026`. Suggestions open when a word starts with a symbol (not a letter or digit).
- Fuzzy search: the typed characters only need to appear in order, e.g. `@pj` finds `@person/john`. Same prefix, consecutive characters and segment starts rank first, then the number of notes.
- Joplin's native tags are neither read nor written.

## Keys

- `Tab` completes the selected suggestion up to the next level (`#pro` → `#project/` → `#project/alpha`) and keeps the list open; on the last level it inserts the tag.
- `Shift-Tab` goes one level up (`#project/alpha/` → `#project/`).
- `Enter` inserts the whole selected tag, `Esc` closes the list.
- Without an open list, `Tab` and `Shift-Tab` indent as usual.

## Limitations

This is a proof of concept.

- **Tags are rebuilt, not shared.** Tag Navigator keeps its tag index in memory and does not expose it to other plugins. This plugin reads Tag Navigator's settings and builds its own index from the note bodies. Notes are therefore read and held in memory a second time.
- **Own, simpler parser.** Results can differ from Tag Navigator in edge cases. Not supported:
  - front matter tags
  - date tags such as `#today`
  - indented (four-space) code blocks
  - notebook include/exclude lists
  - `minCount`
- **Changes to Tag Navigator's settings take effect with a delay.** Joplin only tells a plugin when its *own* settings change. So when you change, for example, the tag regex in Tag Navigator, this plugin does not notice right away. It reads Tag Navigator's settings again whenever it refreshes its tag list: when you open another note, after a sync, or when the list is more than a minute old. To apply a change immediately, tick *Reload tags now* in this plugin's settings. The tick then disappears by itself. It is a checkbox rather than a button because plugins cannot add buttons to the settings page.
- **Coupled to Tag Navigator internals.** The plugin reads settings by Tag Navigator's plugin ID and `itags.*` keys. If those are renamed, Tag Navigator counts as missing and this plugin stays inactive.
- **Trigger.** Suggestions only open for words starting with a symbol. Tags without a leading symbol, e.g. `tag:foo`, are not completed.
- **Lowercase.** Tags are suggested and inserted in lowercase, as Tag Navigator stores them.
- **Editor.** Only the CodeMirror 6 editor is supported, not the legacy editor. Mobile has no Tab key: tap a suggestion or type `/` instead.
- **First use.** The first suggestion list after start may take a moment while the index is built.

## Development

```sh
npm install
npm test
npm run dist   # creates publish/*.jpl
```
