import { format } from 'date-fns/format';
import { RawTagSettings, defaultSettings } from './parser';

export interface DateTag {
  tag: string;
  date: string;
  label: string;
}

type Shift = (date: Date, amount: number, s: RawTagSettings) => void;

// Same date arithmetic as Tag Navigator (src/parser.ts).
const kinds: [keyof RawTagSettings, keyof RawTagSettings, Shift][] = [
  ['todayTag', 'dateFormat', (date, amount) => date.setDate(date.getDate() + amount)],
  ['weekTag', 'weekFormat', (date, amount, s) => {
    const weekStart = (date.getDay() - (parseInt(s.weekStartDay) || 0) + 7) % 7;
    date.setDate(date.getDate() - weekStart + amount);
  }],
  ['monthTag', 'monthFormat', (date, amount) => {
    date.setDate(1);
    date.setMonth(date.getMonth() + amount);
  }],
];

// Splits a token into the text before a date tag and the date tag (or the start of its name),
// so that suffixes like '#due#today+7' or '#due//to' work, too.
function splitDateTag(token: string, name: string): [string, string] {
  const minLength = name.length - name.replace(/^[^\p{L}\p{N}]+/u, '').length + 1;
  for (let i = 0; i < token.length; i++) {
    const tail = token.slice(i);
    if ((tail.length >= minLength && name.startsWith(tail)) || (tail.startsWith(name) && /^([+-]\d{0,4})?$/.test(tail.slice(name.length)))) {
      return [token.slice(0, i), tail];
    }
  }
  return ['', token];
}

// Date tags (#today, #week, #month, optionally with +n/-n) whose name the token could complete.
export function dateTagsFor(token: string, s: RawTagSettings, now = new Date()): DateTag[] {
  token = token.toLocaleLowerCase();
  const result: DateTag[] = [];
  for (const [nameKey, formatKey, shift] of kinds) {
    const name = String(s[nameKey]).trim().toLocaleLowerCase() || String(defaultSettings[nameKey]);
    const [head, tail] = splitDateTag(token, name);
    const offset = tail.startsWith(name) ? /^[+-]\d{1,4}$/.exec(tail.slice(name.length))?.[0] ?? '' : '';
    const date = new Date(now);
    shift(date, parseInt(offset || '0'), s);
    try {
      const pattern = String(s[formatKey]) || String(defaultSettings[formatKey]);
      result.push({ tag: head + name + offset, date: head + format(date, pattern), label: name.replace(/^[^\p{L}\p{N}]+/u, '') + offset });
    } catch {
      // Invalid date format in Tag Navigator's settings
    }
  }
  return result;
}
