import { useEffect, useRef, useMemo } from 'react';
import type { EditState, TrackItem } from '../App';

interface PreviewProps {
  editState: EditState;
  currentTime: number;
  isPlaying: boolean;
  setEditState: React.Dispatch<React.SetStateAction<EditState>>;
}

const Preview: React.FC<PreviewProps> = ({ editState, currentTime, isPlaying, setEditState }) => {
  // Find the exact video segment intersecting the playhead
  const videoTrack = useMemo(() => {
    // If currentTime is exactly at the end, it might fall between clips temporarily
    return editState.videoTracks.find(
      t => currentTime >= t.startTime && currentTime < t.startTime + t.duration
    ) || editState.videoTracks[editState.videoTracks.length - 1]; // fallback to last visually
  }, [editState.videoTracks, currentTime]);

  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement | null }>({});
  const playPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (isPlaying) {
      if (videoTrack) {
        const el = videoRefs.current[videoTrack.id];
        if (el) {
          playPromiseRef.current = el.play().catch(e => {
            console.error("Playback error:", e);
            setEditState(prev => ({ ...prev, isPlaying: false }));
          });
        }
      }
      
      // Stop all others to prevent multiple audio overlaps
      Object.keys(videoRefs.current).forEach(key => {
        if (key !== videoTrack?.id) {
          const el = videoRefs.current[key];
          if (el && !el.paused) el.pause();
        }
      });
    } else {
      Object.values(videoRefs.current).forEach(el => {
        if (el && !el.paused) el.pause();
      });
      Object.values(audioRefs.current).forEach(el => {
        if (el && !el.paused) el.pause();
      });
    }
  }, [isPlaying, videoTrack?.id, setEditState]);

  useEffect(() => {
    if (!isPlaying) {
      // Sync Video Scrubbing
      if (videoTrack) {
        const el = videoRefs.current[videoTrack.id];
        if (el) {
          const expectedTime = (currentTime - videoTrack.startTime) + (videoTrack.mediaStartTime || 0);
          if (Math.abs(el.currentTime - expectedTime) > 0.05) {
            el.currentTime = Math.max(0, expectedTime);
          }
        }
      }

      // Sync Audio Scrubbing
      editState.audioTracks.forEach(track => {
        const audioEl = audioRefs.current[track.id];
        if (audioEl) {
          const expectedTime = (currentTime - track.startTime) + (track.mediaStartTime || 0);
          if (Math.abs(audioEl.currentTime - expectedTime) > 0.05) {
            audioEl.currentTime = Math.max(0, expectedTime);
          }
        }
      });
    }
  }, [currentTime, isPlaying, videoTrack, editState.audioTracks]);

  // Handle Volume
  useEffect(() => {
    [...editState.videoTracks, ...(editState.clipTracks || [])].forEach(track => {
      const el = videoRefs.current[track.id];
      if (el) {
        el.volume = track.volume !== undefined ? track.volume : 1;
      }
    });
  }, [editState.videoTracks, editState.clipTracks]);

  useEffect(() => {
    editState.audioTracks.forEach(track => {
      const audioEl = audioRefs.current[track.id];
      if (audioEl) {
        audioEl.volume = track.volume !== undefined ? track.volume : 1;
      }
    });
  }, [editState.audioTracks]);

  // Use requestAnimationFrame for smooth 60fps playhead tracking based on WALL CLOCK
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = window.performance.now();
    
    const updatePlayhead = (now: DOMHighResTimeStamp) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      
      if (isPlaying) {
        setEditState(prev => {
          let nextTime = prev.currentTime + delta;
          
          if (prev.duration > 0 && nextTime >= prev.duration) {
             nextTime = prev.duration;
             Object.values(videoRefs.current).forEach(v => v && !v.paused && v.pause());
             Object.values(audioRefs.current).forEach(a => a && !a.paused && a.pause());
             return { ...prev, currentTime: 0, isPlaying: false };
          }
          
          // Sync Audio loop smoothly
          prev.audioTracks.forEach(track => {
            const audioEl = audioRefs.current[track.id];
            if (audioEl) {
              const isActive = nextTime >= track.startTime && nextTime <= track.startTime + track.duration;
              if (isActive) {
                 if (audioEl.paused) audioEl.play().catch(() => {});
                 const expectedAudioTime = (nextTime - track.startTime) + (track.mediaStartTime || 0);
                 if (Math.abs(audioEl.currentTime - expectedAudioTime) > 0.15) {
                   audioEl.currentTime = expectedAudioTime;
                 }
              } else {
                 if (!audioEl.paused) audioEl.pause();
              }
            }
          });

          // Sync Video loops smoothly without deriving our timeline from them!
          const activeVideo = prev.videoTracks.find(t => nextTime >= t.startTime && nextTime < t.startTime + t.duration);
          if (activeVideo) {
            const vEl = videoRefs.current[activeVideo.id];
            if (vEl) {
               if (vEl.paused) vEl.play().catch(() => {});
               const expectedVideoTime = (nextTime - activeVideo.startTime) + (activeVideo.mediaStartTime || 0);
               if (Math.abs(vEl.currentTime - expectedVideoTime) > 0.2) {
                 vEl.currentTime = expectedVideoTime; // hard sync drift correction
               }
            }
          }
          
          const activeClip = (prev.clipTracks || []).find(t => nextTime >= t.startTime && nextTime < t.startTime + t.duration);
          if (activeClip) {
            const cEl = videoRefs.current[activeClip.id];
            if (cEl) {
               if (cEl.paused) cEl.play().catch(() => {});
               const expectedClipTime = (nextTime - activeClip.startTime) + (activeClip.mediaStartTime || 0);
               if (Math.abs(cEl.currentTime - expectedClipTime) > 0.2) {
                 cEl.currentTime = expectedClipTime; // hard sync drift correction
               }
            }
          }

          return { ...prev, currentTime: nextTime };
        });
      }
      
      animationFrameId = requestAnimationFrame(updatePlayhead);
    };

    if (isPlaying) {
      lastTime = window.performance.now();
      animationFrameId = requestAnimationFrame(updatePlayhead);
    }
    
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, setEditState]);

  const handleEnded = () => {
    // handled internally now
  };

  // Compute CSS Transition Opacity overlay
  let fadeOpacity = 0;
  if (videoTrack) {
    if (videoTrack.transitionOut === 'black-fade') {
      const endingTime = videoTrack.startTime + videoTrack.duration;
      const remaining = endingTime - currentTime;
      if (remaining > 0 && remaining <= 0.5) {
        fadeOpacity = 1 - (remaining / 0.5); // linearly increase to 1
      }
    }
    
    // Check if we are fading IN to a clip
    const prevTrack = editState.videoTracks.find(
      t => Math.abs((t.startTime + t.duration) - videoTrack.startTime) < 0.05
    );
    if (prevTrack?.transitionOut === 'black-fade') {
      const elapsed = currentTime - videoTrack.startTime;
      if (elapsed >= 0 && elapsed <= 0.5) {
        fadeOpacity = 1 - (elapsed / 0.5); // linearly decrease from 1
      }
    }
  }

  const activeVideoTrack = editState.videoTracks.find(
    t => currentTime >= t.startTime && currentTime <= t.startTime + t.duration
  );
  
  const activeClipTrack = (editState.clipTracks || []).find(
    t => currentTime >= t.startTime && currentTime <= t.startTime + t.duration
  );

  const hasMedia = editState.videoTracks.length > 0 || (editState.clipTracks && editState.clipTracks.length > 0);

  return (
    <div className="preview-window">
      {hasMedia ? (
        <div className="video-container" style={{ position: 'relative' }}>
          
          {/* Render a rolling window of video clips to prevent memory explosion tracking 50+ clips */}
          {[...editState.videoTracks, ...(editState.clipTracks || [])].filter(
             t => (t.startTime >= currentTime - 2 && t.startTime <= currentTime + 5) ||
                  (currentTime >= t.startTime && currentTime <= t.startTime + t.duration)
          ).map((track) => {
             const isClipLayer = (editState.clipTracks || []).some(t => t.id === track.id);
             const isActive = isClipLayer ? (activeClipTrack?.id === track.id) : (activeVideoTrack?.id === track.id);
             
             return (
               <video
                 key={track.id}
                 ref={(el) => { 
                   if (el) videoRefs.current[track.id] = el; 
                   else delete videoRefs.current[track.id];
                 }}
                 src={track.url}
                 className="preview-video"
                 muted={track.muted || false}
                 onEnded={handleEnded}
                 preload="auto"
                 style={{
                   position: 'absolute',
                   top: 0,
                   left: 0,
                   width: '100%',
                   height: '100%',
                   objectFit: 'contain',
                   background: isClipLayer ? 'transparent' : '#000',
                   opacity: isActive ? 1 : 0,
                   pointerEvents: isActive ? 'auto' : 'none',
                   zIndex: isClipLayer ? 5 : 1 // Ensure B-Roll overlays main track visually if they overlap
                 }}
               />
             );
          })}
          
          {/* Black Fade Transition Overlay */}
          <div 
            className="black-fade-overlay"
            style={{
               position: 'absolute',
               top: 0, left: 0, right: 0, bottom: 0,
               backgroundColor: '#000',
               opacity: fadeOpacity,
               pointerEvents: 'none',
               transition: isPlaying ? 'none' : 'opacity 0.1s',
               zIndex: 10
            }}
          />
          
          {/* Text Overlays */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 20 }}>
            {editState.textTracks.map((text: TrackItem) => (
              <div
                key={text.id}
                className="text-overlay-preview"
                style={{
                  opacity: currentTime >= text.startTime && currentTime < text.startTime + text.duration ? 1 : 0,
                }}
              >
                {text.content}
              </div>
            ))}
          </div>

          {/* Invisible Audio Tracks - also rolling window */}
          {editState.audioTracks.filter(
             t => (t.startTime >= currentTime - 2 && t.startTime <= currentTime + 5) ||
                  (currentTime >= t.startTime && currentTime <= t.startTime + t.duration)
          ).map((track: TrackItem) => (
            <audio
              key={track.id}
              ref={(el) => { 
                if (el) audioRefs.current[track.id] = el; 
                else delete audioRefs.current[track.id];
              }}
              src={track.url}
              style={{ display: 'none' }}
              preload="auto"
            />
          ))}
        </div>
      ) : (
        <div className="preview-placeholder">
          <div className="placeholder-content">
            <p>👁️</p>
            <p>Preview</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Preview;
