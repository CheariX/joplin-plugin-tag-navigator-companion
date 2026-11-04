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
      if (tag.length > MAX_TOKEN_LENGTH || (settings.excludeRegex && tag.match(settings.excludeRegex))) {
        continue;
      }
      addTag(tags, tag, settings);
    }
  }
  return tags;
}
