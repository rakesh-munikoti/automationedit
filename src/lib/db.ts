import type { Actor } from '../App';

const DB_NAME = 'ClipAssemblerDB';
const DB_VERSION = 1;
const STORE_NAME = 'actors';

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function saveActors(actors: Actor[]): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // Remove the temporary 'url' property before saving to avoid StatedCloneError
    const cleanActors = actors.map(a => ({
      ...a,
      clips: a.clips.map(c => {
        const { url, ...rest } = c;
        return rest;
      })
    }));
    
    const req = store.put(cleanActors, 'all_actors');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadActors(): Promise<Actor[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get('all_actors');
    
    req.onsuccess = () => {
      if (req.result) {
        try {
          // Recreate the object URLs for the files
          const loadedActors: Actor[] = req.result.map((actor: any) => ({
            ...actor,
            clips: actor.clips.map((clip: any) => ({
              ...clip,
              usageCount: clip.usageCount ?? 0,  // backfill for clips saved before usageCount existed
              url: URL.createObjectURL(clip.file)
            }))
          }));
          resolve(loadedActors);
        } catch (err) {
          console.error("Error mapping loaded actors:", err);
          resolve([]);
        }
      } else {
        resolve([]);
      }
    };
    req.onerror = () => reject(req.error);
  });
}
