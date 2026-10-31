import { commonPrefix, compileSettings, createSafeRegex, defTagRegex, defaultSettings, isTagToken, matchTags, parseTags } from '../src/parser';

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
    expect(matchTags(tags, '#j', 1)).toHaveLength(1);
  });

  test('is case-insensitive', () => {
    expect(labels('#PRO')).toEqual(['#project', '#project/alpha']);
  });
});

describe('commonPrefix', () => {
  test('longest shared start', () => {
    expect(commonPrefix(['#project', '#project/alpha'])).toBe('#project');
    expect(commonPrefix(['#ab', '@ab'])).toBe('');
    expect(commonPrefix([])).toBe('');
  });
});
