import { MAX_TOKEN_LENGTH } from './fuzzy';

export const defTagRegex = /(?<=^|\s)#([^\s#'",.()\[\]:;\?\\]+)/g;

export interface RawTagSettings {
  tagRegex: string;
  excludeRegex: string;
  ignoreCodeBlocks: boolean;
  nestedTags: boolean;
  valueDelim: string;
  ignoreHtmlNotes: boolean;
  todayTag: string;
  weekTag: string;
  monthTag: string;
  dateFormat: string;
  weekFormat: string;
  monthFormat: string;
  weekStartDay: string;
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
  todayTag: '#today',
  weekTag: '#week',
  monthTag: '#month',
  dateFormat: '#yyyy-MM-dd',
  weekFormat: '#yyyy-MM-dd',
  monthFormat: '#yyyy-MM',
  weekStartDay: '0',
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

// Tags are keyed in lower case, as in Tag Navigator, and keep the spelling of their first occurrence.
function addTag(tags: Map<string, string>, tag: string, settings: TagSettings): void {
  const add = (spelling: string) => {
    const key = spelling.toLocaleLowerCase();
    if (!tags.has(key)) {
      tags.set(key, spelling);
    }
  };
  if (!settings.nestedTags) {
    add(tag);
    return;
  }
  const key = settings.valueDelim ? tag.split(settings.valueDelim, 1)[0] : tag;
  const parts = key.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const child = parts.slice(0, i).join('/').replace(/\/+$/, '');
    if (child) {
      add(child);
    }
  }
  if (key !== tag) {
    add(tag);
  }
}

export function parseTags(text: string, settings: TagSettings): Map<string, string> {
  const tags = new Map<string, string>();
  let inCodeBlock = false;
  for (let original of text.split('\n')) {
    let line = original.toLocaleLowerCase();
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (settings.ignoreCodeBlocks) {
      if (inCodeBlock) {
        continue;
      }
      line = line.replace(/`[^`]*`/g, '``');
      original = original.replace(/`[^`]*`/g, '``');
    }
    // Same regex as Tag Navigator on the lower-case line; the spelling comes from the same position if it fits.
    for (const match of line.matchAll(settings.tagRegex)) {
      const tag = match[0];
      if (tag.length > MAX_TOKEN_LENGTH || (settings.excludeRegex && tag.match(settings.excludeRegex))) {
        continue;
      }
      const spelling = original.slice(match.index, match.index + tag.length);
      addTag(tags, spelling.toLocaleLowerCase() === tag ? spelling : tag, settings);
    }
  }
  return tags;
}
