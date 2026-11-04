import { compileSettings, createSafeRegex, defTagRegex, defaultSettings, parseTags } from '../src/parser';

const parse = (text: string, overrides = {}) =>
  [...parseTags(text, compileSettings({ ...defaultSettings, ...overrides })).keys()].sort();

const customRegex = '(?<=^|\\s)([#@!]|//)[^\\s#@!\'",.()\\[\\]:;\\?\\\\]+';

describe('parseTags', () => {
  test('default regex, lowercase, deduplicated', () => {
    expect(parse('Text #Tag and #tag, #other.\n#third')).toEqual(['#other', '#tag', '#third']);
  });

  test('keeps the spelling of the first occurrence per lower-case key', () => {
    const tags = parseTags('#Project/Alpha `#Code` #project/beta #İx #Ab', compileSettings(defaultSettings));
    expect([...tags]).toEqual([
      ['#project', '#Project'],
      ['#project/alpha', '#Project/Alpha'],
      ['#project/beta', '#project/beta'],
      // Lower case of 'İ' is longer, so its spelling and positions behind it fall back to lower case.
      ['#i̇x', '#i̇x'],
      ['#ab', '#ab'],
    ]);
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
