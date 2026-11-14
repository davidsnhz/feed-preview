// Almacén mínimo en IndexedDB para las fotos (los blobs no caben en localStorage).
const DB_NAME = 'feed-preview';
const STORE = 'photos';

let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => {
      const db = req.result;
      // Si el navegador cierra la conexión (pasa en móviles al dejar la app en
      // segundo plano), se descarta para que la siguiente operación la reabra.
      db.onclose = db.onversionchange = () => {
        db.close();
        dbPromise = undefined;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  }).catch((error) => {
    dbPromise = undefined; // permite reintentar más tarde
    throw error;
  });
  return dbPromise;
}

async function run(mode, fn, retry = true) {
  const db = await open();
  let tx;
  try {
    tx = db.transaction(STORE, mode);
  } catch (error) {
    // Conexión muerta: se reabre y se reintenta una vez.
    dbPromise = undefined;
    if (!retry) throw error;
    return run(mode, fn, false);
  }
  return new Promise((resolve, reject) => {
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

export const getAllPhotos = () => run('readonly', (s) => s.getAll());
export const putPhoto = (record) => run('readwrite', (s) => s.put(record));
export const deletePhoto = (id) => run('readwrite', (s) => s.delete(id));
export const clearPhotos = () => run('readwrite', (s) => s.clear());
