import { useState, useEffect, useRef, useCallback } from 'react';
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

const audioBufferCache = new Map<string, AudioBuffer>();

function useAudioPeaks(url: string | undefined, mediaStart: number, duration: number, widthPx: number) {
  const [peaks, setPeaks] = useState<number[]>([]);

  useEffect(() => {
    if (!url || widthPx < 10) return;
    
    let isCancelled = false;
    const computePeaks = async () => {
      let buffer = audioBufferCache.get(url);
      if (!buffer) {
        try {
          const res = await fetch(url);
          const arrayBuf = await res.arrayBuffer();
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (!AudioContextClass) return;
          const ctx = new AudioContextClass();
          buffer = await ctx.decodeAudioData(arrayBuf);
          audioBufferCache.set(url, buffer);
        } catch (e) {
          console.warn('Failed to decode audio for waveform', e);
          return;
        }
      }
      
      if (isCancelled || !buffer) return;

      const channelData = buffer.getChannelData(0); 
      const sampleRate = buffer.sampleRate;
      const startSample = Math.floor(mediaStart * sampleRate);
      const endSample = Math.min(channelData.length, Math.floor((mediaStart + duration) * sampleRate));
      
      const samplesInSegment = endSample - startSample;
      if (samplesInSegment <= 0) return;

      // Increase density: 2px per bar for more detailed spikes
      const numPeaks = Math.min(Math.floor(widthPx / 2), 2000);
      if (numPeaks === 0) return;
      
      const blockSize = Math.floor(samplesInSegment / numPeaks);
      const newPeaks = [];
      
      for (let i = 0; i < numPeaks; i++) {
        const offset = startSample + (i * blockSize);
        let max = 0;
        // Sample more densely (up to 500 points per block) to avoid missing transient spikes
        const step = Math.max(1, Math.floor(blockSize / 500));
        for (let j = 0; j < Math.min(blockSize, endSample - offset); j += step) {
          const val = Math.abs(channelData[offset + j]);
          if (val > max) max = val;
        }
        newPeaks.push(max);
      }
      
      setPeaks(newPeaks);
    };

    computePeaks();
    return () => { isCancelled = true; };
  }, [url, mediaStart, duration, widthPx]);

  return peaks;
}

const AudioWaveform = ({ url, mediaStartTime, duration, width }: { url?: string, mediaStartTime: number, duration: number, width: number }) => {
  const peaks = useAudioPeaks(url, mediaStartTime, duration, width);
  if (peaks.length === 0) return null;
  const maxPeak = Math.max(...peaks, 0.01); 
  
  return (
    <svg 
      width="100%" 
      height="100%" 
      preserveAspectRatio="none" 
      style={{ position: 'absolute', top: 0, left: 0, opacity: 0.8, pointerEvents: 'none' }}
    >
      {peaks.map((p, i) => {
        const norm = p / maxPeak;
        // Increase minimum height slightly and apply curve
        const h = Math.max(2, Math.pow(norm, 0.8) * 100); 
        const y = 50 - (h / 2);
        const x = (i / peaks.length) * 100;
        return (
          <rect 
            key={i} 
            x={`${x}%`} 
            y={`${y}%`} 
            width={`${(100 / peaks.length) * 0.7}%`} // Leaves a 30% gap between spikes
            height={`${h}%`} 
            fill="#00ffcc" 
            rx="0.5"
          />
        );
      })}
    </svg>
  );
};

const TrackClip = ({ 
  item, 
  trackType, 
  selectedTrackId, 
  setSelectedTrackId, 
  setSelectedTrackType,
  timelineScale,
  isDraggable,
  onDragStart
}: { 
  item: TrackItem; 
  trackType: string;
  selectedTrackId: string | null;
  setSelectedTrackId: (id: string | null) => void;
  setSelectedTrackType: (type: string | null) => void;
  timelineScale: number;
  isDraggable?: boolean;
  onDragStart?: (e: React.MouseEvent, type: 'body' | 'left' | 'right') => void;
}) => {
  const clipWidth = item.duration * timelineScale;
  const clipLeft = item.startTime * timelineScale;
  const isSelected = selectedTrackId === item.id;

  let icon = '🎬';
  if (trackType === 'audio') icon = '🔊';
  else if (trackType === 'text') icon = 'Aa';
  else if (trackType === 'clip') icon = '🎞️';
  else if (trackType === 'manual') icon = '📁';
  else if (trackType === 'overlay') icon = '🎥';

  const showContent = clipWidth > 20;
  const showText = clipWidth > 50;

  return (
    <div
      className={`clip ${isSelected ? 'selected' : ''} clip-${trackType}`}
      style={{
        left: `${clipLeft}px`,
        width: `${Math.max(clipWidth, 2)}px`,
        zIndex: isSelected ? 100 : 1,
        padding: clipWidth < 10 ? 0 : '',
        borderLeft: '1px solid rgba(0,0,0,0.5)',
        borderRight: '1px solid rgba(0,0,0,0.5)',
        overflow: 'hidden',
        position: 'absolute',
        cursor: isDraggable ? 'grab' : 'pointer'
      }}
      onMouseDown={(e) => {
        e.stopPropagation(); 
        setSelectedTrackId(item.id);
        setSelectedTrackType(trackType);
        if (isDraggable && onDragStart) {
          onDragStart(e, 'body');
        }
      }}
    >
      {(trackType === 'clip' || trackType === 'video' || trackType === 'manual' || trackType === 'overlay') && item.url && clipWidth > 10 && (
        <video 
          src={`${item.url}#t=${item.mediaStartTime || 0}`} 
          style={{ 
            position: 'absolute', 
            top: 0, left: 0, width: '100%', height: '100%', 
            objectFit: 'cover', 
            opacity: trackType === 'clip' ? 1 : 0.6, 
            pointerEvents: 'none',
            zIndex: 0
          }} 
          muted 
          playsInline
          preload="metadata"
        />
      )}

      {trackType === 'audio' && (
        <AudioWaveform 
          url={item.url} 
          mediaStartTime={item.mediaStartTime || 0} 
          duration={item.duration} 
          width={clipWidth} 
        />
      )}
      
      {clipWidth > 15 && (
        <div 
          className="clip-handle clip-handle-left" 
          style={{ zIndex: 2, cursor: isDraggable ? 'ew-resize' : 'auto' }} 
          onMouseDown={(e) => {
            if (isDraggable && onDragStart) {
              e.stopPropagation();
              setSelectedTrackId(item.id);
              setSelectedTrackType(trackType);
              onDragStart(e, 'left');
            }
          }}
        />
      )}
      
      <div className="clip-content" style={{ opacity: showContent ? 1 : 0, zIndex: 2, position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
        {showContent && trackType !== 'clip' && trackType !== 'manual' && trackType !== 'overlay' && (
          <span className="clip-label" style={{ 
            padding: '2px 6px', 
            textShadow: trackType === 'audio' ? 'none' : '1px 1px 2px rgba(0,0,0,0.8)',
            background: trackType === 'audio' ? 'rgba(0,0,0,0.5)' : 'transparent',
            borderRadius: '4px',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {icon} {showText && item.id.slice(0, 8)}
          </span>
        )}
      </div>
      
      {clipWidth > 15 && (
        <div 
          className="clip-handle clip-handle-right" 
          style={{ zIndex: 2, cursor: isDraggable ? 'ew-resize' : 'auto' }} 
          onMouseDown={(e) => {
            if (isDraggable && onDragStart) {
              e.stopPropagation();
              setSelectedTrackId(item.id);
              setSelectedTrackType(trackType);
              onDragStart(e, 'right');
            }
          }}
        />
      )}
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
  
  interface DragState {
    id: string;
    type: 'body' | 'left' | 'right';
    startX: number;
    initialClip: TrackItem;
    trackType: string;
  }
  const [dragState, setDragState] = useState<DragState | null>(null);

  const stateRef = useRef(editState);
  stateRef.current = editState;

  // Keydown to handle splitting (Ctrl+Shift+D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const state = stateRef.current;
        const ct = state.currentTime;
        
        const trackGroups: Array<'videoTracks' | 'clipTracks' | 'manualClipTracks' | 'overlayTracks' | 'audioTracks'> = ['overlayTracks', 'manualClipTracks', 'videoTracks', 'clipTracks', 'audioTracks'];
        let targetGroup: typeof trackGroups[number] | null = null;
        let clipToSplit: TrackItem | undefined;

        // First pass: try to split the currently selected clip across all tracks
        if (selectedTrackId) {
          for (const tg of trackGroups) {
            const arr = state[tg] || [];
            const found = arr.find(t => t.id === selectedTrackId && ct > t.startTime && ct < t.startTime + t.duration);
            if (found) {
              clipToSplit = found;
              targetGroup = tg;
              break;
            }
          }
        }

        // Second pass: fallback to splitting the base video track
        if (!clipToSplit) {
          clipToSplit = state.videoTracks.find(t => ct > t.startTime && ct < t.startTime + t.duration);
          if (clipToSplit) targetGroup = 'videoTracks';
        }

        if (clipToSplit && targetGroup) {
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
          
          const newArray = (state[targetGroup] || []).flatMap(t => {
            if (t.id === clipToSplit!.id) return [clipA, clipB];
            return [t];
          });
          
          const newState = { ...state, [targetGroup]: newArray };
          setEditState(newState);
          onHistoryChange(newState);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!selectedTrackId) return;
        const state = stateRef.current;
        const trackGroups: Array<'videoTracks' | 'clipTracks' | 'manualClipTracks' | 'overlayTracks' | 'audioTracks' | 'textTracks'> = ['overlayTracks', 'manualClipTracks', 'videoTracks', 'clipTracks', 'audioTracks', 'textTracks'];
        
        for (const tg of trackGroups) {
          const arr = state[tg] || [];
          if (arr.some(t => t.id === selectedTrackId)) {
             e.preventDefault();
             const newArray = arr.filter(t => t.id !== selectedTrackId);
             const newState = { ...state, [tg]: newArray };
             setEditState(newState);
             onHistoryChange(newState);
             setSelectedTrackId(null);
             setSelectedTrackType(null);
             break;
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTrackId, onHistoryChange, setEditState]);

  // Auto-fit timeline scale to fill available space
  const handleFitToScreen = useCallback(() => {
    if (editState.duration > 0 && timelineTracksRef.current && timelineTracksRef.current.parentElement) {
      // The parent element is the viewport container that doesn't stretch
      const viewportWidth = timelineTracksRef.current.parentElement.clientWidth;
      // Subtract the 140px sticky track headers on the left
      const availableSpace = viewportWidth - 140;
      // Give it a 5% margin to look clean on the right
      const targetWidth = availableSpace * 0.95;
      
      const optimalScale = targetWidth / editState.duration;
      // Allow scale between 2px/s up to 500px/s depending on video length
      const clampedScale = Math.round(Math.max(2, Math.min(500, optimalScale)));
      setTimelineScale(clampedScale);
    }
  }, [editState.duration]);

  useEffect(() => {
    handleFitToScreen();
    const handleResize = () => handleFitToScreen();
    window.addEventListener('resize', handleResize);
    const timer = setTimeout(handleFitToScreen, 150);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [handleFitToScreen]);

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

  const latestEditStateRef = useRef(editState);
  useEffect(() => { latestEditStateRef.current = editState; }, [editState]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isScrubbing) {
        handleScrub(e.clientX);
      } else if (dragState) {
        const deltaX = e.clientX - dragState.startX;
        const deltaSec = deltaX / timelineScale;
        
        setEditState(prev => {
           let tracksKey: 'videoTracks' | 'clipTracks' | 'manualClipTracks' | 'overlayTracks' | 'audioTracks' | 'textTracks';
           if (dragState.trackType === 'overlay') tracksKey = 'overlayTracks';
           else if (dragState.trackType === 'manual') tracksKey = 'manualClipTracks';
           else tracksKey = 'manualClipTracks';
           
           const arr = prev[tracksKey];
           if (!arr) return prev;
           
           const itemIndex = arr.findIndex(t => t.id === dragState.id);
           if (itemIndex === -1) return prev;
           
           const newArr = [...arr];
           const initial = dragState.initialClip;
           const updated = { ...initial };
           
           if (dragState.type === 'body') {
              updated.startTime = Math.max(0, initial.startTime + deltaSec);
           } else if (dragState.type === 'right') {
              const maxAllowedDuration = initial.sourceDuration !== undefined 
                ? initial.sourceDuration - (initial.mediaStartTime || 0) 
                : Infinity;
              updated.duration = Math.max(0.1, Math.min(initial.duration + deltaSec, maxAllowedDuration));
           } else if (dragState.type === 'left') {
              const maxLeftPull = -(initial.mediaStartTime || 0);
              const clippedDeltaSec = Math.max(maxLeftPull, deltaSec);
              const maxShrink = initial.duration - 0.1; 
              const boundedDeltaSec = Math.min(clippedDeltaSec, maxShrink);
              
              const newStartTime = initial.startTime + boundedDeltaSec;
              if (newStartTime >= 0) {
                 updated.startTime = newStartTime;
                 updated.duration = initial.duration - boundedDeltaSec;
                 updated.mediaStartTime = Math.max(0, (initial.mediaStartTime || 0) + boundedDeltaSec);
              }
           }
           
           newArr[itemIndex] = updated;
           return { ...prev, [tracksKey]: newArr.sort((a,b)=>a.startTime - b.startTime) };
        });
      }
    };
    
    const handleMouseUp = () => {
      if (isScrubbing) setIsScrubbing(false);
      if (dragState) {
        setDragState(null);
        onHistoryChange(latestEditStateRef.current);
      }
    };

    if (isScrubbing || dragState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, dragState, timelineScale, onHistoryChange]);

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

  const manualFileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadManualClip = (e: React.ChangeEvent<HTMLInputElement>, clipToReplace: TrackItem) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = url;
    video.onloadedmetadata = () => {
      // Limit the manual clip duration to the slot's original duration
      const dur = Math.min(video.duration, clipToReplace.duration);

      const newManualClip: TrackItem = {
        id: `manual-clip-${Date.now()}`,
        type: 'video', 
        startTime: clipToReplace.startTime,
        duration: dur,
        mediaStartTime: 0,
        sourceDuration: video.duration,
        volume: 0.5,
        url,
        file
      };
      
      setEditState(prev => {
        // Remove any manual clip that strictly starts identically, preventing endless stacking on the exact same slot
        const filteredManual = (prev.manualClipTracks || []).filter(c => c.startTime !== clipToReplace.startTime);
        const newState = {
          ...prev,
          manualClipTracks: [...filteredManual, newManualClip].sort((a, b) => a.startTime - b.startTime)
        };
        onHistoryChange(newState);
        return newState;
      });
      setSelectedTrackId(null);
      
      if (manualFileInputRef.current) {
        manualFileInputRef.current.value = '';
      }
    };
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

            <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />
            <span style={{ fontSize: '11px', color: '#00d4ff', fontWeight: 'bold' }}>OR</span>
            
            <input 
              type="file" 
              accept="video/mp4,video/webm" 
              style={{ display: 'none' }} 
              ref={manualFileInputRef}
              onChange={(e) => handleUploadManualClip(e, selectedVideoTrack)}
            />
            <button 
              onClick={() => manualFileInputRef.current?.click()}
              style={{ background: 'linear-gradient(135deg, #0d8a5c 0%, #086141 100%)', border: '1px solid #14b87c', borderRadius: '2px', padding: '3px 8px', fontSize: '11px', fontWeight: 'bold', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              Manual Clip 📁
            </button>
          </div>
        )}

        <div className="timeline-controls" style={{ marginLeft: 'auto' }}>
          <button 
            className="zoom-btn"
            style={{ width: 'auto', padding: '0 8px', fontSize: '11px', fontWeight: 'bold' }}
            title="Fit to screen"
            onClick={handleFitToScreen}
          >
            FIT
          </button>
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

          {/* Overlay Track - above Manual Clips */}
          <div className="track-group">
            <div className="track">
              <div className="track-info">
                <span className="track-icon">🎥</span>
                <span className="track-name" style={{ color: '#a855f7' }}>Overlay</span>
              </div>
              <div className="track-content" style={{ position: 'relative', minHeight: '60px', overflow: 'visible' }}>
                {(editState.overlayTracks || []).map((track) => {
                  return (
                    <div key={track.id} style={{ position: 'absolute' }}>
                      <TrackClip 
                        item={track} 
                        trackType="overlay" 
                        selectedTrackId={selectedTrackId}
                        setSelectedTrackId={setSelectedTrackId}
                        setSelectedTrackType={setSelectedTrackType}
                        timelineScale={timelineScale}
                        isDraggable={true}
                        onDragStart={(e, type) => {
                           setDragState({
                              id: track.id,
                              type,
                              startX: e.clientX,
                              initialClip: track,
                              trackType: 'overlay'
                           });
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Manual Clips Track */}
          <div className="track-group">
            <div className="track">
              <div className="track-info">
                <span className="track-icon">📁</span>
                <span className="track-name" style={{ color: '#14b87c' }}>Manual Clips</span>
              </div>
              <div className="track-content" style={{ position: 'relative', minHeight: '60px', overflow: 'visible' }}>
                {(editState.manualClipTracks || []).map((track) => {
                  return (
                    <div key={track.id} style={{ position: 'absolute' }}>
                      <TrackClip 
                        item={track} 
                        trackType="manual" 
                        selectedTrackId={selectedTrackId}
                        setSelectedTrackId={setSelectedTrackId}
                        setSelectedTrackType={setSelectedTrackType}
                        timelineScale={timelineScale}
                        isDraggable={true}
                        onDragStart={(e, type) => {
                           setDragState({
                              id: track.id,
                              type,
                              startX: e.clientX,
                              initialClip: track,
                              trackType: 'manual'
                           });
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

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
                        trackType="clip" 
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
