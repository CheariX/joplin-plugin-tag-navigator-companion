import { CompletionContext, CompletionResult, acceptCompletion, completionStatus, currentCompletions } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { ContentScriptContext, MarkdownEditorContentScriptModule } from 'api/types';
import { RawTagSettings, TagCount, commonPrefix, compileSettings, isTagToken, matchTags, parseTags } from './parser';

interface TagsResponse {
  settings: RawTagSettings;
  tabBehavior: string;
  tags: TagCount[];
}

const codeNodes = new Set(['FencedCode', 'CodeBlock', 'InlineCode']);
let tabBehavior = 'commonPrefix';

function isTagsResponse(response: any): response is TagsResponse {
  return !!response
    && typeof response.settings?.tagRegex === 'string'
    && typeof response.settings?.excludeRegex === 'string'
    && typeof response.tabBehavior === 'string'
    && Array.isArray(response.tags)
    && response.tags.every((tag: unknown) => Array.isArray(tag) && typeof tag[0] === 'string' && typeof tag[1] === 'number');
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
    tabBehavior = response.tabBehavior;
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
    const options = matchTags([...counts], match.text).map(([label, count]) => ({
      label,
      detail: count ? String(count) : undefined,
      type: 'keyword',
    }));
    return options.length ? { from: match.from, options, filter: false } : null;
  };
}

function tab(view: EditorView): boolean {
  if (completionStatus(view.state) !== 'active') {
    return false;
  }
  if (tabBehavior === 'commonPrefix') {
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    const token = /\S*$/.exec(line.text.slice(0, head - line.from))[0].toLocaleLowerCase();
    const prefix = commonPrefix(currentCompletions(view.state).map((option) => option.label));
    if (prefix.length > token.length && prefix.startsWith(token)) {
      const from = head - token.length;
      view.dispatch({
        changes: { from, to: head, insert: prefix },
        selection: { anchor: from + prefix.length },
        userEvent: 'input.type',
      });
      return true;
    }
  }
  return acceptCompletion(view);
}

export default (pluginContext: ContentScriptContext): MarkdownEditorContentScriptModule => ({
  plugin: (editorControl) => {
    if (!editorControl.cm6 || !editorControl.joplinExtensions) {
      return;
    }
    editorControl.addExtension([
      editorControl.joplinExtensions.completionSource(completeTags(pluginContext)),
      Prec.highest(keymap.of([{ key: 'Tab', run: tab }])),
    ]);
  },
});
