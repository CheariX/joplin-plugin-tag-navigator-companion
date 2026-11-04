// Shared verbatim between tag completion plugins (with fuzzy.ts): keep all copies identical.
import { fitsKnownPrefix, foldCase, hasDanglingSeparator, isTagToken, matchRanges, matchTag, matchTags, nextSegment, parentSegment } from '../src/fuzzy';

describe('isTagToken / fitsKnownPrefix', () => {
	it('needs a leading symbol and at least two characters', () => {
		expect(isTagToken('#a')).toBe(true);
		expect(isTagToken('//')).toBe(true);
		expect(isTagToken('#')).toBe(false);
		expect(isTagToken('john')).toBe(false);
		expect(isTagToken('#a b')).toBe(false);
		expect(isTagToken(`#${'a'.repeat(200)}`)).toBe(false);
	});
	it('accepts only leading symbols that fit a known prefix', () => {
		const known = ['#', '@', '//'];
		expect(fitsKnownPrefix('#pro', known)).toBe(true);
		expect(fitsKnownPrefix('/2', known)).toBe(true); // may become "//"
		expect(fitsKnownPrefix('./src', known)).toBe(false);
		expect(fitsKnownPrefix('**b', known)).toBe(false);
		expect(fitsKnownPrefix('(s', known)).toBe(false);
		expect(fitsKnownPrefix('##x', known)).toBe(true); // starts with a known prefix
	});
});

describe('matchTag', () => {
	it('finds the best alignment, not the leftmost one', () => {
		// Greedy would match the "w" in "network" and lose the segment start bonus.
		const m = matchTag('#network/project=Website_relaunch', '#web')!;
		expect(m.positions).toEqual([0, 17, 18, 19]);
		expect(m.score).toBe(3 + 3 + 2 + 2);
		expect(matchTag('#work/web', '#web')!.positions).toEqual([0, 6, 7, 8]);
	});
	it('is case-insensitive and keeps positions in the original label', () => {
		expect(matchTag('#Project/Alpha', '#pa')!.positions).toEqual([0, 1, 9]);
		expect(foldCase('İx')).toBe('İx'); // length-changing lower case is left alone
	});
	it('no match when characters are out of order; symbols only match by prefix', () => {
		expect(matchTag('@person/john', '@hp')).toBeNull();
		expect(matchTag('//2026', '//')).toEqual({ score: 0, positions: [0, 1] });
		expect(matchTag('#2026', '//')).toBeNull();
	});
	it('gives highlight ranges', () => {
		expect(matchRanges(matchTag('#network/project=Website', '#web')!)).toEqual([0, 1, 17, 20]);
		expect(matchRanges({ score: 0, positions: [1, 3, 4] })).toEqual([1, 2, 3, 5]);
	});
});

describe('matchTags', () => {
	const tags = [
		{ label: '@person/john', count: 3 },
		{ label: '@project/jupiter', count: 1 },
		{ label: '#people', count: 9 },
		{ label: '//2026', count: 4 },
	];
	const labels = (token: string, limit?: number) => matchTags(tags, token, limit).map(t => t.label);

	it('characters in order, segment starts and same prefix rank first', () => {
		expect(labels('@pj')).toEqual(['@person/john', '@project/jupiter']);
		expect(labels('#pj')).toEqual(['@person/john', '@project/jupiter']);
	});
	it('excludes the exact token, respects the limit, ignores case', () => {
		expect(labels('@person/john')).toEqual([]);
		expect(labels('@PJ')).toEqual(['@person/john', '@project/jupiter']);
		expect(labels('@p', 1)).toHaveLength(1);
	});
	it('ties: more used, then shorter, then code unit order', () => {
		const same = [{ label: '#b/x', count: 0 }, { label: '#a/x', count: 0 }, { label: '#c/xx', count: 0 }, { label: '#d/x', count: 2 }];
		expect(matchTags(same, '#x').map(t => t.label)).toEqual(['#d/x', '#a/x', '#b/x', '#c/xx']);
	});
});

describe('nextSegment / parentSegment / hasDanglingSeparator', () => {
	it('completes up to the next level after the typed part', () => {
		expect(nextSegment('#project/alpha', '#pro', [])).toBe('#project/');
		expect(nextSegment('#project/alpha', '#project/', [])).toBe('#project/alpha');
		expect(nextSegment('#status=next', '#st', [])).toBe('#status=');
		expect(nextSegment('#a/Website/x', '#webs', [])).toBe('#a/Website/'); // after the best alignment
		expect(nextSegment('#Project/Alpha', '#pro', [])).toBe('#Project/'); // keeps the spelling
	});
	it('continues to a deeper level of another entry', () => {
		expect(nextSegment('#project', '#pro', ['#project', '#project/alpha'])).toBe('#project/');
		expect(nextSegment('#project', '#pro', ['#project'])).toBe('#project');
	});
	it('separators are configurable', () => {
		expect(nextSegment('#a.b', '#a', [], '.')).toBe('#a.');
		expect(parentSegment('#a.b.c', '.')).toBe('#a.b.');
	});
	it('goes one level up', () => {
		expect(parentSegment('#project/alpha')).toBe('#project/');
		expect(parentSegment('#project/')).toBeNull();
		expect(parentSegment('#a/b/')).toBe('#a/');
	});
	it('detects a dangling separator after a word character', () => {
		expect(hasDanglingSeparator('#a/')).toBe(true);
		expect(hasDanglingSeparator('#a')).toBe(false);
		expect(hasDanglingSeparator('./')).toBe(false);
	});
});
