import { CompletionContext, CompletionResult, acceptCompletion, completionStatus, currentCompletions, selectedCompletion, startCompletion } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { EditorState, Prec, Text } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { ContentScriptContext, MarkdownEditorContentScriptModule } from 'api/types';
import { dateTagsFor } from './dateTags';
import { Rankable, fitsKnownPrefix, hasDanglingSeparator, isTagToken, leadingSymbols, matchTags, nextSegment, parentSegment } from './fuzzy';
import { RawTagSettings, TagSettings, compileSettings, defTagRegex, parseTags } from './parser';

interface TagsResponse {
  version: number;
  settings?: RawTagSettings;
  locale?: string;
  tags?: Rankable[];
}

interface Tags {
  version: number;
  raw: RawTagSettings;
  settings: TagSettings;
  locale: string;
  tags: Rankable[];
  prefixes: Set<string>;
}

const codeNodes = new Set(['FencedCode', 'CodeBlock', 'InlineCode']);
let cache: Tags | null = null;
let docTags = new WeakMap<Text, { tags: Map<string, string>; prefixes: Set<string> }>();
let dateNames = new Set<string>();

const optionTheme = EditorView.baseTheme({
  '.cm-tooltip-autocomplete li:has(.cm-completionIcon-itag)': {
    display: 'flex',
  },
  '.cm-completionIcon-itag': {
    display: 'none',
  },
  '.cm-tooltip-autocomplete li:has(.cm-completionIcon-itag) .cm-completionDetail': {
    marginLeft: 'auto',
    paddingLeft: '1.5em',
    fontStyle: 'normal',
    fontVariantNumeric: 'tabular-nums',
    opacity: '0.7',
  },
});

function isTagsResponse(response: any): response is TagsResponse {
  return typeof response?.version === 'number' && (response.tags === undefined || (
    typeof response.settings?.tagRegex === 'string'
    && typeof response.settings?.excludeRegex === 'string'
    && typeof response.locale === 'string'
    && Array.isArray(response.tags)
    && response.tags.every((tag: any) => typeof tag?.label === 'string' && typeof tag.count === 'number')
  ));
}

function cacheTags({ version, settings: raw, locale, tags }: Required<TagsResponse>): Tags {
  const settings = compileSettings(raw);
  const names = dateTagsFor('', raw, locale).map((d) => d.tag);
  const prefixes = new Set([...tags.map((tag) => tag.label), ...names].map(leadingSymbols));
  if (settings.tagRegex === defTagRegex) {
    prefixes.add('#');
  }
  docTags = new WeakMap();
  return { version, raw, settings, locale, tags, prefixes };
}

// Tags of the open note, parsed once per document version.
function noteTags(doc: Text, settings: TagSettings): { tags: Map<string, string>; prefixes: Set<string> } {
  let note = docTags.get(doc);
  if (!note) {
    const tags = parseTags(doc.toString(), settings);
    note = { tags, prefixes: new Set([...tags.values()].map(leadingSymbols)) };
    docTags.set(doc, note);
  }
  return note;
}

function inCode(context: CompletionContext): boolean {
  for (let node = syntaxTree(context.state).resolveInner(context.pos, -1); node; node = node.parent) {
    if (codeNodes.has(node.name)) {
      return true;
    }
  }
  return false;
}

// The token around the cursor: text before it is matched, the whole token is replaced.
function tokenAt(state: EditorState, pos = state.selection.main.head): { from: number; to: number; text: string } {
  const line = state.doc.lineAt(pos);
  const text = /\S*$/.exec(line.text.slice(0, pos - line.from))[0];
  const rest = /^\S*/.exec(line.text.slice(pos - line.from))[0];
  return { from: pos - text.length, to: pos + rest.length, text };
}

// A tag-like token outside code whose prefix is used by a known tag or a tag of this note.
function wanted(context: CompletionContext, token: string): boolean {
  if (!isTagToken(token) || !cache) {
    return isTagToken(token);
  }
  return (fitsKnownPrefix(token, cache.prefixes) || fitsKnownPrefix(token, noteTags(context.state.doc, cache.settings).prefixes))
    && !(cache.settings.ignoreCodeBlocks && inCode(context));
}

function completeTags(pluginContext: ContentScriptContext) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const match = tokenAt(context.state, context.pos);
    if (!wanted(context, match.text)) {
      return null;
    }
    const response = await pluginContext.postMessage({ name: 'getTags', version: cache?.version ?? -1 });
    if (!isTagsResponse(response)) {
      return null;
    }
    if (response.tags) {
      cache = cacheTags(response as Required<TagsResponse>);
    }
    if (cache?.version !== response.version || !wanted(context, match.text)) {
      return null;
    }

    // Tags of the open note rank above equally good matches, even if not saved yet.
    const tags = new Map(cache.tags.map((tag) => [tag.label.toLocaleLowerCase(), { ...tag, notes: tag.count }]));
    for (const [key, label] of noteTags(context.state.doc, cache.settings).tags) {
      const tag = tags.get(key);
      tags.set(key, { label: tag?.label ?? label, count: (tag?.count ?? 0) + 1, notes: tag?.notes ?? 0 });
    }
    const dateTags = dateTagsFor(match.text, cache.raw, cache.locale);
    dateNames = new Set(dateTags.map((d) => d.tag.replace(/[+-]\d+$/, '')));
    for (const name of dateNames) {
      if (!tags.has(name)) {
        tags.set(name, { label: name, count: 0, notes: 0 });
      }
    }
    const token = match.text.toLocaleLowerCase();
    const date = dateTags.find((d) => d.tag === token);
    const options = [
      ...(date ? [{ label: date.date, detail: date.label }] : []),
      ...(dateNames.has(token) ? [{ label: `${token}+`, detail: 'offset' }] : []),
      ...matchTags([...tags.values()], token).map(({ label, notes }) => ({
        label,
        detail: dateNames.has(label.toLocaleLowerCase()) ? 'date tag' : notes ? String(notes) : undefined,
      })),
    ]
      .filter((option, i, all) => all.findIndex((other) => other.label === option.label) === i)
      .map((option) => ({ ...option, type: 'itag' }));
    return options.length ? { from: match.from, to: match.to, options, filter: false } : null;
  };
}

function replaceToken(view: EditorView, insert: string): boolean {
  const { from, to } = tokenAt(view.state);
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length }, userEvent: 'input.complete' });
  startCompletion(view);
  return true;
}

function tab(view: EditorView): boolean {
  const selected = completionStatus(view.state) === 'active' && selectedCompletion(view.state);
  if (!selected) {
    return false;
  }
  // A date tag name works like a level: Tab inserts it and offers its date and offset.
  if (dateNames.has(selected.label.toLocaleLowerCase().replace(/\+$/, ''))) {
    return replaceToken(view, selected.label);
  }
  const others = currentCompletions(view.state).map((option) => option.label);
  const segment = nextSegment(selected.label, tokenAt(view.state).text, others);
  return segment === selected.label ? acceptCompletion(view) : replaceToken(view, segment);
}

function shiftTab(view: EditorView): boolean {
  if (completionStatus(view.state) !== 'active') {
    return false;
  }
  const parent = parentSegment(tokenAt(view.state).text);
  return parent ? replaceToken(view, parent) : true;
}

// Typing a space right after '#tag/' or '#tag=' at the end of a token removes the separator.
const dropDanglingSeparator = EditorView.inputHandler.of((view, from, to, text) => {
  const token = tokenAt(view.state);
  if (text !== ' ' || from !== to || from !== token.to || !hasDanglingSeparator(token.text)) {
    return false;
  }
  view.dispatch({ changes: { from: from - 1, to, insert: ' ' }, selection: { anchor: from }, userEvent: 'input.type' });
  return true;
});

// CodeMirror only opens completions while typing, so also open them when deleting inside a tag.
const completeOnDelete = EditorView.updateListener.of((update) => {
  if (update.transactions.some((tr) => tr.isUserEvent('delete')) && !completionStatus(update.state) && isTagToken(tokenAt(update.state).text)) {
    queueMicrotask(() => startCompletion(update.view));
  }
});

export default (pluginContext: ContentScriptContext): MarkdownEditorContentScriptModule => ({
  plugin: (editorControl) => {
    if (!editorControl.cm6 || !editorControl.joplinExtensions) {
      return;
    }
    editorControl.addExtension([
      editorControl.joplinExtensions.completionSource(completeTags(pluginContext)),
      Prec.highest(keymap.of([{ key: 'Tab', run: tab }, { key: 'Shift-Tab', run: shiftTab }])),
      optionTheme,
      dropDanglingSeparator,
      completeOnDelete,
    ]);
  },
});
