import { dateTagsFor } from '../src/dateTags';
import { defaultSettings } from '../src/parser';

// Friday, 2026-10-30
const now = new Date(2026, 9, 30, 12);
const tags = (token: string, overrides = {}) => dateTagsFor(token, { ...defaultSettings, ...overrides }, now);

describe('dateTagsFor', () => {
  test('defaults like Tag Navigator', () => {
    expect(tags('#to')).toEqual([
      { tag: '#today', date: '#2026-10-30', label: 'today' },
      { tag: '#week', date: '#2026-10-25', label: 'week' },
      { tag: '#month', date: '#2026-10', label: 'month' },
    ]);
  });

  test('offsets', () => {
    expect(tags('#today+3')[0]).toEqual({ tag: '#today+3', date: '#2026-11-02', label: 'today+3' });
    // Like Tag Navigator, week offsets count days from the week start
    expect(tags('#week-1')[1].date).toBe('#2026-10-24');
    expect(tags('#week+7')[1].date).toBe('#2026-11-01');
    expect(tags('#month+3')[2].date).toBe('#2027-01');
    expect(tags('#today+')[0].tag).toBe('#today');
  });

  test('custom names, formats and week start', () => {
    const custom = { todayTag: ' //Today ', dateFormat: '//yyyy/MM/dd', weekStartDay: '1' };
    expect(tags('//today-1', custom)[0]).toEqual({ tag: '//today-1', date: '//2026/10/29', label: 'today-1' });
    expect(tags('#w', custom)[1].date).toBe('#2026-10-26');
  });

  test('empty settings fall back, invalid formats are skipped', () => {
    expect(tags('#t', { todayTag: '', dateFormat: '' })[0].date).toBe('#2026-10-30');
    expect(tags('#t', { dateFormat: 'yyyy-MM-dd-invalid-q' }).map((d) => d.label)).toEqual(['week', 'month']);
  });
});
