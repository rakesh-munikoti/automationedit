import { useState, useEffect, useRef } from 'react';
import type { EditState, TrackItem, Actor } from '../App';

interface MultiTrackTimelineProps {
  editState: EditState;
  setEditState: React.Dispatch<React.SetStateAction<EditState>>;
  onHistoryChange: (state: EditState) => void;
  selectedTrackId: string | null;
  setSelectedTrackId: (id: string | null) => void;
  setSelectedTrackType: (type: string | null) => void;
  actors: Actor[];
  setActors: React.Dispatch<React.SetStateAction<Actor[]>>;
}

const TrackClip = ({ 
  item, 
  trackType, 
  selectedTrackId, 
  setSelectedTrackId, 
  setSelectedTrackType,
  timelineScale
}: { 
  item: TrackItem; 
  trackType: string;
  selectedTrackId: string | null;
  setSelectedTrackId: (id: string | null) => void;
  setSelectedTrackType: (type: string | null) => void;
  timelineScale: number;
}) => {
  const clipWidth = item.duration * timelineScale;
  const clipLeft = item.startTime * timelineScale;
  const isSelected = selectedTrackId === item.id;

  return (
    <div
      className={`clip ${isSelected ? 'selected' : ''} clip-${trackType}`}
      style={{
        left: `${clipLeft}px`,
        width: `${Math.max(clipWidth, 50)}px`,
        zIndex: isSelected ? 100 : 1
      }}
      onClick={(e) => {
        e.stopPropagation(); 
        setSelectedTrackId(item.id);
        setSelectedTrackType(trackType);
      }}
    >
      <div className="clip-handle clip-handle-left" />
      <div className="clip-content">
        <span className="clip-label">
          {trackType === 'audio' ? '🔊' : trackType === 'text' ? 'Aa' : '🎬'} {item.id.slice(0, 8)}
        </span>
      </div>
      <div className="clip-handle clip-handle-right" />
    </div>
  );
};

const MultiTrackTimeline: React.FC<MultiTrackTimelineProps> = ({ 
  editState, 
  setEditState, 
  onHistoryChange,
  selectedTrackId,
  setSelectedTrackId,
  setSelectedTrackType,
  actors,
  setActors
}) => {
  const [timelineScale, setTimelineScale] = useState(15); 
  const timelineTracksRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const stateRef = useRef(editState);
  stateRef.current = editState;

  // Keydown to handle splitting (Ctrl+Shift+D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        
        const state = stateRef.current;
        const ct = state.currentTime;
        
        let clipToSplit = state.videoTracks.find(t => t.id === selectedTrackId && ct > t.startTime && ct < t.startTime + t.duration);
        if (!clipToSplit) {
          clipToSplit = state.videoTracks.find(t => ct > t.startTime && ct < t.startTime + t.duration);
        }

        if (clipToSplit) {
          const clipA = {
            ...clipToSplit,
            duration: ct - clipToSplit.startTime,
            id: `${clipToSplit.id.split('-split-')[0]}-split-${Date.now()}-A`
          };
          
          const clipB: TrackItem = {
            ...clipToSplit,
            id: `${clipToSplit.id.split('-split-')[0]}-split-${Date.now()}-B`,
            startTime: ct,
            duration: clipToSplit.startTime + clipToSplit.duration - ct,
            mediaStartTime: (clipToSplit.mediaStartTime || 0) + (ct - clipToSplit.startTime),
            transitionOut: null
          };
          
          const newVideoTracks = state.videoTracks.flatMap(t => {
            if (t.id === clipToSplit!.id) return [clipA, clipB];
            return [t];
          });
          
          newVideoTracks.sort((a, b) => a.startTime - b.startTime);
          
          const newState = { ...state, videoTracks: newVideoTracks };
          setEditState(newState);
          onHistoryChange(newState);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTrackId, onHistoryChange, setEditState]);

  // Auto-fit timeline scale to fill available space
  useEffect(() => {
    const calculateScale = () => {
      if (editState.duration > 0 && timelineTracksRef.current) {
        const firstTrack = timelineTracksRef.current.querySelector('.track-content') as HTMLElement;
        if (firstTrack) {
          const contentWidth = firstTrack.clientWidth;
          const targetWidth = contentWidth * 0.95;
          const optimalScale = Math.floor(targetWidth / editState.duration);
          const clampedScale = Math.max(2, Math.min(100, optimalScale));
          setTimelineScale(clampedScale);
        }
      }
    };

    calculateScale();
    const handleResize = () => calculateScale();
    window.addEventListener('resize', handleResize);
    const timer = setTimeout(calculateScale, 150);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [editState.duration]);

  const handleScrub = (clientX: number) => {
    if (!timelineTracksRef.current) return;
    const rect = timelineTracksRef.current.getBoundingClientRect();
    const contentStartX = rect.left + 140; 
    
    let x = clientX - contentStartX;
    x = Math.max(0, x); 
    
    const newTime = x / timelineScale;
    
    setEditState(prev => {
      const clampedTime = Math.min(newTime, prev.duration > 0 ? prev.duration : Math.max(prev.duration, newTime));
      return { ...prev, currentTime: clampedTime };
    });
  };

  const onTimelineMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!timelineTracksRef.current) return;
    const rect = timelineTracksRef.current.getBoundingClientRect();
    
    // Always deselect first when clicking the background
    // If a clip was clicked, its e.stopPropagation() will prevent this from firing on the parent
    setSelectedTrackId(null);
    setSelectedTrackType(null);

    if (e.clientX >= rect.left + 140) {
      setIsScrubbing(true);
      handleScrub(e.clientX);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isScrubbing) {
        handleScrub(e.clientX);
      }
    };
    
    const handleMouseUp = () => {
      setIsScrubbing(false);
    };

    if (isScrubbing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, timelineScale, editState.duration]);

  const allTracksCount = editState.videoTracks.length + editState.audioTracks.length + editState.textTracks.length;

  const handleApplyActor = (clipToReplace: TrackItem, actorId: string) => {
    const actor = actors.find(a => a.id === actorId);
    if (!actor || actor.clips.length === 0) return;

    const duration = clipToReplace.duration;
    if (duration <= 0.05) return;

    // Fisher-Yates shuffle - returns a NEW shuffled array
    const shuffleArr = <T,>(arr: T[]): T[] => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    /**
     * Build a fresh ordered queue of clip IDs with batch-aware round-robin interleaving.
     *
     * Within each batch: sort by usageCount ASC, shuffle within same-count tiers.
     * Across batches: interleave one clip at a time (round-robin) so that no two
     * consecutive clips ever share the same batch (= same outfit/dress).
     *
     * Example with 2 batches [Y1,Y2,Y3] and [R1,R2]:
     *   → [Y1, R1, Y2, R2, Y3]
     */
    const buildQueue = (clips: typeof actor.clips): string[] => {
      // Group clips by batchId (clips without a batchId go into 'default')
      const batchMap = new Map<string, typeof actor.clips>();
      for (const clip of clips) {
        const bid = clip.batchId ?? 'default';
        if (!batchMap.has(bid)) batchMap.set(bid, []);
        batchMap.get(bid)!.push(clip);
      }

      // For each batch: sort by usageCount ASC, shuffle within same-count tiers
      const sortedBatches: string[][] = [];
      for (const batchClips of batchMap.values()) {
        const sorted = [...batchClips].sort((a, b) => (a.usageCount ?? 0) - (b.usageCount ?? 0));
        let batchQueue: string[] = [];
        let start = 0;
        while (start < sorted.length) {
          const tierVal = sorted[start].usageCount ?? 0;
          let end = start;
          while (end < sorted.length && (sorted[end].usageCount ?? 0) === tierVal) end++;
          batchQueue = [...batchQueue, ...shuffleArr(sorted.slice(start, end)).map(c => c.id)];
          start = end;
        }
        sortedBatches.push(batchQueue);
      }

      // Round-robin interleave: pick one from each batch in turn
      const result: string[] = [];
      const indices = new Array(sortedBatches.length).fill(0);
      let hasMore = true;
      while (hasMore) {
        hasMore = false;
        for (let i = 0; i < sortedBatches.length; i++) {
          if (indices[i] < sortedBatches[i].length) {
            result.push(sortedBatches[i][indices[i]++]);
            hasMore = true;
          }
        }
      }
      return result;
    };

    // Use existing queue/position if available, otherwise build a fresh one
    let queue: string[] = (actor.deckQueue && actor.deckQueue.length > 0)
      ? actor.deckQueue
      : buildQueue(actor.clips);
    let position = actor.deckPosition ?? 0;

    // If the queue has been fully consumed, start a new cycle
    if (position >= queue.length) {
      queue = buildQueue(actor.clips);
      position = 0;
    }

    let remainingDur = duration;
    let currentStartTime = clipToReplace.startTime;
    const newClips: TrackItem[] = [];
    let newPosition = position;

    let safety = 0;
    while (remainingDur > 0.01 && safety < 1000) {
      safety++;

      // Rebuild the queue (new cycle) if we reach the end mid-voiceover
      if (newPosition >= queue.length) {
        queue = buildQueue(actor.clips);
        newPosition = 0;
      }

      const clipId = queue[newPosition++];
      const pickedClip = actor.clips.find(c => c.id === clipId);
      if (!pickedClip) continue;

      const chunkDur = Math.min(2, remainingDur);

      newClips.push({
        id: `actor-repl-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        type: 'video',
        startTime: currentStartTime,
        duration: chunkDur,
        file: pickedClip.file,
        url: pickedClip.url,
        volume: 0.5,
        transitionOut: null,
        actorClipId: pickedClip.id
      });

      remainingDur -= chunkDur;
      currentStartTime += chunkDur;
    }

    // Persist the updated queue state into the actor (saved to IndexedDB automatically)
    setActors(prev => prev.map(a =>
      a.id === actorId
        ? { ...a, deckQueue: queue, deckPosition: newPosition }
        : a
    ));

    setEditState(prev => {
      const newVideoTracks = [...prev.videoTracks];
      const newClipTracks = [...(prev.clipTracks || []), ...newClips].sort((a, b) => a.startTime - b.startTime);
      const newState = { ...prev, videoTracks: newVideoTracks, clipTracks: newClipTracks };
      onHistoryChange(newState);
      return newState;
    });
    setSelectedTrackId(null);
  };


  const selectedVideoTrack = editState.videoTracks.find(t => t.id === selectedTrackId);

  return (
    <div className="multi-track-timeline">
      <div className="timeline-header">
        <div className="timeline-label">Timeline</div>
        
        {/* Replace Actor Context Menu */}
        {selectedVideoTrack && (
          <div style={{ marginLeft: '16px', display: 'flex', alignItems: 'center', gap: '8px', background: '#222', padding: '4px 8px', borderRadius: '4px', border: '1px solid #00d4ff', opacity: actors.length === 0 ? 0.5 : 1 }}>
            <span style={{ fontSize: '11px', color: '#00d4ff', fontWeight: 'bold' }}>🎭 Replace Clip:</span>
            {actors.length === 0 ? (
               <span style={{ fontSize: '11px', color: '#ccc' }}>Create Actor in Clip Library first</span>
            ) : (
              <select 
                onChange={(e) => { 
                  if (e.target.value) {
                    handleApplyActor(selectedVideoTrack, e.target.value);
                  }
                }}
                value=""
                style={{ background: '#111', color: '#fff', border: '1px solid #444', borderRadius: '2px', padding: '2px 4px', fontSize: '12px', outline: 'none', cursor: 'pointer' }}
              >
                <option value="" disabled>Select Actor...</option>
                {actors.filter(a => a.clips.length > 0).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="timeline-controls" style={{ marginLeft: 'auto' }}>
          <button 
            className="zoom-btn"
            onClick={() => setTimelineScale(Math.max(5, timelineScale - 5))}
          >
            −
          </button>
          <span className="zoom-level">{timelineScale}px/s</span>
          <button 
            className="zoom-btn"
            onClick={() => setTimelineScale(Math.min(100, timelineScale + 5))}
          >
            +
          </button>
        </div>
      </div>

      <div 
        className="timeline-tracks-container" 
        style={{ position: 'relative', flex: 1, overflowY: 'auto', overflowX: 'auto' }}
        onMouseDown={() => {
          setSelectedTrackId(null);
          setSelectedTrackType(null);
        }}
      >
        <div 
          className="timeline-tracks" 
          ref={timelineTracksRef} 
          style={{ 
            position: 'relative', 
            minHeight: '100%', 
            paddingBottom: '30px',
            minWidth: `max(100%, ${140 + (editState.duration > 0 ? editState.duration : 60) * timelineScale + 40}px)`
          }}
        >
          <div style={{ position: 'relative', height: 'max-content' }} onMouseDown={onTimelineMouseDown}>
          
          {/* Playhead Cursor */}
          {editState.duration > 0 && (
            <div 
              className="timeline-playhead"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${140 + (editState.currentTime * timelineScale)}px`,
                width: '2px',
                backgroundColor: '#00d4ff',
                zIndex: 50,
                pointerEvents: 'none',
                transform: 'translateX(-50%)',
                boxShadow: '0 0 8px rgba(0, 212, 255, 0.8)'
              }}
            >
              <div style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '12px',
                height: '16px',
                backgroundColor: '#00d4ff',
                borderRadius: '2px',
                clipPath: 'polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%)'
              }} />
            </div>
          )}

          {/* Timeline Ruler */}
          {editState.duration > 0 && (
            <div className="timeline-ruler-wrapper" style={{ 
              display: 'flex',
              position: 'relative',
              height: '24px', 
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            }}>
              {/* Sticky Top-Left Corner for UI consistency */}
              <div style={{ 
                width: '140px', 
                minWidth: '140px',
                background: '#0f0f1f', 
                position: 'sticky', 
                left: 0, 
                zIndex: 40,
                borderRight: '1px solid rgba(255, 255, 255, 0.08)'
              }}></div>
              
              <div className="timeline-ruler" style={{ position: 'relative', flex: 1 }}>
              {Array.from({ length: Math.ceil((editState.duration > 0 ? editState.duration : 60) / 5) + 1 }).map((_, i) => (
                <div 
                  key={i} 
                  style={{
                    position: 'absolute',
                    left: `${i * 5 * timelineScale}px`,
                    bottom: 0,
                    fontSize: '11px',
                    color: 'rgba(255, 255, 255, 0.5)',
                    transform: i === 0 ? 'translateX(4px)' : 'translateX(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    userSelect: 'none',
                    pointerEvents: 'none'
                  }}
                >
                  <span style={{ marginBottom: '4px' }}>{i * 5}s</span>
                  <div style={{ height: '6px', width: '1px', backgroundColor: 'rgba(255, 255, 255, 0.2)' }} />
                </div>
              ))}
              </div>
            </div>
          )}

          {/* Clips Track */}
          <div className="track-group">
            <div className="track">
              <div className="track-info">
                <span className="track-icon">🎞️</span>
                <span className="track-name">Clips Track</span>
              </div>
              <div className="track-content" style={{ position: 'relative', minHeight: '60px', overflow: 'visible' }}>
                {(editState.clipTracks || []).map((track) => {
                  return (
                    <div key={track.id} style={{ position: 'absolute' }}>
                      <TrackClip 
                        item={track} 
                        trackType="video" 
                        selectedTrackId={selectedTrackId}
                        setSelectedTrackId={setSelectedTrackId}
                        setSelectedTrackType={setSelectedTrackType}
                        timelineScale={timelineScale}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="track-group">
            <div className="track">
              <div className="track-info">
                <span className="track-icon">🎬</span>
                <span className="track-name">Video Track</span>
              </div>
              <div className="track-content" style={{ position: 'relative', minHeight: '60px', overflow: 'visible' }}>
                {editState.videoTracks.map((track) => {
                  return (
                    <div key={track.id} style={{ position: 'absolute' }}>
                      <TrackClip 
                        item={track} 
                        trackType="video" 
                        selectedTrackId={selectedTrackId}
                        setSelectedTrackId={setSelectedTrackId}
                        setSelectedTrackType={setSelectedTrackType}
                        timelineScale={timelineScale}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="track-group">
            <div className="track">
              <div className="track-info">
                <span className="track-icon">🔊</span>
                <span className="track-name">Audio Track</span>
              </div>
              <div className="track-content" style={{ position: 'relative', minHeight: '60px', overflow: 'visible' }}>
                {editState.audioTracks.map((track) => (
                  <TrackClip 
                    key={track.id}
                    item={track} 
                    trackType="audio" 
                    selectedTrackId={selectedTrackId}
                    setSelectedTrackId={setSelectedTrackId}
                    setSelectedTrackType={setSelectedTrackType}
                    timelineScale={timelineScale}
                  />
                ))}
              </div>
            </div>
          </div>

          {editState.textTracks.length > 0 && (
            <div className="track-group">
              {editState.textTracks.map(track => (
                <div key={track.id} className="track">
                  <div className="track-info">
                    <span className="track-icon">Aa</span>
                    <span className="track-name">{track.content}</span>
                  </div>
                  <div className="track-content" style={{ minHeight: '60px' }}>
                    <TrackClip 
                      item={track} 
                      trackType="text" 
                      selectedTrackId={selectedTrackId}
                      setSelectedTrackId={setSelectedTrackId}
                      setSelectedTrackType={setSelectedTrackType}
                      timelineScale={timelineScale}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {allTracksCount === 0 && (
            <div className="empty-timeline" style={{ padding: '40px', textAlign: 'center' }}>
              Import media to begin editing
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiTrackTimeline;
