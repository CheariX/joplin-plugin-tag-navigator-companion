export const defTagRegex = /(?<=^|\s)#([^\s#'",.()\[\]:;\?\\]+)/g;
export const maxTagLength = 100;
export const maxOptions = 50;

const leadingSymbols = /^[^\p{L}\p{N}]+/u;

export type TagCount = [string, number];

export interface RawTagSettings {
  tagRegex: string;
  excludeRegex: string;
  ignoreCodeBlocks: boolean;
  nestedTags: boolean;
  valueDelim: string;
  ignoreHtmlNotes: boolean;
}

export interface TagSettings extends Omit<RawTagSettings, 'tagRegex' | 'excludeRegex'> {
  tagRegex: RegExp;
  excludeRegex: RegExp | null;
}

export const defaultSettings: RawTagSettings = {
  tagRegex: '',
  excludeRegex: '',
  ignoreCodeBlocks: true,
  nestedTags: true,
  valueDelim: '=',
  ignoreHtmlNotes: true,
};

// Same heuristic as Tag Navigator (src/utils.ts) to reject ReDoS-prone patterns.
export function isRegexSafe(pattern: string): boolean {
  const dangerousPatterns = [
    /\([^)]*[+*]\)[+*]/,
    /\([^)]*\|[^)]*\)[+*]/,
    /\([^)]*\([^)]*\([^)]*\(/,
    /.{200,}/,
    /\(\.\*\)[+*]/,
    /[+*]{2,}|[+*?]\?[+*]|\?[+*]/,
  ];
  return !dangerousPatterns.some((dangerous) => dangerous.test(pattern));
}

export function createSafeRegex(pattern: string, fallback: RegExp | null): RegExp | null {
  if (!pattern || !isRegexSafe(pattern)) {
    return fallback;
  }
  try {
    return new RegExp(pattern, 'g');
  } catch {
    return fallback;
  }
}

export function compileSettings(raw: RawTagSettings): TagSettings {
  return {
    ...raw,
    tagRegex: createSafeRegex(raw.tagRegex, defTagRegex),
    excludeRegex: createSafeRegex(raw.excludeRegex, null),
  };
}

function addTag(tags: Set<string>, tag: string, settings: TagSettings): void {
  if (!settings.nestedTags) {
    tags.add(tag);
    return;
  }
  const key = settings.valueDelim ? tag.split(settings.valueDelim, 1)[0] : tag;
  const parts = key.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const child = parts.slice(0, i).join('/').replace(/\/+$/, '');
    if (child) {
      tags.add(child);
    }
  }
  if (key !== tag) {
    tags.add(tag);
  }
}

export function parseTags(text: string, settings: TagSettings): Set<string> {
  const tags = new Set<string>();
  let inCodeBlock = false;
  for (let line of text.toLocaleLowerCase().split('\n')) {
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (settings.ignoreCodeBlocks) {
      if (inCodeBlock) {
        continue;
      }
      line = line.replace(/`[^`]*`/g, '``');
    }
    for (const tag of line.match(settings.tagRegex) ?? []) {
      if (tag.length > maxTagLength || (settings.excludeRegex && tag.match(settings.excludeRegex))) {
        continue;
      }
      addTag(tags, tag, settings);
    }
  }
  return tags;
}

export function isTagToken(token: string): boolean {
  return token.length >= 2 && token.length <= maxTagLength && leadingSymbols.test(token);
}

function rank(tag: string, token: string, core: string): number {
  if (tag.startsWith(token)) {
    return 0;
  }
  if (!core) {
    return -1;
  }
  if (tag.split('/').some((part) => part.replace(leadingSymbols, '').startsWith(core))) {
    return 1;
  }
  return tag.includes(core) ? 2 : -1;
}

export function matchTags(tags: TagCount[], token: string, limit = maxOptions): TagCount[] {
  token = token.toLocaleLowerCase();
  const core = token.replace(leadingSymbols, '');
  const ranked: [number, TagCount][] = [];
  for (const entry of tags) {
    const r = entry[0] === token ? -1 : rank(entry[0], token, core);
    if (r >= 0) {
      ranked.push([r, entry]);
    }
  }
  return ranked
    .sort((a, b) => a[0] - b[0] || b[1][1] - a[1][1] || a[1][0].localeCompare(b[1][0]))
    .slice(0, limit)
    .map(([, entry]) => entry);
}

export function commonPrefix(words: string[]): string {
  let prefix = words[0] ?? '';
  for (const word of words) {
    while (!word.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}
