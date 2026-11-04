import { openDB } from 'idb';
import type { OutboxEntry, OutboxStore } from './outbox.js';

const DB = 'attivita-outbox';
const STORE = 'entries';

/** Browser outbox in IndexedDB; survives reloads and closing the app. */
export function idbOutboxStore(): OutboxStore {
  const db = openDB(DB, 1, { upgrade: d => { d.createObjectStore(STORE, { keyPath: 'id' }); } });
  return {
    async put(e) { await (await db).put(STORE, e); },
    async list(account) {
      const all = (await (await db).getAll(STORE)) as OutboxEntry[];
      return all.filter(e => e.account === account).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async remove(id) { await (await db).delete(STORE, id); },
  };
}
