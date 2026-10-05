// IndexedDB snapshot store.
//
// SQLite runs entirely in wasm memory, so the whole database file is serialised
// and written here after every mutation. That is cheap at this size (tens of
// KB) and keeps the storage story simple: no OPFS, no COOP/COEP headers, no
// worker, and the bytes are a real SQLite file that can be exported as-is.
//
// IndexedDB is not immune to "clear site data" - which is exactly why export
// exists. This is convenience, not the backup.

const DB_NAME = 'castle';
const DB_VERSION = 1;
const STORE = 'snapshots';
const KEY = 'main';

let openPromise = null;

function open() {
  if (openPromise) return openPromise;
  openPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('this browser has no IndexedDB, so nothing can be saved'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(STORE)) idb.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('could not open IndexedDB'));
    req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
  });
  return openPromise;
}

function tx(mode, run) {
  return open().then((idb) => new Promise((resolve, reject) => {
    const t = idb.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.onabort = () => reject(t.error || new Error('IndexedDB transaction aborted'));
  }));
}

/** The stored database image, or null if this is a first run. */
export async function loadSnapshot() {
  const value = await tx('readonly', (store) => store.get(KEY));
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

export async function saveSnapshot(bytes) {
  // Store a plain copy: a view onto the wasm heap would be invalidated by the
  // next memory growth, and structured clone would capture the whole heap.
  await tx('readwrite', (store) => store.put(new Uint8Array(bytes), KEY));
}

export async function clearSnapshot() {
  await tx('readwrite', (store) => store.delete(KEY));
}
