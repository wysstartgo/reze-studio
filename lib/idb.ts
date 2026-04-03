/** Minimal IndexedDB key-value wrapper (async get/set/del). */

const DB_NAME = "reze-studio"
const STORE_NAME = "kv"
const DB_VERSION = 1

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return open().then((db) => {
    const t = db.transaction(STORE_NAME, mode)
    t.oncomplete = () => db.close()
    t.onerror = () => db.close()
    return t.objectStore(STORE_NAME)
  })
}

export async function idbGet<T = unknown>(key: string): Promise<T | undefined> {
  const store = await tx("readonly")
  return new Promise((resolve, reject) => {
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const store = await tx("readwrite")
  return new Promise((resolve, reject) => {
    const req = store.put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function idbDel(key: string): Promise<void> {
  const store = await tx("readwrite")
  return new Promise((resolve, reject) => {
    const req = store.delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}
