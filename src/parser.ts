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

// Positions of the characters of `core` in `tag`, matched left to right.
function subsequence(tag: string, core: string): number[] | null {
  const positions: number[] = [];
  for (const char of core) {
    const i = tag.indexOf(char, (positions[positions.length - 1] ?? -1) + 1);
    if (i < 0) {
      return null;
    }
    positions.push(i);
  }
  return positions;
}

// Lower is better; null means no match.
function rank(tag: string, token: string, core: string): number | null {
  if (tag.startsWith(token)) {
    return 0;
  }
  if (!core) {
    return null;
  }
  if (tag.split('/').some((part) => part.replace(leadingSymbols, '').startsWith(core))) {
    return 1;
  }
  return tag.includes(core) ? 2 : null;
}

// Rewards the same prefix symbols, consecutive characters and characters at segment starts.
function fuzzyRank(tag: string, token: string, core: string): number | null {
  const positions = subsequence(tag, core);
  if (!positions || !core) {
    return tag.startsWith(token) ? 0 : null;
  }
  let score = tag.startsWith(token.slice(0, token.length - core.length)) ? 3 : 0;
  positions.forEach((i, n) => {
    score += (i === positions[n - 1] + 1 ? 2 : 0) + (/[^\p{L}\p{N}]/u.test(tag[i - 1] ?? '/') ? 3 : 0);
  });
  return -score;
}

export function matchTags(tags: TagCount[], token: string, fuzzy = false, limit = maxOptions): TagCount[] {
  token = token.toLocaleLowerCase();
  const core = token.replace(leadingSymbols, '');
  const scorer = fuzzy ? fuzzyRank : rank;
  const ranked: [number, TagCount][] = [];
  for (const entry of tags) {
    const r = entry[0] === token ? null : scorer(entry[0], token, core);
    if (r !== null) {
      ranked.push([r, entry]);
    }
  }
  return ranked
    .sort((a, b) => a[0] - b[0] || b[1][1] - a[1][1] || a[1][0].localeCompare(b[1][0]))
    .slice(0, limit)
    .map(([, entry]) => entry);
}

// Tag up to the next '/' or '=' after the typed part, or the whole tag if it has no deeper level.
export function nextSegment(tag: string, token: string, others: string[]): string {
  token = token.toLocaleLowerCase();
  const core = token.replace(leadingSymbols, '');
  const substring = tag.indexOf(core);
  const matchEnd = tag.startsWith(token) ? token.length
    : substring >= 0 ? substring + core.length
      : (subsequence(tag, core)?.pop() ?? -1) + 1;
  const end = tag.slice(matchEnd).search(/[/=]/);
  if (end >= 0) {
    return tag.slice(0, matchEnd + end + 1);
  }
  const child = others.find((other) => other.startsWith(tag + '/') || other.startsWith(tag + '='));
  return child ? child.slice(0, tag.length + 1) : tag;
}

export function parentSegment(token: string): string | null {
  const trimmed = token.replace(/[/=]$/, '');
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('='));
  const parent = trimmed.slice(0, cut + 1);
  return cut > 0 && isTagToken(parent) ? parent : null;
}
