import { CompletionContext, CompletionResult, acceptCompletion, completionStatus, currentCompletions, selectedCompletion, startCompletion } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { Prec } from '@codemirror/state';
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

function completeTags(pluginContext: ContentScriptContext) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const match = context.matchBefore(/\S+/);
    if (!match || !isTagToken(match.text)) {
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
    const dates = new Map(response.dateTags.map((d) => [d.tag, d]));
    for (const tag of dates.keys()) {
      counts.set(tag, counts.get(tag) ?? 0);
    }
    const token = match.text.toLocaleLowerCase();
    const matched = matchTags([...counts], token);
    if (dates.has(token)) {
      matched.unshift([token, 0]);
    }
    const options = matched.flatMap(([label, count]) => {
      const date = dates.get(label);
      return date
        ? [{ label: date.date, detail: date.label, type: 'itag' }, { label, detail: 'dynamic', type: 'itag' }]
        : [{ label, detail: count ? String(count) : undefined, type: 'itag' }];
    }).filter((option, i, all) => all.findIndex((other) => other.label === option.label) === i);
    return options.length ? { from: match.from, options, filter: false } : null;
  };
}

function tokenBefore(view: EditorView): { from: number; to: number; text: string } {
  const to = view.state.selection.main.head;
  const line = view.state.doc.lineAt(to);
  const text = /\S*$/.exec(line.text.slice(0, to - line.from))[0];
  return { from: to - text.length, to, text };
}

function replaceToken(view: EditorView, insert: string): boolean {
  const { from, to } = tokenBefore(view);
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length }, userEvent: 'input.complete' });
  startCompletion(view);
  return true;
}

function tab(view: EditorView): boolean {
  const selected = completionStatus(view.state) === 'active' && selectedCompletion(view.state);
  if (!selected) {
    return false;
  }
  const others = currentCompletions(view.state).map((option) => option.label);
  const segment = nextSegment(selected.label, tokenBefore(view).text, others);
  return segment === selected.label ? acceptCompletion(view) : replaceToken(view, segment);
}

function shiftTab(view: EditorView): boolean {
  if (completionStatus(view.state) !== 'active') {
    return false;
  }
  const parent = parentSegment(tokenBefore(view).text);
  return parent ? replaceToken(view, parent) : true;
}

// Typing a space right after '#tag/' or '#tag=' removes the separator.
const dropDanglingSeparator = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== ' ' || from !== to || from !== view.state.selection.main.head || !hasDanglingSeparator(tokenBefore(view).text)) {
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
