import { CompletionContext, CompletionResult, acceptCompletion, completionStatus, currentCompletions, selectedCompletion, startCompletion } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { ContentScriptContext, MarkdownEditorContentScriptModule } from 'api/types';
import type { DateTag } from './dateTags';
import { RawTagSettings, TagCount, compileSettings, hasDanglingSeparator, isTagToken, matchTags, nextSegment, parentSegment, parseTags } from './parser';

interface TagsResponse {
  settings: RawTagSettings;
  tags: TagCount[];
  dateTags: DateTag[];
}

const codeNodes = new Set(['FencedCode', 'CodeBlock', 'InlineCode']);
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
  return !!response
    && typeof response.settings?.tagRegex === 'string'
    && typeof response.settings?.excludeRegex === 'string'
    && Array.isArray(response.tags)
    && response.tags.every((tag: unknown) => Array.isArray(tag) && typeof tag[0] === 'string' && typeof tag[1] === 'number')
    && Array.isArray(response.dateTags)
    && response.dateTags.every((d: any) => typeof d?.tag === 'string' && typeof d.date === 'string' && typeof d.label === 'string');
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

function completeTags(pluginContext: ContentScriptContext) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const match = tokenAt(context.state, context.pos);
    if (!isTagToken(match.text)) {
      return null;
    }
    const response = await pluginContext.postMessage({ name: 'getTags', token: match.text });
    if (!isTagsResponse(response)) {
      return null;
    }
    const settings = compileSettings(response.settings);
    if (settings.ignoreCodeBlocks && inCode(context)) {
      return null;
    }

    const counts = new Map(response.tags);
    for (const tag of parseTags(context.state.doc.toString(), settings)) {
      if (!counts.has(tag)) {
        counts.set(tag, 0);
      }
    }
    dateNames = new Set(response.dateTags.map((d) => d.tag.replace(/[+-]\d+$/, '')));
    for (const name of dateNames) {
      counts.set(name, counts.get(name) ?? 0);
    }
    const token = match.text.toLocaleLowerCase();
    const date = response.dateTags.find((d) => d.tag === token);
    const options = [
      ...(date ? [{ label: date.date, detail: date.label }] : []),
      ...(dateNames.has(token) ? [{ label: `${token}+`, detail: 'offset' }] : []),
      ...matchTags([...counts], token).map(([label, count]) => ({
        label,
        detail: dateNames.has(label) ? 'date tag' : count ? String(count) : undefined,
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
  if (dateNames.has(selected.label.replace(/\+$/, ''))) {
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
    ]);
  },
});
