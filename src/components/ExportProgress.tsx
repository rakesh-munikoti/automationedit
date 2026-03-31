import React from 'react';

interface ExportProgressProps {
  progress: number;
  message: string;
  onCancel?: () => void;
}

const ExportProgress: React.FC<ExportProgressProps> = ({ progress, message, onCancel }) => {
  return (
    <div className="export-progress-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 3000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(5px)'
    }}>
      <div className="export-progress-card" style={{
        width: '400px', backgroundColor: '#1a1a2e',
        borderRadius: '12px', padding: '30px',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '40px', marginBottom: '15px' }}>🎬</div>
        <h3 style={{ margin: '0 0 10px', fontSize: '20px', color: '#fff' }}>Exporting Video</h3>
        <p style={{ margin: '0 0 25px', fontSize: '14px', color: 'rgba(255,255,255,0.6)' }}>{message}</p>
        
        {/* Progress Bar Container */}
        <div style={{
          width: '100%', height: '8px', backgroundColor: 'rgba(255,255,255,0.1)',
          borderRadius: '10px', overflow: 'hidden', marginBottom: '10px'
        }}>
          <div 
            className="export-progress-bar-inner"
            style={{
              width: `${progress}%`, height: '100%',
              background: 'linear-gradient(90deg, #00d4ff, #00897b)',
              boxShadow: '0 0 10px rgba(0, 212, 255, 0.5)',
              transition: 'width 0.3s ease-out',
              borderRadius: '10px'
            }} 
          />
        </div>
        
        <div style={{ 
          display: 'flex', justifyContent: 'space-between', 
          fontSize: '12px', color: 'rgba(255,255,255,0.4)',
          marginBottom: '30px'
        }}>
          <span>Processing frames...</span>
          <span>{Math.round(progress)}%</span>
        </div>

        {onCancel && (
          <button 
            onClick={onCancel}
            style={{
              padding: '10px 20px', borderRadius: '6px', 
              border: '1px solid rgba(255,77,77,0.3)', 
              background: 'rgba(255,77,77,0.1)', color: '#ff4d4d',
              fontSize: '14px', fontWeight: 'bold', cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,77,77,0.2)'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,77,77,0.1)'; }}
          >
            Cancel Export
          </button>
        )}
      </div>
    </div>
  );
};

export default ExportProgress;
