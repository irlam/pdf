(() => {
  const DB_NAME = 'pdf-session-cache';
  const STORE = 'files';
  const KEY = 'last';

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        return reject(new Error('indexedDB not available'));
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onerror = () => reject(req.error || new Error('indexedDB error'));
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
    });
  }

  async function save(bytes, name) {
    if (!bytes) return;
    const payload = bytes instanceof ArrayBuffer ? bytes : bytes.buffer;
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(
          { bytes: payload, name: name || 'document.pdf', ts: Date.now() },
          KEY
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('PDF session save failed', err);
    }
  }

  async function load() {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('PDF session load failed', err);
      return null;
    }
  }

  async function clear() {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('PDF session clear failed', err);
    }
  }

  window.pdfSession = { save, load, clear };
})();
