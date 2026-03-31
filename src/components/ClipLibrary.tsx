import React, { useState, useRef } from 'react';
import { FiX, FiPlus, FiUpload, FiTrash2 } from 'react-icons/fi';
import type { Actor, ActorClip } from '../App';

interface ClipLibraryProps {
  actors: Actor[];
  setActors: React.Dispatch<React.SetStateAction<Actor[]>>;
  onClose: () => void;
}

const ClipLibrary: React.FC<ClipLibraryProps> = ({ actors, setActors, onClose }) => {
  const [newActorName, setNewActorName] = useState('');
  const [selectedActorId, setSelectedActorId] = useState<string | null>(actors.length > 0 ? actors[0].id : null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateActor = () => {
    if (!newActorName.trim()) return;
    const newActor: Actor = {
      id: `actor-${Date.now()}`,
      name: newActorName.trim(),
      clips: []
    };
    setActors([...actors, newActor]);
    setSelectedActorId(newActor.id);
    setNewActorName('');
  };

  const handleDeleteActor = (id: string) => {
    setActors(actors.filter(a => a.id !== id));
    if (selectedActorId === id) {
      setSelectedActorId(actors.length > 1 ? actors.find(a => a.id !== id)?.id || null : null);
    }
  };

  const handleDeleteClip = (actorId: string, clipId: string) => {
    setActors(actors.map(a => {
      if (a.id === actorId) {
        return { ...a, clips: a.clips.filter(c => c.id !== clipId) };
      }
      return a;
    }));
  };

  const handleUploadClips = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !selectedActorId) return;
    
    const files = Array.from(e.target.files);
    
    files.forEach(file => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.src = url;
      video.onloadedmetadata = () => {
        const newClip: ActorClip = {
          id: `actorclip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file,
          url,
          duration: video.duration
        };
        
        setActors(prevActors => prevActors.map(a => {
          if (a.id === selectedActorId) {
            return { ...a, clips: [...a.clips, newClip] };
          }
          return a;
        }));
      };
    });
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const selectedActor = actors.find(a => a.id === selectedActorId);

  return (
    <div className="clip-library-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div className="clip-library-modal" style={{
        width: '80%', height: '80%', backgroundColor: '#1a1a2e',
        borderRadius: '12px', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
      }}>
        <div style={{
          padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          backgroundColor: '#0f0f1f'
        }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🎥</span> Actor Clip Library
          </h2>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: '#fff',
            cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center'
          }}>
            <FiX size={24} />
          </button>
        </div>
        
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar - Actors List */}
          <div style={{
            width: '250px', borderRight: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', flexDirection: 'column', backgroundColor: '#111122'
          }}>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  value={newActorName}
                  onChange={(e) => setNewActorName(e.target.value)}
                  placeholder="New Actor Name"
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: '4px',
                    border: '1px solid rgba(255,255,255,0.2)', backgroundColor: 'rgba(0,0,0,0.2)',
                    color: '#fff'
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateActor()}
                />
                <button 
                  onClick={handleCreateActor}
                  style={{
                    backgroundColor: '#00d4ff', color: '#000', border: 'none',
                    borderRadius: '4px', padding: '0 12px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  <FiPlus />
                </button>
              </div>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {actors.map(actor => (
                <div 
                  key={actor.id}
                  onClick={() => setSelectedActorId(actor.id)}
                  style={{
                    padding: '12px 20px', cursor: 'pointer',
                    backgroundColor: selectedActorId === actor.id ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
                    borderLeft: `3px solid ${selectedActorId === actor.id ? '#00d4ff' : 'transparent'}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}
                >
                  <span>{actor.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                      {actor.clips.length}
                    </span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteActor(actor.id); }}
                      style={{
                        background: 'transparent', border: 'none', color: '#ff4d4d',
                        cursor: 'pointer', padding: '4px', opacity: selectedActorId === actor.id ? 1 : 0.3
                      }}
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {actors.length === 0 && (
                <div style={{ padding: '20px', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                  No actors created yet.
                </div>
              )}
            </div>
          </div>
          
          {/* Main Area - Actor Clips */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#1a1a2e' }}>
            {selectedActor ? (
              <>
                <div style={{
                  padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <h3>{selectedActor.name}'s Clips</h3>
                  <label style={{
                    backgroundColor: '#00d4ff', color: '#000', padding: '8px 16px',
                    borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                    fontWeight: 'bold'
                  }}>
                    <FiUpload /> Upload Clips
                    <input 
                      type="file" 
                      multiple 
                      accept="video/*" 
                      style={{ display: 'none' }} 
                      ref={fileInputRef}
                      onChange={handleUploadClips}
                    />
                  </label>
                </div>
                
                <div style={{
                  flex: 1, overflowY: 'auto', padding: '20px',
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '20px', alignContent: 'start'
                }}>
                  {selectedActor.clips.map(clip => (
                    <div key={clip.id} style={{
                      backgroundColor: '#2a2a3e', borderRadius: '8px', overflow: 'hidden',
                      position: 'relative', border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                      <div style={{ aspectRatio: '16/9', backgroundColor: '#000' }}>
                        <video 
                          src={clip.url} 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onMouseOver={e => (e.target as HTMLVideoElement).play()}
                          onMouseOut={e => {
                            const v = e.target as HTMLVideoElement;
                            v.pause();
                            v.currentTime = 0;
                          }}
                          muted
                          preload="metadata"
                        />
                      </div>
                      <div style={{ padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#ccc' }}>
                          {clip.duration.toFixed(1)}s
                        </span>
                        <button 
                          onClick={() => handleDeleteClip(selectedActor.id, clip.id)}
                          style={{
                            background: 'transparent', border: 'none', color: '#ff4d4d', cursor: 'pointer'
                          }}
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {selectedActor.clips.length === 0 && (
                    <div style={{
                      gridColumn: '1 / -1', textAlign: 'center', padding: '40px',
                      color: 'rgba(255,255,255,0.4)', backgroundColor: 'rgba(0,0,0,0.2)',
                      borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.2)'
                    }}>
                      <p>No clips uploaded for this actor yet.</p>
                      <p>Click "Upload Clips" to add videos.</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)' }}>
                Select or create an actor to manage clips
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClipLibrary;
