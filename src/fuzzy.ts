// Fuzzy matching, ranking and level-wise completion of tags such as `#project/alpha` or `#status=next`.
//
// Shared verbatim between Joplin plugins that complete tags (first in Tag Navigator Companion,
// CheariX/joplin-plugin-tag-navigator-companion, MIT), so suggestions of all of them match, rank and complete
// level-wise alike. Keep this file dependency-free and identical in every repository (the tests are shared, too).
// Pure and deterministic: no locale-dependent comparisons.
//
// Matching: the characters of the token after its leading symbols ("core") must appear in the tag in order. Of all
// such alignments the best one counts: +3 for a character at a segment start (index 0 or after a character that is
// no letter or digit), +2 for a character right after the previous one, plus +3 if the tag starts with the token's
// leading symbols. A token of symbols only matches by prefix.

/** Longest token that triggers suggestions. */
export const MAX_TOKEN_LENGTH = 100;
/** Default number of suggestions (CodeMirror renders at most 100 by default). */
export const MAX_MATCHES = 100;
/** Default level separators. */
export const DEFAULT_SEPARATORS = '/=';

const LEADING_SYMBOLS = /^[^\p{L}\p{N}]+/u;
const WORD_CHAR = /[\p{L}\p{N}]/u;
/** Labels longer than this are matched greedily (the alignment search is O(label × core)). */
const MAX_ALIGN_LENGTH = 512;

/** Lower case per UTF-16 code unit, so positions in the result are positions in the original string. */
export function foldCase(s: string): string {
	let out = '';
	for (const ch of s) {
		const lower = ch.toLowerCase();
		out += lower.length === ch.length ? lower : ch;
	}
	return out;
}

/** The leading symbols of a token or tag (`#`, `@`, `//`, …), '' if it starts with a letter or digit. */
export function leadingSymbols(s: string): string {
	return LEADING_SYMBOLS.exec(s)?.[0] ?? '';
}

/** A word that may start a tag: 2 to MAX_TOKEN_LENGTH characters, no whitespace, starting with a symbol. */
export function isTagToken(token: string): boolean {
	return token.length >= 2 && token.length <= MAX_TOKEN_LENGTH && !/\s/.test(token) && LEADING_SYMBOLS.test(token);
}

/**
 * True if the token's leading symbols fit one of the known ones (one is a prefix of the other): `#` fits `#`, `/`
 * fits `//`, but `./` or `**` fit neither `#` nor `@`. Stops paths, emphasis or brackets from triggering suggestions.
 */
export function fitsKnownPrefix(token: string, known: Iterable<string>): boolean {
	const lead = leadingSymbols(token);
	if (!lead) return false;
	for (const k of known) if (k && (k.startsWith(lead) || lead.startsWith(k))) return true;
	return false;
}

export interface TagMatch {
	/** Higher is better. */
	score: number;
	/** Positions (UTF-16 indices) of the matched characters in the tag, ascending (with the prefix if it matches). */
	positions: number[];
}

const isSegmentStart = (s: string, i: number) => i === 0 || !WORD_CHAR.test(s[i - 1]!);

/** Leftmost positions of `core` in `tag`, or null. */
function greedy(tag: string, core: string, from = 0): number[] | null {
	const positions: number[] = [];
	let at = from;
	for (const ch of core) {
		const i = tag.indexOf(ch, at);
		if (i < 0) return null;
		positions.push(i);
		at = i + 1;
	}
	return positions;
}

function scoreOf(tag: string, positions: number[]): number {
	let score = 0;
	positions.forEach((p, n) => { score += (isSegmentStart(tag, p) ? 3 : 0) + (n > 0 && p === positions[n - 1]! + 1 ? 2 : 0); });
	return score;
}

/** The best-scoring alignment of `core` in `tag` (both case-folded); on a tie the earliest one. */
function bestAlignment(tag: string, core: string): number[] | null {
	const first = greedy(tag, core);
	if (!first || tag.length > MAX_ALIGN_LENGTH) return first;
	const n = tag.length;
	const m = core.length;
	const NONE = -Infinity;
	// best[i][j]: best score with core[i] at tag position j; prev[i][j]: position of core[i-1] in that alignment.
	const best: number[][] = [];
	const prev: number[][] = [];
	for (let i = 0; i < m; i++) {
		const row = new Array<number>(n).fill(NONE);
		const back = new Array<number>(n).fill(-1);
		let gapBest = NONE;
		let gapAt = -1;
		for (let j = 0; j < n; j++) {
			if (i > 0 && j >= 2 && best[i - 1]![j - 2]! > gapBest) { gapBest = best[i - 1]![j - 2]!; gapAt = j - 2; }
			if (tag[j] !== core[i]) continue;
			const bonus = isSegmentStart(tag, j) ? 3 : 0;
			if (i === 0) { row[j] = bonus; continue; }
			const adjacent = j >= 1 ? best[i - 1]![j - 1]! : NONE;
			const viaAdjacent = adjacent === NONE ? NONE : adjacent + 2;
			if (viaAdjacent === NONE && gapBest === NONE) continue;
			// Prefer the adjacent character on a tie (a contiguous highlight reads better).
			if (viaAdjacent >= gapBest) { row[j] = viaAdjacent + bonus; back[j] = j - 1; } else { row[j] = gapBest + bonus; back[j] = gapAt; }
		}
		best.push(row);
		prev.push(back);
	}
	let end = -1;
	for (let j = 0; j < n; j++) if (best[m - 1]![j]! !== NONE && (end < 0 || best[m - 1]![j]! > best[m - 1]![end]!)) end = j;
	if (end < 0) return first;
	const positions = new Array<number>(m);
	for (let i = m - 1, j = end; i >= 0; j = prev[i]![j]!, i--) positions[i] = j;
	return positions;
}

/** Match `token` against `tag` (case-insensitive); null if it does not match. */
export function matchTag(tag: string, token: string): TagMatch | null {
	const t = foldCase(tag);
	const tok = foldCase(token);
	const lead = leadingSymbols(tok);
	const core = tok.slice(lead.length);
	if (!core) return t.startsWith(tok) ? { score: 0, positions: [...tok].map((_, i) => i) } : null;
	const positions = bestAlignment(t, core);
	if (!positions) return null;
	const samePrefix = t.startsWith(lead);
	const prefix = samePrefix ? [...lead].map((_, i) => i).filter(i => i < positions[0]!) : [];
	return { score: (samePrefix ? 3 : 0) + scoreOf(t, positions), positions: [...prefix, ...positions] };
}

export interface Rankable { label: string; count: number }
export type Ranked<T> = T & { match: TagMatch };

/**
 * The entries matching `token`, best first: score, then count (more used first), then shorter labels, then the label
 * (code unit order). The exact token itself is left out (nothing to complete).
 */
export function matchTags<T extends Rankable>(entries: T[], token: string, limit = MAX_MATCHES): Ranked<T>[] {
	const tok = foldCase(token);
	const ranked: Ranked<T>[] = [];
	for (const e of entries) {
		if (foldCase(e.label) === tok) continue;
		const match = matchTag(e.label, token);
		if (match) ranked.push({ ...e, match });
	}
	return ranked
		.sort((a, b) => b.match.score - a.match.score || b.count - a.count || a.label.length - b.label.length || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
		.slice(0, limit);
}

/** CodeMirror match ranges ([from, to, from, to, …]) for highlighting the matched characters. */
export function matchRanges(match: TagMatch): number[] {
	const out: number[] = [];
	for (const p of match.positions) {
		if (out.length && out[out.length - 1] === p) out[out.length - 1] = p + 1;
		else out.push(p, p + 1);
	}
	return out;
}

/**
 * Tab: the tag up to the next separator after the typed part, or the whole tag if it has no deeper level. A tag
 * without a deeper level of its own continues to the separator of a longer tag in `others` (`#a` → `#a/` if `#a/b`
 * is suggested too). Case-insensitive; the result keeps the tag's spelling.
 */
export function nextSegment(tag: string, token: string, others: string[], separators = DEFAULT_SEPARATORS): string {
	const t = foldCase(tag);
	const tok = foldCase(token);
	const isSep = (ch: string) => separators.includes(ch);
	let matchEnd: number;
	if (t.startsWith(tok)) matchEnd = tok.length;
	else matchEnd = (matchTag(tag, token)?.positions.at(-1) ?? tag.length - 1) + 1;
	for (let i = matchEnd; i < tag.length; i++) if (isSep(tag[i]!)) return tag.slice(0, i + 1);
	const child = others.find(o => o.length > tag.length && foldCase(o).startsWith(t) && isSep(o[tag.length]!));
	return child ? child.slice(0, tag.length + 1) : tag;
}

/** Shift-Tab: the token up to its previous separator (`#a/b/c` → `#a/b/`, `#a/b/` → `#a/`), or null at the top. */
export function parentSegment(token: string, separators = DEFAULT_SEPARATORS): string | null {
	const trimmed = separators.includes(token.at(-1) ?? '') ? token.slice(0, -1) : token;
	let cut = -1;
	for (let i = trimmed.length - 1; i >= 0; i--) if (separators.includes(trimmed[i]!)) { cut = i; break; }
	const parent = trimmed.slice(0, cut + 1);
	return cut > 0 && isTagToken(parent) ? parent : null;
}

/** A tag that ends in a separator after a letter or digit (`#a/`), e.g. left over after Tab. */
export function hasDanglingSeparator(token: string, separators = DEFAULT_SEPARATORS): boolean {
	return isTagToken(token) && token.length >= 2 && separators.includes(token.at(-1)!) && WORD_CHAR.test(token.at(-2)!);
}
