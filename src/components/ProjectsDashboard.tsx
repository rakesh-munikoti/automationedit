import React, { useEffect, useState } from 'react';
import { getAllProjects, deleteProject, type ProjectMeta } from '../lib/db';
import { FiPlus, FiTrash2, FiClock, FiVideo } from 'react-icons/fi';

interface Props {
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
}

const ProjectsDashboard: React.FC<Props> = ({ onSelectProject, onCreateProject }) => {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const projs = await getAllProjects();
      setProjects(projs);
    } catch (err) {
      console.error('Failed to load projects', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to completely delete this project?')) {
      await deleteProject(id);
      loadProjects();
    }
  };

  return (
    <div style={{ padding: '60px 40px', maxWidth: '1200px', margin: '0 auto', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '16px', margin: 0 }}>
          <FiVideo style={{ color: '#00d4ff' }} />
          My Projects
        </h1>
        <button 
          onClick={onCreateProject}
          style={{ 
            display: 'flex', alignItems: 'center', gap: '8px', 
            background: 'linear-gradient(135deg, #00d4ff, #0099ff)', 
            color: '#fff', border: 'none', padding: '12px 24px', 
            borderRadius: '6px', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,212,255,0.3)', transition: 'all 0.2s' 
          }}
          onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseOut={e => e.currentTarget.style.transform = 'none'}
        >
          <FiPlus /> New Project
        </button>
      </div>

      {isLoading ? (
        <div style={{ opacity: 0.6, fontSize: '14px' }}>Loading projects...</div>
      ) : projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '100px 0', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: '48px', opacity: 0.2, marginBottom: '16px', display: 'flex', justifyContent: 'center' }}><FiVideo /></div>
          <h3 style={{ fontSize: '20px', fontWeight: 500, marginBottom: '8px', marginTop: 0 }}>No projects yet</h3>
          <p style={{ opacity: 0.6, fontSize: '15px', marginBottom: '32px' }}>Create a new project to start clipping</p>
          <button 
            onClick={onCreateProject}
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          >
            Create New Project
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
          {projects.map(proj => (
            <div 
              key={proj.id}
              onClick={() => onSelectProject(proj.id)}
              style={{
                background: '#1e1e2d',
                borderRadius: '8px',
                padding: '24px',
                cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.05)',
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(0,212,255,0.4)'; e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '12px' }}>
                  {proj.name}
                </h3>
                <button 
                  onClick={(e) => handleDelete(e, proj.id)}
                  style={{ background: 'transparent', border: 'none', color: '#fc8181', cursor: 'pointer', opacity: 0.6, padding: '4px', display: 'flex' }}
                  onMouseOver={e => e.currentTarget.style.opacity = '1'}
                  onMouseOut={e => e.currentTarget.style.opacity = '0.6'}
                  title="Delete Project"
                >
                  <FiTrash2 size={18} />
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', opacity: 0.5, marginTop: 'auto' }}>
                <FiClock size={14} />
                {new Date(proj.lastModified).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectsDashboard;
