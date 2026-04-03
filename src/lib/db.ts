import type { Actor, EditState, TrackItem } from '../App';

const DB_NAME = 'ClipAssemblerDB';
const DB_VERSION = 3; // Incremented to add projects_meta architecture
const STORE_NAME = 'actors';
const PROJECT_STORE = 'project';
const PROJECT_META_STORE = 'projects_meta';

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
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.createObjectStore(PROJECT_STORE);
      }
      if (!db.objectStoreNames.contains(PROJECT_META_STORE)) {
        db.createObjectStore(PROJECT_META_STORE);
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

// --- Project Persistence ---

const stripUrlsFromTracks = (tracks: TrackItem[]): TrackItem[] => {
  if (!tracks) return [];
  return tracks.map(t => {
    const { url, ...rest } = t;
    return rest;
  });
};

const rebuildUrlsForTracks = (tracks: TrackItem[]): TrackItem[] => {
  if (!tracks) return [];
  return tracks.map(t => {
    if (t.file) {
      return { ...t, url: URL.createObjectURL(t.file) };
    }
    return t;
  });
};

export interface Project {
  id: string;
  name: string;
  lastModified: number;
  state: EditState;
}

export interface ProjectMeta {
  id: string;
  name: string;
  lastModified: number;
}

export async function getAllProjects(): Promise<ProjectMeta[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PROJECT_STORE, PROJECT_META_STORE], 'readwrite');
    const metaStore = tx.objectStore(PROJECT_META_STORE);
    
    // Quick load from lightweight meta store
    const metaReq = metaStore.getAll();
    
    metaReq.onsuccess = () => {
       const metas = metaReq.result as ProjectMeta[];
       if (metas && metas.length > 0) {
          metas.sort((a,b) => b.lastModified - a.lastModified);
          resolve(metas);
       } else {
          // Backward compatibility: the database is older. Backfill from slow store!
          const store = tx.objectStore(PROJECT_STORE);
          const req = store.openCursor();
          const projects: ProjectMeta[] = [];
          
          req.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
              let meta: ProjectMeta | null = null;
              if (cursor.key === 'current_project') {
                 meta = { id: 'current_project', name: 'My First Project', lastModified: Date.now() };
              } else if (cursor.value.id) {
                 const proj = cursor.value as Project;
                 meta = { id: proj.id, name: proj.name, lastModified: proj.lastModified };
              }
              
              if (meta) {
                 projects.push(meta);
                 // Cache for future loads
                 metaStore.put(meta, meta.id);
              }
              cursor.continue();
            } else {
              projects.sort((a, b) => b.lastModified - a.lastModified);
              resolve(projects);
            }
          };
          req.onerror = () => reject(req.error);
       }
    };
    metaReq.onerror = () => reject(metaReq.error);
  });
}

export async function saveProject(project: Project): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PROJECT_STORE, PROJECT_META_STORE], 'readwrite');
    const store = tx.objectStore(PROJECT_STORE);
    const metaStore = tx.objectStore(PROJECT_META_STORE);
    
    // Strip volatile Blob URLs to avoid DataCloneError
    const cleanState: EditState = {
      ...project.state,
      videoTracks: stripUrlsFromTracks(project.state.videoTracks),
      clipTracks: stripUrlsFromTracks(project.state.clipTracks || []),
      manualClipTracks: stripUrlsFromTracks(project.state.manualClipTracks || []),
      overlayTracks: stripUrlsFromTracks(project.state.overlayTracks || []),
      audioTracks: stripUrlsFromTracks(project.state.audioTracks),
      textTracks: stripUrlsFromTracks(project.state.textTracks),
      imageTracks: stripUrlsFromTracks(project.state.imageTracks || [])
    };
    
    const cleanProject: Project = { ...project, state: cleanState };
    store.put(cleanProject, project.id);
    
    // Write lightweight meta mirror
    const meta: ProjectMeta = { id: project.id, name: project.name, lastModified: project.lastModified };
    const metaReq = metaStore.put(meta, project.id);
    
    metaReq.onsuccess = () => resolve();
    metaReq.onerror = () => reject(metaReq.error);
    
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadProject(id: string): Promise<Project | null> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, 'readonly');
    const store = tx.objectStore(PROJECT_STORE);
    const req = store.get(id);
    
    req.onsuccess = () => {
      if (req.result) {
        try {
          let project: Project;
          if (id === 'current_project') {
            // Rehydrate legacy state dynamically
            project = {
               id: 'current_project',
               name: 'My First Project',
               lastModified: Date.now(),
               state: req.result as EditState
            };
          } else {
            project = req.result as Project;
          }

          const restoredState: EditState = {
            ...project.state,
            videoTracks: rebuildUrlsForTracks(project.state.videoTracks),
            clipTracks: rebuildUrlsForTracks(project.state.clipTracks || []),
            manualClipTracks: rebuildUrlsForTracks(project.state.manualClipTracks || []),
            overlayTracks: rebuildUrlsForTracks(project.state.overlayTracks || []),
            audioTracks: rebuildUrlsForTracks(project.state.audioTracks),
            textTracks: rebuildUrlsForTracks(project.state.textTracks),
            imageTracks: rebuildUrlsForTracks(project.state.imageTracks || [])
          };
          
          resolve({ ...project, state: restoredState });
        } catch (err) {
          console.error("Error recreating project state URLs:", err);
          resolve(null);
        }
      } else {
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PROJECT_STORE, PROJECT_META_STORE], 'readwrite');
    tx.objectStore(PROJECT_STORE).delete(id);
    const metaReq = tx.objectStore(PROJECT_META_STORE).delete(id);
    
    metaReq.onsuccess = () => resolve();
    metaReq.onerror = () => reject(metaReq.error);
    tx.onerror = () => reject(tx.error);
  });
}
