import { useState, useEffect, useRef } from 'react';
import type { EditState, TrackItem } from '../App';

interface MultiTrackTimelineProps {
  editState: EditState;
  setEditState: React.Dispatch<React.SetStateAction<EditState>>;
  onHistoryChange: (state: EditState) => void;
  selectedTrackId: string | null;
  setSelectedTrackId: (id: string | null) => void;
  setSelectedTrackType: (type: string | null) => void;
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
  setSelectedTrackType
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

  return (
    <div className="multi-track-timeline">
      <div className="timeline-header">
        <div className="timeline-label">Timeline</div>
        <div className="timeline-controls">
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
        onMouseDown={onTimelineMouseDown}
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
                    transform: 'translateX(-50%)',
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

          <div className="track-group">
            <div className="track">
              <div className="track-info">
                <span className="track-icon">🎬</span>
                <span className="track-name">Video Track</span>
              </div>
              <div className="track-content" style={{ position: 'relative', minHeight: '60px', overflow: 'visible' }}>
                {editState.videoTracks.map((track, index, arr) => {
                  const nextTrack = arr[index + 1];
                  const isAdjacent = nextTrack && Math.abs((track.startTime + track.duration) - nextTrack.startTime) < 0.05;
                  const transitionPoint = (track.startTime + track.duration) * timelineScale;

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
                      {isAdjacent && (
                        <div 
                          className="transition-adder"
                          style={{
                            position: 'absolute',
                            left: `${transitionPoint}px`,
                            top: '30px',
                            transform: 'translate(-50%, -50%)',
                            width: '18px',
                            height: '18px',
                            backgroundColor: track.transitionOut === 'black-fade' ? '#00d4ff' : 'rgba(255,255,255,0.2)',
                            border: '1px solid rgba(255,255,255,0.5)',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            zIndex: 10,
                            fontSize: '14px',
                            fontWeight: 'bold',
                            color: track.transitionOut === 'black-fade' ? '#000' : '#fff'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditState(prev => {
                              const newTracks = prev.videoTracks.map(t => t.id === track.id ? { ...t, transitionOut: t.transitionOut === 'black-fade' ? null : 'black-fade' as any } : t);
                              const newState = { ...prev, videoTracks: newTracks };
                              onHistoryChange(newState);
                              return newState;
                            });
                          }}
                        >
                          {track.transitionOut === 'black-fade' ? '✓' : '+'}
                        </div>
                      )}
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
  );
};

export default MultiTrackTimeline;
