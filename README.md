# Tag Navigator Companion

Autocompletion for inline tags in the Joplin Markdown editor (CodeMirror 6), built as a companion to [Inline Tag Navigator](https://github.com/alondmnt/joplin-plugin-tag-navigator).

- Requires Inline Tag Navigator: without it (or while it is disabled) this plugin does nothing.
- Tags are found with the same settings as Tag Navigator (tag regex, exclude regex, code blocks, nested tags, HTML notes). Changes to those settings apply after switching notes, after a sync, at most a minute later, or immediately via *Reload tags now* in the plugin settings.
- Works with any tag prefix your regex allows, e.g. `#tag`, `@person`, `!status`, `//2026`. Suggestions open when a word starts with a symbol (not a letter or digit).
- Fuzzy search: the typed characters only need to appear in order, e.g. `@pj` finds `@person/john`. Same prefix, consecutive characters and segment starts rank first, then the number of notes.
- Date tags: typing the name of a Tag Navigator date tag (`#today`, `#week`, `#month`, optionally with `+n`/`-n`) offers two entries. One is the date itself, e.g. `#2026-10-31`, formatted with Tag Navigator's date settings. The other is the tag name, which stays *dynamic*: Tag Navigator resolves it to the current date every day.
- Joplin's native tags are neither read nor written.

## Keys

- `Tab` completes the selected suggestion up to the next level (`#pro` → `#project/` → `#project/alpha`) and keeps the list open; on the last level it inserts the tag.
- `Shift-Tab` goes one level up (`#project/alpha/` → `#project/`).
- `Enter` inserts the whole selected tag, `Esc` closes the list.
- Without an open list, `Tab` and `Shift-Tab` indent as usual.

## Advantages over the Inline Tags plugin

The [Inline Tags plugin](https://github.com/roman-r-m/joplin-inline-tags-plugin) also completes tags in the Markdown editor, but works differently:

- **Source of suggestions:** Inline Tags suggests Joplin's native tags. This plugin suggests the inline tags written in your notes, as found by Inline Tag Navigator.
- **No changes to native tags:** Choosing a suggestion in Inline Tags attaches a native tag to the note and can create new native tags. This plugin only inserts text and neither reads nor writes Joplin's tag database.
- **Any prefix:** Inline Tags only triggers on `#`. This plugin works with any symbol prefix allowed by Tag Navigator's tag regex, e.g. `@person`, `!status`, `//2026`.
- **Fuzzy matching and ranking:** Inline Tags matches by case-sensitive prefix only, in no particular order. This plugin uses fuzzy matching and ranks by match quality and by the number of notes using a tag.
- **Nested tags:** `Tab`/`Shift-Tab` move through tag levels (`#project/` → `#project/alpha`). Inline Tags has no special handling for nested tags.
- **Date tags:** `#today`, `#week`, `#month` (with `+n`/`-n`) can be inserted as a fixed date or as the dynamic tag.
- **Consistent with Tag Navigator:** Exclude regex, code-block and nested-tag settings are taken from Tag Navigator.

Inline Tags, on the other hand, works without Tag Navigator, also supports the legacy (CodeMirror 5) editor, and suits you better if you want real Joplin tags.

## Limitations

This is a proof of concept.

- **Tags are rebuilt, not shared.** Tag Navigator keeps its tag index in memory and does not expose it to other plugins. This plugin reads Tag Navigator's settings and builds its own index from the note bodies. Notes are therefore read and held in memory a second time.
- **Own, simpler parser.** Results can differ from Tag Navigator in edge cases. Not supported:
  - front matter tags
  - resolving date tags in notes: a literal `#today` is listed as `#today`, not as today's date
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
