import { writable } from 'svelte/store';
import type { GameModule } from '$lib/play/module';
import type { GameRow } from '$lib/db';
import { db } from '$lib/db';

// ---------------------------------------------------------------------------
// Seed data: auto-discover meta.json from routes/play/{game}/
// ---------------------------------------------------------------------------

const metaFiles = import.meta.glob<Record<string, unknown>>(
  '/src/routes/play/*/meta.json',
  { eager: true, import: 'default' },
);

const SEED_DATA: GameRow[] = Object.entries(metaFiles)
  .map(([, meta]) => ({
    id: meta.id as string,
    emoji: meta.emoji as string,
    titleKey: meta.titleKey as string,
    descKey: meta.descKey as string,
    status: (meta.status as string) ?? 'playable',
    source: 'builtin',
    visible: true,
    sortOrder: 0,
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

// ---------------------------------------------------------------------------
// Reactive store
// ---------------------------------------------------------------------------

export const gameModules = writable<GameModule[]>([]);

function rowToModule(row: GameRow): GameModule {
  return {
    id: row.id,
    route: `/play/${row.id}`,
    emoji: row.emoji,
    titleKey: row.titleKey,
    descKey: row.descKey,
    status: (row.status as GameModule['status']) ?? 'playable',
    source: (row.source as GameModule['source']) ?? 'builtin',
    visible: row.visible,
    sortOrder: row.sortOrder,
  };
}

let _initialized = false;

/** Load games from DB. Seeds from meta.json on first run. */
export async function initGameRegistry(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  try {
    // Seed any new builtin games that aren't in the DB yet
    await db.games.seed(SEED_DATA);

    // Read all games from DB (includes sort_order, visibility)
    const rows = await db.games.list();
    gameModules.set(rows.map(rowToModule));
  } catch {
    // Fallback: use seed data directly
    gameModules.set(SEED_DATA.map((s) => rowToModule(s)));
  }
}

/** @deprecated Use gameModules store + initGameRegistry() instead */
export const GAME_MODULES: GameModule[] = SEED_DATA.map(rowToModule);
