import React, { useEffect } from 'react';

interface VideoPlayerProps {
  videoUrl: string;
  edits: any;
  videoRef: React.RefObject<HTMLVideoElement>;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoUrl, edits, videoRef }) => {
  useEffect(() => {
    if (videoRef.current) {
      // Apply playback rate
      videoRef.current.playbackRate = edits.speed;
      
      // Apply CSS filters for brightness, contrast, saturation
      videoRef.current.style.filter = `
        brightness(${edits.brightness}%)
        contrast(${edits.contrast}%)
        saturate(${edits.saturation}%)
      `;
    }
  }, [edits.speed, edits.brightness, edits.contrast, edits.saturation, videoRef]);

  return (
    <div className="video-player">
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        className="video-element"
      />
      {edits.texts.map((text: any, idx: number) => (
        <div
          key={idx}
          className="text-overlay"
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            color: 'white',
            fontSize: '24px',
            fontWeight: 'bold',
            textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
            pointerEvents: 'none',
            display: edits.texts[idx].text ? 'block' : 'none',
          }}
        >
          {text.text}
        </div>
      ))}
    </div>
  );
};

export default VideoPlayer;
