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

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement | null }>({});
  const playPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (videoRef.current && videoTrack) {
      if (isPlaying) {
        // Safe play
        playPromiseRef.current = videoRef.current.play()
          .catch(e => {
            console.error("Playback error:", e);
            // reset playing state on failure
            setEditState(prev => ({ ...prev, isPlaying: false }));
          });
      } else {
        if (playPromiseRef.current !== undefined) {
           videoRef.current.pause();
        }
      }
    }

    // Audio initial play/pause state
    if (!isPlaying) {
      Object.values(audioRefs.current).forEach(audioEl => {
        if (audioEl && !audioEl.paused) audioEl.pause();
      });
    }
  }, [isPlaying, videoTrack?.id]);

  useEffect(() => {
    if (!isPlaying) {
      // Sync Video Scrubbing
      if (videoRef.current && videoTrack) {
        const expectedTime = (currentTime - videoTrack.startTime) + (videoTrack.mediaStartTime || 0);
        if (Math.abs(videoRef.current.currentTime - expectedTime) > 0.05) {
          videoRef.current.currentTime = Math.max(0, expectedTime);
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

  // Use requestAnimationFrame for smooth 60fps playhead tracking
  useEffect(() => {
    let animationFrameId: number;
    
    const updatePlayhead = () => {
      if (isPlaying && videoRef.current && videoTrack) {
        const newTime = videoRef.current.currentTime;
        let appTime = videoTrack.startTime + newTime - (videoTrack.mediaStartTime || 0);
        
        if (appTime >= videoTrack.startTime + videoTrack.duration) {
           appTime = videoTrack.startTime + videoTrack.duration;
           
           const isFinalClip = !editState.videoTracks.some(t => t.startTime >= appTime - 0.05);
           if (isFinalClip) {
             videoRef.current.pause();
             setEditState(prev => ({
               ...prev,
               isPlaying: false,
               currentTime: 0,
             }));
             return; 
           }
        }

        // Sync Audio loop
        editState.audioTracks.forEach(track => {
          const audioEl = audioRefs.current[track.id];
          if (audioEl) {
            const isActive = appTime >= track.startTime && appTime <= track.startTime + track.duration;
            if (isActive) {
               if (audioEl.paused) audioEl.play().catch(e => console.error("Audio block play error:", e));
               const expectedAudioTime = (appTime - track.startTime) + (track.mediaStartTime || 0);
               if (Math.abs(audioEl.currentTime - expectedAudioTime) > 0.05) {
                 audioEl.currentTime = Math.max(0, expectedAudioTime);
               }
            } else {
               if (!audioEl.paused) audioEl.pause();
            }
          }
        });

        setEditState(prev => ({
          ...prev,
          currentTime: appTime,
        }));
        
        animationFrameId = requestAnimationFrame(updatePlayhead);
      }
    };

    if (isPlaying) {
      animationFrameId = requestAnimationFrame(updatePlayhead);
    }
    
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, videoTrack, editState.videoTracks, setEditState]);

  const handleEnded = () => {
    // Reached the physical end of the underlying video file
    // The timeline bounds checking in handleTimeUpdate should catch this first,
    // but this acts as a safe fallback
    setEditState((prev: EditState) => ({
      ...prev,
      isPlaying: false,
    }));
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

  // Pre-bound check bounds for rendering
  const activeVideoTrack = editState.videoTracks.find(
    t => currentTime >= t.startTime && currentTime <= t.startTime + t.duration
  );

  return (
    <div className="preview-window">
      {activeVideoTrack && activeVideoTrack.url ? (
        <div className="video-container" style={{ position: 'relative' }}>
          <video
            ref={videoRef}
            src={activeVideoTrack.url}
            className="preview-video"
            muted={activeVideoTrack.muted || false}
            onEnded={handleEnded}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              background: '#000',
            }}
          />
          
          {/* Black Fade Transition Overlay */}
          <div 
            className="black-fade-overlay"
            style={{
               position: 'absolute',
               top: 0, left: 0, right: 0, bottom: 0,
               backgroundColor: '#000',
               opacity: fadeOpacity,
               pointerEvents: 'none',
               transition: isPlaying ? 'none' : 'opacity 0.1s'
            }}
          />
          
          {/* Text Overlays */}
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

          {/* Invisible Audio Tracks */}
          {editState.audioTracks.map((track: TrackItem) => (
            <audio
              key={track.id}
              ref={(el) => { audioRefs.current[track.id] = el; }}
              src={track.url}
              style={{ display: 'none' }}
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
