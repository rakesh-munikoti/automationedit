import { useState, useEffect } from 'react';

interface TimelineProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  edits: any;
  setEdits: (edits: any) => void;
  videoDuration: number;
}

const Timeline: React.FC<TimelineProps> = ({ videoRef, edits, setEdits }) => {
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateDuration = () => setDuration(video.duration);
    const updateCurrentTime = () => setCurrentTime(video.currentTime);

    video.addEventListener('loadedmetadata', updateDuration);
    video.addEventListener('timeupdate', updateCurrentTime);

    return () => {
      video.removeEventListener('loadedmetadata', updateDuration);
      video.removeEventListener('timeupdate', updateCurrentTime);
    };
  }, [videoRef]);

  const handleStartTimeChange = (time: number) => {
    setEdits({ ...edits, startTime: time });
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handleEndTimeChange = (time: number) => {
    setEdits({ ...edits, endTime: time });
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <div className="timeline-container">
      <h3>Timeline Editor</h3>
      
      <div className="time-display">
        <span>Current: {formatTime(currentTime)} / {formatTime(duration)}</span>
      </div>

      <div className="timeline">
        <div className="timeline-wrapper">
          <div
            className="timeline-progress"
            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
          />
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={(e) => {
              const time = parseFloat(e.target.value);
              setCurrentTime(time);
              if (videoRef.current) {
                videoRef.current.currentTime = time;
              }
            }}
            className="timeline-input"
          />
        </div>
      </div>

      <div className="trim-section">
        <div className="trim-control">
          <label>Trim Start: {formatTime(edits.startTime)}</label>
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={edits.startTime}
            onChange={(e) => handleStartTimeChange(parseFloat(e.target.value))}
            className="slider"
          />
        </div>

        <div className="trim-control">
          <label>Trim End: {formatTime(edits.endTime)}</label>
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={edits.endTime || duration}
            onChange={(e) => handleEndTimeChange(parseFloat(e.target.value))}
            className="slider"
          />
        </div>
      </div>

      <div className="playback-controls">
        <button className="play-btn" onClick={() => videoRef.current?.play()}>
          ▶ Play
        </button>
        <button className="pause-btn" onClick={() => videoRef.current?.pause()}>
          ⏸ Pause
        </button>
      </div>
    </div>
  );
};

export default Timeline;
