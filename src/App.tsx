import { useState, useCallback, useEffect } from 'react';
import { FiUpload, FiDownload, FiPlay, FiPause, FiVolumeX, FiCopy, FiX } from 'react-icons/fi';
import { MdUndo, MdRedo } from 'react-icons/md';
import Preview from './components/Preview';
import MultiTrackTimeline from './components/MultiTrackTimeline';
import './App.css';

export interface TrackItem {
  id: string;
  type: 'video' | 'audio' | 'text' | 'image';
  startTime: number;
  duration: number;
  mediaStartTime?: number;
  transitionOut?: 'black-fade' | null;
  muted?: boolean;
  volume?: number;
  file?: File;
  url?: string;
  content?: string;
  effects?: EffectType[];
  properties?: Record<string, any>;
  /** Links a placed clip back to its source ActorClip for usage tracking */
  actorClipId?: string;
}

export interface ActorClip {
  id: string;
  file: File;
  url: string;
  duration: number;
  /** How many times this clip has been confirmed-used via the Done button */
  usageCount: number;
  /**
   * Groups clips that were uploaded together (same upload event = same outfit/batch).
   * Format: "batch-<timestamp>". Used by the queue builder to round-robin
   * across batches so the same outfit never appears twice in a row.
   */
  batchId?: string;
}

export interface Actor {
  id: string;
  name: string;
  clips: ActorClip[];
  /** Persistent ordered deck of clip IDs for sequential, non-repeating selection */
  deckQueue?: string[];
  /** How many clips from deckQueue have already been consumed */
  deckPosition?: number;
}

export interface EffectType {
  id: string;
  name: string;
  type: 'transition' | 'filter' | 'animation' | 'colorgrade';
  parameters?: Record<string, number>;
}

export interface EditState {
  videoTracks: TrackItem[];
  clipTracks: TrackItem[];
  audioTracks: TrackItem[];
  textTracks: TrackItem[];
  imageTracks: TrackItem[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
}

import ClipLibrary from './components/ClipLibrary';
import { loadActors, saveActors } from './lib/db';

function App() {
  const [hasVideo, setHasVideo] = useState(false);
  const [actors, setActors] = useState<Actor[]>([]);
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [isClipLibraryOpen, setIsClipLibraryOpen] = useState(false);

  // Load persistence state on app mount
  useEffect(() => {
    loadActors()
      .then(loadedActors => {
        setActors(loadedActors);
        setIsDbLoaded(true);
      })
      .catch(err => {
        console.error("Failed to load actors from DB", err);
        setIsDbLoaded(true); // Failsafe to allow saving new state
      });
  }, []);

  // Save changes explicitly whenever actors array is modified in state
  useEffect(() => {
    if (isDbLoaded) {
      saveActors(actors).catch(err => console.error("Failed to save actors to DB:", err));
    }
  }, [actors, isDbLoaded]);

  const [editState, setEditState] = useState<EditState>({
    videoTracks: [],
    clipTracks: [],
    audioTracks: [],
    textTracks: [],
    imageTracks: [],
    currentTime: 0,
    duration: 0,
    isPlaying: false,
  });

  const [history, setHistory] = useState<EditState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  const [isExporting, setIsExporting] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedTrackType, setSelectedTrackType] = useState<string | null>(null);

  const handleVideoUpload = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    
    // Create a video element to get duration
    const video = document.createElement('video');
    video.src = url;
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const newTrack: TrackItem = {
        id: `video-${Date.now()}`,
        type: 'video',
        startTime: 0,
        duration: duration,
        file,
        url,
      };
      
      setEditState(prev => {
         const newState = {
           ...prev,
           videoTracks: [newTrack],
           duration: duration
         };
         setHistory([newState]);
         setHistoryIndex(0);
         return newState;
      });
      setHasVideo(true);
    };
  }, []);

  const addToHistory = useCallback((newState: EditState) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newState);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setEditState(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setEditState(history[historyIndex + 1]);
    }
  }, [history, historyIndex]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Placeholder for export logic
      alert('Export feature coming soon! Premium feature available.');
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExtractAudio = useCallback(() => {
    if (!selectedTrackId || selectedTrackType !== 'video') return;

    setEditState((prev: EditState) => {
      const videoTrack = prev.videoTracks.find(t => t.id === selectedTrackId);
      if (!videoTrack) return prev;

      const newVideoTracks = prev.videoTracks.map(t => 
        t.id === selectedTrackId ? { ...t, muted: true } : t
      );
      
      const newAudioTrack: TrackItem = {
        ...videoTrack,
        id: `audio-ext-${Date.now()}`,
        type: 'audio',
        muted: false,
        transitionOut: null
      };

      const newState = {
        ...prev,
        videoTracks: newVideoTracks,
        audioTracks: [...prev.audioTracks, newAudioTrack]
      };
      
      addToHistory(newState);
      return newState;
    });
  }, [selectedTrackId, selectedTrackType, addToHistory]);

  const handleDuplicate = useCallback(() => {
    if (!selectedTrackId) return;

    setEditState((prev: EditState) => {
      let itemToDup = prev.videoTracks.find(t => t.id === selectedTrackId) ||
                      prev.audioTracks.find(t => t.id === selectedTrackId) ||
                      prev.textTracks.find(t => t.id === selectedTrackId);
      
      if (!itemToDup) return prev;

      const newItem = {
        ...itemToDup,
        id: `${itemToDup.type}-${Date.now()}`,
        startTime: itemToDup.startTime + itemToDup.duration // Place it right after
      };
      
      const newState = { ...prev };
      if (itemToDup.type === 'video') newState.videoTracks = [...newState.videoTracks, newItem];
      else if (itemToDup.type === 'audio') newState.audioTracks = [...newState.audioTracks, newItem];
      else if (itemToDup.type === 'text') newState.textTracks = [...newState.textTracks, newItem];
      
      addToHistory(newState);
      return newState;
    });
  }, [selectedTrackId, addToHistory]);

  const handleDelete = useCallback(() => {
    if (!selectedTrackId) return;

    setEditState((prev: EditState) => {
      const newState = {
        ...prev,
        videoTracks: prev.videoTracks.filter(t => t.id !== selectedTrackId),
        audioTracks: prev.audioTracks.filter(t => t.id !== selectedTrackId),
        textTracks: prev.textTracks.filter(t => t.id !== selectedTrackId)
      };
      addToHistory(newState);
      setSelectedTrackId(null);
      setSelectedTrackType(null);
      return newState;
    });
  }, [selectedTrackId, addToHistory]);

  // Mark all actor clips currently on the clip track as "used" once per Done press
  const handleDone = useCallback(() => {
    const clipTracks = editState.clipTracks || [];
    if (clipTracks.length === 0) return;

    // Gather a map of actorClipId -> how many times it appears in the current clip track
    const usageDelta: Record<string, number> = {};
    for (const track of clipTracks) {
      if (track.actorClipId) {
        usageDelta[track.actorClipId] = (usageDelta[track.actorClipId] || 0) + 1;
      }
    }

    if (Object.keys(usageDelta).length === 0) return;

    setActors(prevActors =>
      prevActors.map(actor => ({
        ...actor,
        clips: actor.clips.map(clip =>
          usageDelta[clip.id]
            ? { ...clip, usageCount: clip.usageCount + usageDelta[clip.id] }
            : clip
        )
      }))
    );
  }, [editState.clipTracks, setActors]);

  // Global spacebar listener for playback
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      
      if (e.code === 'Space') {
        e.preventDefault();
        setEditState(prev => {
          if (!prev.isPlaying && prev.currentTime >= prev.duration - 0.1 && prev.duration > 0) {
            return { ...prev, isPlaying: true, currentTime: 0 };
          }
          return { ...prev, isPlaying: !prev.isPlaying };
        });
      }
      if (e.ctrlKey && !e.shiftKey && e.code === 'KeyZ') {
        e.preventDefault();
        undo();
      }
      
      if (e.ctrlKey && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) {
        e.preventDefault();
        redo();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return (
    <div className="capcut-editor">
      {/* Top Bar */}
      <div className="top-bar">
        <div className="brand">
          <h1>CutStudio</h1>
          <p>Professional Video Editor</p>
        </div>
        
        <div className="top-actions">
          <button className="icon-btn" title="Undo" onClick={undo} disabled={historyIndex <= 0}>
            <MdUndo size={18} />
          </button>
          <button className="icon-btn" title="Redo" onClick={redo} disabled={historyIndex >= history.length - 1}>
            <MdRedo size={18} />
          </button>
          <div className="action-divider" style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)', margin: '0 8px' }} />
          <button className="btn-library" style={{ background: '#333', color: '#fff', padding: '6px 16px', borderRadius: '4px', fontSize: '14px', border: '1px solid rgba(255,255,255,0.1)', marginRight: '8px', cursor: 'pointer' }} onClick={() => setIsClipLibraryOpen(true)}>
            🎥 Clip Library
          </button>
          <button 
            className="icon-btn extraction-btn" 
            title="Extract Audio" 
            onClick={handleExtractAudio}
            disabled={selectedTrackType !== 'video'}
            style={{ 
              color: selectedTrackType === 'video' ? '#00d4ff' : 'rgba(255,255,255,0.2)',
              border: selectedTrackType === 'video' ? '1px solid #00d4ff' : '1px solid rgba(255,255,255,0.05)'
            }}
          >
            <FiVolumeX size={18} />
          </button>
          <button 
            className="icon-btn" 
            title="Duplicate" 
            onClick={handleDuplicate}
            disabled={!selectedTrackId}
            style={{ 
              color: selectedTrackId ? '#fff' : 'rgba(255,255,255,0.1)',
            }}
          >
            <FiCopy size={18} />
          </button>
          <button 
            className="icon-btn" 
            title="Delete" 
            onClick={handleDelete}
            disabled={!selectedTrackId}
            style={{ 
              color: selectedTrackId ? '#ff4d4d' : 'rgba(255,255,255,0.1)',
            }}
          >
            <FiX size={18} />
          </button>
          <button className="btn-export" onClick={handleExport} disabled={isExporting}>
            <FiDownload /> {isExporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>

      <div className={`editor-layout ${!hasVideo ? 'empty-state' : ''}`}>
        {!hasVideo ? (
          <div className="upload-area">
            <div className="upload-prompt">
              <div className="upload-icon">🎬</div>
              <h2>Start Creating</h2>
              <p>Import video, audio, images, or start from scratch</p>
              
              <div className="quick-import">
                <label className="import-btn">
                  <FiUpload /> Import Media
                  <input
                    type="file"
                    hidden
                    accept="video/*,audio/*,image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleVideoUpload(file);
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Main Editing Area - Timeline Only */}
            <div className="main-workspace">
              {/* Timeline */}
              <div className="timeline-area">
                <MultiTrackTimeline 
                  editState={editState}
                  setEditState={setEditState}
                  onHistoryChange={addToHistory}
                  selectedTrackId={selectedTrackId}
                  setSelectedTrackId={setSelectedTrackId}
                  setSelectedTrackType={setSelectedTrackType}
                  actors={actors}
                  setActors={setActors}
                />
              </div>
            </div>

            {/* Right Sidebar - Preview & Library */}
            <div className="right-sidebar">
              {/* Preview Section */}
              <div className="preview-area">
                <Preview 
                  editState={editState}
                  currentTime={editState.currentTime}
                  isPlaying={editState.isPlaying}
                  setEditState={setEditState}
                />
                
                {/* Playback Controls */}
                <div className="playback-bar">
                  <button 
                    className="play-btn"
                    onClick={() => setEditState(prev => ({ ...prev, isPlaying: !prev.isPlaying }))}
                  >
                    {editState.isPlaying ? <FiPause size={20} /> : <FiPlay size={20} />}
                  </button>
                  <div className="time-display">
                    {Math.floor(editState.currentTime)}s / {Math.floor(editState.duration)}s
                  </div>
                </div>

                {/* Done Button — marks all current clip-track clips as used */}
                {(editState.clipTracks || []).length > 0 && (
                  <button
                    onClick={handleDone}
                    title="Mark all placed clips as used and lock in usage counts"
                    style={{
                      marginTop: '10px',
                      width: '100%',
                      padding: '10px 0',
                      background: 'linear-gradient(135deg, #00c853, #00897b)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      letterSpacing: '0.5px',
                      boxShadow: '0 2px 12px rgba(0, 200, 83, 0.35)',
                      transition: 'opacity 0.2s'
                    }}
                    onMouseOver={e => (e.currentTarget.style.opacity = '0.85')}
                    onMouseOut={e => (e.currentTarget.style.opacity = '1')}
                  >
                    ✅ Done — Lock Clip Usage
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      
      {isClipLibraryOpen && (
        <ClipLibrary 
          actors={actors} 
          setActors={setActors} 
          onClose={() => setIsClipLibraryOpen(false)} 
        />
      )}
    </div>
  );
}

export default App;
