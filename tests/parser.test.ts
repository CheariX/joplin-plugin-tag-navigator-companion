import { compileSettings, createSafeRegex, defTagRegex, defaultSettings, isTagToken, matchTags, nextSegment, parentSegment, parseTags } from '../src/parser';

const parse = (text: string, overrides = {}) =>
  [...parseTags(text, compileSettings({ ...defaultSettings, ...overrides }))].sort();

const customRegex = '(?<=^|\\s)([#@!]|//)[^\\s#@!\'",.()\\[\\]:;\\?\\\\]+';

describe('parseTags', () => {
  test('default regex, lowercase, deduplicated', () => {
    expect(parse('Text #Tag and #tag, #other.\n#third')).toEqual(['#other', '#tag', '#third']);
  });

  test('ignores tags without leading whitespace', () => {
    expect(parse('mail@#x foo#bar')).toEqual([]);
  });

  test('custom regex with several prefixes', () => {
    expect(parse('#a @person/john !status //2026', { tagRegex: customRegex, nestedTags: false }))
      .toEqual(['!status', '#a', '//2026', '@person/john']);
  });

  test('nested tags add parents', () => {
    expect(parse('#a/b/c')).toEqual(['#a', '#a/b', '#a/b/c']);
    expect(parse('#a/b', { nestedTags: false })).toEqual(['#a/b']);
  });

  test('tag values add the key and the full tag', () => {
    expect(parse('#status=open')).toEqual(['#status', '#status=open']);
  });

  test('code blocks and inline code', () => {
    const text = '#in\n```\n#fenced\n```\n`code #inline ` #after';
    expect(parse(text)).toEqual(['#after', '#in']);
    expect(parse(text, { ignoreCodeBlocks: false })).toEqual(['#after', '#fenced', '#in', '#inline']);
  });

  test('exclude regex', () => {
    expect(parse('#keep #skip-me', { excludeRegex: 'skip' })).toEqual(['#keep']);
  });

  test('drops overlong tags', () => {
    expect(parse(`#${'x'.repeat(200)} #ok`)).toEqual(['#ok']);
  });
});

describe('createSafeRegex', () => {
  test('falls back on empty, invalid or dangerous patterns', () => {
    expect(createSafeRegex('', defTagRegex)).toBe(defTagRegex);
    expect(createSafeRegex('([', defTagRegex)).toBe(defTagRegex);
    expect(createSafeRegex('(a+)+', null)).toBeNull();
    expect(createSafeRegex('#\\w+', null)?.flags).toBe('g');
  });
});

describe('isTagToken', () => {
  test('requires a leading symbol and two characters', () => {
    expect(isTagToken('#a')).toBe(true);
    expect(isTagToken('//')).toBe(true);
    expect(isTagToken('#')).toBe(false);
    expect(isTagToken('john')).toBe(false);
  });
});

describe('matchTags', () => {
  const tags: [string, number][] = [
    ['#project', 5],
    ['@person/john', 3],
    ['#johnson', 1],
    ['#project/alpha', 2],
    ['//2026', 4],
    ['#majo', 9],
  ];
  const labels = (token: string) => matchTags(tags, token).map(([tag]) => tag);

  test('prefix first, then segment start, then substring, each by count', () => {
    expect(labels('@jo')).toEqual(['@person/john', '#johnson', '#majo']);
  });

  test('prefix matches by count', () => {
    expect(labels('#pro')).toEqual(['#project', '#project/alpha']);
  });

  test('symbol-only token matches by prefix', () => {
    expect(labels('//')).toEqual(['//2026']);
  });

  test('excludes the exact token and respects the limit', () => {
    expect(labels('#project')).toEqual(['#project/alpha']);
    expect(matchTags(tags, '#j', false, 1)).toHaveLength(1);
  });

  test('is case-insensitive', () => {
    expect(labels('#PRO')).toEqual(['#project', '#project/alpha']);
  });
});

describe('matchTags fuzzy', () => {
  const tags: [string, number][] = [
    ['@person/john', 3],
    ['@project/jupiter', 1],
    ['#people', 9],
    ['//2026', 4],
  ];
  const labels = (token: string) => matchTags(tags, token, true).map(([tag]) => tag);

  test('characters in order, segment starts and same prefix rank first', () => {
    expect(labels('@pj')).toEqual(['@person/john', '@project/jupiter']);
    expect(labels('#pj')).toEqual(['@person/john', '@project/jupiter']);
  });

  test('no match when characters are out of order', () => {
    expect(labels('@hp')).toEqual([]);
  });

  test('symbol-only token matches by prefix', () => {
    expect(labels('//')).toEqual(['//2026']);
  });
});

describe('nextSegment', () => {
  const all = ['#project', '#project/alpha', '#project/alpha/x', '#status', '#status=open'];

  test('completes up to the next level after the typed part', () => {
    expect(nextSegment('#project/alpha/x', '#pro', all)).toBe('#project/');
    expect(nextSegment('#project/alpha/x', '#project/', all)).toBe('#project/alpha/');
  });

  test('a parent tag opens its children', () => {
    expect(nextSegment('#project', '#pro', all)).toBe('#project/');
    expect(nextSegment('#status', '#st', all)).toBe('#status=');
  });

  test('leaf returns the whole tag', () => {
    expect(nextSegment('#project/alpha/x', '#project/alpha/', all)).toBe('#project/alpha/x');
  });

  test('keeps the searched segment for substring and fuzzy matches', () => {
    expect(nextSegment('@person/john', '@jo', [])).toBe('@person/john');
    expect(nextSegment('@person/john/x', '@pj', [])).toBe('@person/john/');
  });
});

describe('parentSegment', () => {
  test('goes one level up', () => {
    expect(parentSegment('#project/alpha/')).toBe('#project/');
    expect(parentSegment('#project/al')).toBe('#project/');
    expect(parentSegment('#status=op')).toBe('#status=');
    expect(parentSegment('#project/')).toBeNull();
    expect(parentSegment('#pro')).toBeNull();
  });
});
