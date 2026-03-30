import React from 'react';
import { FiPlus, FiX } from 'react-icons/fi';

interface EffectsPanelProps {
  edits: any;
  setEdits: (edits: any) => void;
  onAudioUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const EffectsPanel: React.FC<EffectsPanelProps> = ({ edits, setEdits, onAudioUpload }) => {
  const addTextOverlay = () => {
    const newText = {
      text: 'Add text here',
      time: 0,
      duration: 5,
    };
    setEdits({
      ...edits,
      texts: [...edits.texts, newText],
    });
  };

  const updateText = (index: number, field: string, value: any) => {
    const updatedTexts = [...edits.texts];
    updatedTexts[index] = { ...updatedTexts[index], [field]: value };
    setEdits({ ...edits, texts: updatedTexts });
  };

  const removeText = (index: number) => {
    const updatedTexts = edits.texts.filter((_: any, i: number) => i !== index);
    setEdits({ ...edits, texts: updatedTexts });
  };

  return (
    <div className="effects-panel">
      <h3>Effects & Controls</h3>

      {/* Speed Control */}
      <div className="effect-group">
        <label>Playback Speed: {edits.speed.toFixed(1)}x</label>
        <input
          type="range"
          min="0.25"
          max="2"
          step="0.25"
          value={edits.speed}
          onChange={(e) => setEdits({ ...edits, speed: parseFloat(e.target.value) })}
          className="slider"
        />
        <div className="speed-presets">
          {[0.5, 1, 1.5, 2].map((speed) => (
            <button
              key={speed}
              className={`preset-btn ${edits.speed === speed ? 'active' : ''}`}
              onClick={() => setEdits({ ...edits, speed })}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>

      {/* Brightness */}
      <div className="effect-group">
        <label>Brightness: {edits.brightness}%</label>
        <input
          type="range"
          min="0"
          max="200"
          value={edits.brightness}
          onChange={(e) => setEdits({ ...edits, brightness: parseInt(e.target.value) })}
          className="slider"
        />
      </div>

      {/* Contrast */}
      <div className="effect-group">
        <label>Contrast: {edits.contrast}%</label>
        <input
          type="range"
          min="0"
          max="200"
          value={edits.contrast}
          onChange={(e) => setEdits({ ...edits, contrast: parseInt(e.target.value) })}
          className="slider"
        />
      </div>

      {/* Saturation */}
      <div className="effect-group">
        <label>Saturation: {edits.saturation}%</label>
        <input
          type="range"
          min="0"
          max="200"
          value={edits.saturation}
          onChange={(e) => setEdits({ ...edits, saturation: parseInt(e.target.value) })}
          className="slider"
        />
      </div>

      <div className="divider"></div>

      {/* Audio */}
      <div className="effect-group">
        <label>Background Audio</label>
        <input
          type="file"
          accept="audio/*"
          onChange={onAudioUpload}
          className="file-input-small"
        />
        {edits.audioFile && (
          <p className="file-selected">📁 {edits.audioFile.name}</p>
        )}
      </div>

      <div className="divider"></div>

      {/* Text Overlays */}
      <div className="text-overlays-section">
        <div className="section-header">
          <h4>Text Overlays</h4>
          <button className="add-btn" onClick={addTextOverlay}>
            <FiPlus /> Add Text
          </button>
        </div>

        {edits.texts.map((text: any, index: number) => (
          <div key={index} className="text-item">
            <input
              type="text"
              value={text.text}
              onChange={(e) => updateText(index, 'text', e.target.value)}
              placeholder="Enter text"
              className="text-input"
            />
            <div className="text-controls">
              <div>
                <label>Time (s): {text.time}</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={text.time}
                  onChange={(e) => updateText(index, 'time', parseInt(e.target.value))}
                  className="slider"
                />
              </div>
              <div>
                <label>Duration (s): {text.duration}</label>
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={text.duration}
                  onChange={(e) => updateText(index, 'duration', parseInt(e.target.value))}
                  className="slider"
                />
              </div>
            </div>
            <button
              className="remove-btn"
              onClick={() => removeText(index)}
            >
              <FiX /> Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EffectsPanel;
