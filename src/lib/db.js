/** IndexedDB storage for captures. Usable from pages and the service worker. */

const DB_NAME = "laqta";
const DB_VERSION = 1;
const STORE = "captures";

let dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        dbPromise = null;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    let result;
    Promise.resolve(callback(store))
      .then((value) => { result = value; })
      .catch(reject);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/**
 * @typedef {Object} CaptureRecord
 * @property {string} id
 * @property {Blob} blob            PNG image
 * @property {number} width         pixels
 * @property {number} height        pixels
 * @property {string} title         page title
 * @property {string} url           page URL
 * @property {number} createdAt     epoch milliseconds
 * @property {"full"|"visible"|"selection"} mode
 * @property {boolean} [trimmed]
 */

/** @param {CaptureRecord} record */
export function putCapture(record) {
  return withStore("readwrite", (store) => requestToPromise(store.put(record)));
}

/** @returns {Promise<CaptureRecord|undefined>} */
export function getCapture(id) {
  return withStore("readonly", (store) => requestToPromise(store.get(id)));
}

/** Newest first. @returns {Promise<CaptureRecord[]>} */
export async function listCaptures() {
  const records = await withStore("readonly", (store) => requestToPromise(store.index("createdAt").getAll()));
  return records.reverse();
}

export function deleteCapture(id) {
  return withStore("readwrite", (store) => requestToPromise(store.delete(id)));
}

export function clearCaptures() {
  return withStore("readwrite", (store) => requestToPromise(store.clear()));
}

/** Delete captures older than `maxAgeMs`. Returns the number removed. */
export async function pruneCaptures(maxAgeMs, now = Date.now()) {
  if (!(maxAgeMs > 0)) return 0;
  const cutoff = now - maxAgeMs;
  return withStore("readwrite", async (store) => {
    const keys = await requestToPromise(store.index("createdAt").getAllKeys(IDBKeyRange.upperBound(cutoff)));
    for (const key of keys) store.delete(key);
    return keys.length;
  });
}

export function newCaptureId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
