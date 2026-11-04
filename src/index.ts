import joplin from 'api';
import { ContentScriptType, SettingItemType } from 'api/types';
import { Rankable } from './fuzzy';
import { RawTagSettings, TagSettings, compileSettings, defaultSettings, parseTags } from './parser';

const contentScriptId = 'tagNavigatorCompanion';
const tagNavigatorPrefix = 'plugin-joplin.plugin.alondmnt.tag-navigator.itags.';
const maxAge = 60 * 1000;

const notes = new Map<string, { updated: number; tags: Map<string, string> }>();
let rawSettings: RawTagSettings = defaultSettings;
let settings: TagSettings = compileSettings(defaultSettings);
let tagList: Rankable[] | null = null;
// Position in Joplin's change feed up to which `notes` is current; null means a full scan is due.
let cursor: string | null = null;
let rescan = false;
let version = 0;
let tagNavigatorActive = false;
let lastUpdate = 0;
let stale = true;
let running: Promise<void> | null = null;
let locale = 'en';

async function readSettings(): Promise<RawTagSettings | null> {
  const keys = Object.keys(defaultSettings) as (keyof RawTagSettings)[];
  let values: unknown[];
  try {
    values = await joplin.settings.globalValues(keys.map((key) => tagNavigatorPrefix + key));
  } catch {
    // Settings are unknown while Tag Navigator is not installed or disabled
    return null;
  }
  const raw: Record<string, unknown> = { ...defaultSettings };
  keys.forEach((key, i) => {
    if (typeof values[i] === typeof defaultSettings[key]) {
      raw[key] = values[i];
    }
  });
  return raw as unknown as RawTagSettings;
}

// Notes per tag, shown in the spelling most notes use.
function countTags(): Rankable[] {
  const counts = new Map<string, number>();
  const spellings = new Map<string, number>();
  const best = new Map<string, string>();
  for (const { tags } of notes.values()) {
    for (const [key, spelling] of tags) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const n = (spellings.get(spelling) ?? 0) + 1;
      spellings.set(spelling, n);
      const current = best.get(key);
      if (current === undefined || n > spellings.get(current) || (n === spellings.get(current) && spelling < current)) {
        best.set(key, spelling);
      }
    }
  }
  return [...counts].map(([key, count]) => ({ label: best.get(key), count }));
}

function forget(): void {
  notes.clear();
  cursor = null;
}

function indexed(note: any, raw: RawTagSettings): boolean {
  return !note.deleted_time && !note.is_conflict && !(raw.ignoreHtmlNotes && note.markup_language === 2);
}

async function readNote(id: string, raw: RawTagSettings): Promise<void> {
  const note = await joplin.data.get(['notes', id], { fields: ['updated_time', 'body', 'deleted_time', 'is_conflict', 'markup_language'] });
  if (indexed(note, raw)) {
    notes.set(id, { updated: note.updated_time, tags: parseTags(note.body ?? '', settings) });
  } else {
    notes.delete(id);
  }
}

async function scanAll(raw: RawTagSettings): Promise<void> {
  const seen = new Set<string>();
  const changed: string[] = [];
  for (let page = 1, hasMore = true; hasMore; page++) {
    const result = await joplin.data.get(['notes'], {
      fields: ['id', 'updated_time', 'deleted_time', 'is_conflict', 'markup_language'],
      order_by: 'id',
      limit: 100,
      page,
    });
    hasMore = result.has_more;
    for (const note of result.items) {
      if (!indexed(note, raw)) {
        continue;
      }
      seen.add(note.id);
      if (notes.get(note.id)?.updated !== note.updated_time) {
        changed.push(note.id);
      }
    }
  }
  for (const id of notes.keys()) {
    if (!seen.has(id)) {
      notes.delete(id);
    }
  }
  for (const id of changed) {
    await readNote(id, raw);
  }
}

// Reads only the notes changed since `from`, and returns the new position in the change feed.
async function readChanges(from: string, raw: RawTagSettings): Promise<string> {
  const deleted = new Map<string, boolean>();
  let at = from;
  for (let hasMore = true; hasMore;) {
    const result = await joplin.data.get(['events'], { cursor: at });
    for (const event of result.items) {
      if (event.item_type === 1) {
        deleted.set(event.item_id, event.type === 3);
      }
    }
    at = String(result.cursor ?? at);
    hasMore = result.has_more;
  }
  for (const [id, gone] of deleted) {
    if (gone) {
      notes.delete(id);
    } else {
      await readNote(id, raw);
    }
  }
  return at;
}

async function update(): Promise<void> {
  const raw = await readSettings();
  tagNavigatorActive = !!raw;
  if (!raw) {
    forget();
    tagList = [];
    lastUpdate = Date.now();
    return;
  }
  const settingsChanged = JSON.stringify(raw) !== JSON.stringify(rawSettings);
  if (settingsChanged || rescan) {
    forget();
    rescan = false;
    rawSettings = raw;
    settings = compileSettings(raw);
  }

  if (cursor === null) {
    // Take the position before scanning, so changes during the scan are read next time.
    const start = String((await joplin.data.get(['events'])).cursor);
    await scanAll(raw);
    cursor = start;
  } else {
    cursor = await readChanges(cursor, raw);
  }

  const list = countTags();
  if (settingsChanged || JSON.stringify(list) !== JSON.stringify(tagList)) {
    tagList = list;
    version++;
  }
  lastUpdate = Date.now();
}

function refresh(): void {
  if (Date.now() - lastUpdate > maxAge) {
    stale = true;
  }
  if (!stale || running) {
    return;
  }
  stale = false;
  running = update()
    .catch((error) => {
      stale = true;
      cursor = null;
      console.warn('Tag Navigator Companion: update failed', error);
    })
    .finally(() => {
      running = null;
    });
}

// The editor keeps the tag list and only gets it again when its version is outdated.
async function getTags(known: number) {
  refresh();
  if (!tagList) {
    await running;
  }
  if (!tagNavigatorActive) {
    return null;
  }
  return known === version ? { version } : { version, settings: rawSettings, locale, tags: tagList ?? [] };
}

joplin.plugins.register({
  onStart: async function() {
    locale = String(await joplin.settings.globalValue('locale') || locale);
    await joplin.settings.registerSection('tagNavigatorCompanion', {
      label: 'Tag Navigator Companion',
      iconName: 'fas fa-tags',
      description: 'Suggests inline tags while typing. Requires the Inline Tag Navigator plugin and uses its tag settings. '
        + 'Changes to Tag Navigator settings apply after switching notes, after a sync or at most a minute later. '
        + 'To apply them immediately, tick "Reload tags now" (works like a button and unticks itself). '
        + 'Keys in the suggestion list: Tab completes the next level, Shift-Tab goes one level up, Enter inserts the whole tag.',
    });
    await joplin.settings.registerSettings({
      reload: {
        value: false,
        type: SettingItemType.Bool,
        public: true,
        section: 'tagNavigatorCompanion',
        label: 'Reload tags now (tick to run)',
        description: 'Ticking this reloads all tags with the current Tag Navigator settings. The tick is removed again automatically.',
      },
    });

    const markStale = async () => {
      stale = true;
    };
    await joplin.workspace.onSyncComplete(markStale);
    await joplin.workspace.onNoteSelectionChange(markStale);
    await joplin.settings.onChange(async ({ keys }) => {
      if (keys.includes('reload') && await joplin.settings.value('reload')) {
        await joplin.settings.setValue('reload', false);
        rescan = true;
        stale = true;
        refresh();
      }
    });

    await joplin.contentScripts.register(ContentScriptType.CodeMirrorPlugin, contentScriptId, './contentScript.js');
    await joplin.contentScripts.onMessage(contentScriptId, async (message: unknown) => {
      const { name, version: known } = (message ?? {}) as { name?: unknown; version?: unknown };
      if (name !== 'getTags' || typeof known !== 'number') {
        return null;
      }
      return getTags(known);
    });
  },
});
