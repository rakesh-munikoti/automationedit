import { useState, useCallback, useEffect, useRef } from 'react';
import { FiUpload, FiDownload, FiPlay, FiPause, FiVolumeX, FiCopy, FiX } from 'react-icons/fi';
import { MdUndo, MdRedo } from 'react-icons/md';
import Preview from './components/Preview';
import MultiTrackTimeline from './components/MultiTrackTimeline';
import ExportProgress from './components/ExportProgress';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import './App.css';

export interface TrackItem {
  id: string;
  type: 'video' | 'audio' | 'text' | 'image';
  startTime: number;
  duration: number;
  mediaStartTime?: number;
  sourceDuration?: number;
  transitionOut?: 'black-fade' | null;
  muted?: boolean;
  volume?: number;
  file?: File;
  url?: string;
  content?: string;
  effects?: EffectType[];
  properties?: Record<string, any>;
  /** Links a placed clip back to its source ActorClip for usage tracking */
  actorClipId?: string;
}

export interface ActorClip {
  id: string;
  file: File;
  url: string;
  duration: number;
  usageCount: number;
  batchId?: string;
}

export interface Actor {
  id: string;
  name: string;
  clips: ActorClip[];
  deckQueue?: string[];
  deckPosition?: number;
}

export interface EffectType {
  id: string;
  name: string;
  type: 'transition' | 'filter' | 'animation' | 'colorgrade';
  parameters?: Record<string, number>;
}

export interface EditState {
  videoTracks: TrackItem[];
  clipTracks: TrackItem[];
  manualClipTracks: TrackItem[];
  overlayTracks: TrackItem[];
  audioTracks: TrackItem[];
  textTracks: TrackItem[];
  imageTracks: TrackItem[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
}

import ClipLibrary from './components/ClipLibrary';
import { loadActors, saveActors } from './lib/db';

function App() {
  const [hasVideo, setHasVideo] = useState(false);
  const [actors, setActors] = useState<Actor[]>([]);
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [isClipLibraryOpen, setIsClipLibraryOpen] = useState(false);

  useEffect(() => {
    loadActors()
      .then(loadedActors => {
        setActors(loadedActors);
        setIsDbLoaded(true);
      })
      .catch(err => {
        console.error('Failed to load actors from DB', err);
        setIsDbLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (isDbLoaded) {
      saveActors(actors).catch(err => console.error('Failed to save actors to DB:', err));
    }
  }, [actors, isDbLoaded]);

  const overlayInputRef = useRef<HTMLInputElement>(null);

  const [editState, setEditState] = useState<EditState>({
    videoTracks: [],
    clipTracks: [],
    manualClipTracks: [],
    overlayTracks: [],
    audioTracks: [],
    textTracks: [],
    imageTracks: [],
    currentTime: 0,
    duration: 0,
    isPlaying: false,
  });

  const [history, setHistory] = useState<EditState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [isExporting, setIsExporting] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedTrackType, setSelectedTrackType] = useState<string | null>(null);

  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState('');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const handleVideoUpload = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = url;
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const newTrack: TrackItem = {
        id: `video-${Date.now()}`,
        type: 'video',
        startTime: 0,
        duration: duration,
        file,
        url,
      };

      setEditState(prev => {
        const newState = {
          ...prev,
          videoTracks: [newTrack],
          duration: duration,
        };
        setHistory([newState]);
        setHistoryIndex(0);
        return newState;
      });
      setHasVideo(true);
    };
  }, []);

  const addToHistory = useCallback((newState: EditState) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newState);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setEditState(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setEditState(history[historyIndex + 1]);
    }
  }, [history, historyIndex]);

  const handleExport = async () => {
    if (editState.duration === 0) return;

    setIsExporting(true);
    setIsExportModalOpen(true);
    setExportProgress(0);
    setExportMessage('Loading editor engine...');

    try {
      if (!ffmpegRef.current) {
        ffmpegRef.current = new FFmpeg();
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        await ffmpegRef.current.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
      }

      const ffmpeg = ffmpegRef.current;
      let ffmpegLogs: string[] = [];

      ffmpeg.on('log', ({ message }) => {
        console.log('[FFMPEG]', message);
        ffmpegLogs.push(message);
        if (ffmpegLogs.length > 30) ffmpegLogs.shift();

        if (message.includes('frame=')) {
          const frameMatch = message.match(/frame=\s*(\d+)/);
          if (frameMatch) {
            const currentFrame = parseInt(frameMatch[1]);
            const totalFrames = editState.duration * 30;
            const percentage = Math.min(95, (currentFrame / totalFrames) * 100);
            setExportProgress(percentage);
          }
        }
      });

      setExportMessage('Preparing files...');

      // Build the visual timeline: for each time segment find which clip is on top
      // Priority: overlay > manualClip > clip > video
      const videoSegments = [
        ...editState.videoTracks,
        ...editState.clipTracks,
        ...editState.manualClipTracks,
        ...(editState.overlayTracks || [])
      ];

      const boundaries = new Set<number>([0, editState.duration]);
      videoSegments.forEach(t => {
        boundaries.add(t.startTime);
        boundaries.add(Math.min(t.startTime + t.duration, editState.duration));
      });
      const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);

      const visualTimeline: Array<{ file: File; mediaStart: number; duration: number }> = [];

      for (let si = 0; si < sortedBoundaries.length - 1; si++) {
        const segStart = sortedBoundaries[si];
        const segEnd = sortedBoundaries[si + 1];
        const mid = (segStart + segEnd) / 2;

        const clip =
          (editState.overlayTracks || []).find(t => mid >= t.startTime && mid < t.startTime + t.duration) ||
          editState.manualClipTracks.find(t => mid >= t.startTime && mid < t.startTime + t.duration) ||
          editState.clipTracks.find(t => mid >= t.startTime && mid < t.startTime + t.duration) ||
          editState.videoTracks.find(t => mid >= t.startTime && mid < t.startTime + t.duration);

        if (clip && clip.file) {
          const mediaStart = (clip.mediaStartTime || 0) + (segStart - clip.startTime);
          visualTimeline.push({ file: clip.file, mediaStart, duration: segEnd - segStart });
        }
      }

      if (visualTimeline.length === 0) throw new Error('No video segments found on the timeline.');

      // Step 1 — Write source files to ffmpeg FS (deduplicated)
      const writtenFiles = new Map<File, string>();
      const getInputName = (file: File): string => {
        if (!writtenFiles.has(file)) {
          const ext = file.name.split('.').pop() || 'mp4';
          writtenFiles.set(file, `input_${writtenFiles.size}.${ext}`);
        }
        return writtenFiles.get(file)!;
      };

      for (const seg of visualTimeline) getInputName(seg.file);

      let written = 0;
      for (const [file, name] of writtenFiles.entries()) {
        setExportMessage(`Loading: ${file.name}`);
        await ffmpeg.writeFile(name, await fetchFile(file));
        written++;
        setExportProgress(Math.round((written / writtenFiles.size) * 20));
      }

      // Step 2 — Trim each segment individually into a standardized clip file
      const segmentFiles: string[] = [];
      for (let i = 0; i < visualTimeline.length; i++) {
        const seg = visualTimeline[i];
        const inputName = getInputName(seg.file);
        const outputName = `seg_${i}.mp4`;

        setExportMessage(`Processing clip ${i + 1} of ${visualTimeline.length}...`);
        setExportProgress(20 + Math.round((i / visualTimeline.length) * 60));

        ffmpegLogs = [];
        // Use post-input -ss (accurate seeking) to preserve audio streams
        // Also add -af anull to force audio output even if source lacks audio
        const ret = await ffmpeg.exec([
          '-i', inputName,
          '-ss', String(seg.mediaStart),
          '-t', String(seg.duration),
          '-vf', 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=30',
          '-af', 'aresample=44100',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-ar', '44100',
          '-ac', '2',
          '-avoid_negative_ts', 'make_zero',
          '-shortest',
          '-y',
          outputName,
        ]);

        if (ret !== 0) {
          throw new Error(`Failed on clip ${i + 1}/${visualTimeline.length}:\n${ffmpegLogs.slice(-10).join('\n')}`);
        }
        segmentFiles.push(outputName);
      }

      // Step 3 — Concat all segments via the concat demuxer (stream copy, no re-encode)
      setExportMessage('Stitching clips together...');
      setExportProgress(83);

      const concatList = segmentFiles.map(f => `file '${f}'`).join('\n');
      await ffmpeg.writeFile('concat_list.txt', concatList);

      ffmpegLogs = [];
      const mergeRet = await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat_list.txt',
        '-c', 'copy',
        '-y',
        'pre_mix.mp4',
      ]);

      if (mergeRet !== 0) {
        throw new Error(`Merge failed:\n${ffmpegLogs.slice(-10).join('\n')}`);
      }

      // Step 4 — Mix in audio tracks (voiceovers / extracted audio)
      const audioTracks = editState.audioTracks.filter(t => t.file);

      if (audioTracks.length > 0) {
        setExportMessage('Mixing voiceover audio...');
        setExportProgress(88);

        // Write & trim each audio track to a normalized AAC file
        const extraAudioFiles: Array<{ name: string; startTime: number }> = [];
        for (let i = 0; i < audioTracks.length; i++) {
          const at = audioTracks[i];
          const ext = at.file!.name.split('.').pop() || 'mp4';
          const srcName = `audio_src_${i}.${ext}`;
          const outName = `audio_track_${i}.aac`;

          await ffmpeg.writeFile(srcName, await fetchFile(at.file!));

          ffmpegLogs = [];
          const atRet = await ffmpeg.exec([
            '-i', srcName,
            '-ss', String(at.mediaStartTime || 0),
            '-t', String(at.duration),
            '-af', 'aresample=44100',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '44100',
            '-ac', '2',
            '-y',
            outName,
          ]);

          if (atRet !== 0) {
            console.warn(`Audio track ${i} failed, skipping:`, ffmpegLogs.slice(-5).join('\n'));
          } else {
            extraAudioFiles.push({ name: outName, startTime: at.startTime });
          }
        }

        if (extraAudioFiles.length > 0) {
          // Build amix filter_complex: delay each extra audio track to its startTime,
          // then mix all sources (video audio + extra tracks) together
          const inputArgs: string[] = ['-i', 'pre_mix.mp4'];
          for (const af of extraAudioFiles) {
            inputArgs.push('-i', af.name);
          }

          // [0:a] = video audio, [1:a]...[N:a] = extra audio tracks with delays
          let filterParts: string[] = [];
          let mixInputs = '[0:a]';

          extraAudioFiles.forEach((af, idx) => {
            const delayMs = Math.floor(af.startTime * 1000);
            filterParts.push(`[${idx + 1}:a]adelay=${delayMs}|${delayMs}[delayed${idx}]`);
            mixInputs += `[delayed${idx}]`;
          });

          filterParts.push(`${mixInputs}amix=inputs=${extraAudioFiles.length + 1}:duration=first:normalize=0[outa]`);
          const filterComplex = filterParts.join(';');

          ffmpegLogs = [];
          const mixRet = await ffmpeg.exec([
            ...inputArgs,
            '-filter_complex', filterComplex,
            '-map', '0:v',
            '-map', '[outa]',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-shortest',
            '-y',
            'output.mp4',
          ]);

          if (mixRet !== 0) {
            console.warn('Audio mix failed, using video without voiceover:', ffmpegLogs.slice(-5).join('\n'));
            // Fallback: rename pre_mix to output
            const fallbackData = await ffmpeg.readFile('pre_mix.mp4');
            await ffmpeg.writeFile('output.mp4', fallbackData);
          }
        } else {
          // No audio tracks could be processed — just use the stitched video
          const fallbackData = await ffmpeg.readFile('pre_mix.mp4');
          await ffmpeg.writeFile('output.mp4', fallbackData);
        }
      } else {
        // No extra audio tracks — rename pre_mix to output
        const preMixData = await ffmpeg.readFile('pre_mix.mp4');
        await ffmpeg.writeFile('output.mp4', preMixData);
      }

      setExportProgress(97);
      setExportMessage('Saving file...');

      const data = await ffmpeg.readFile('output.mp4');
      const blob = new Blob([data as any], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      try {
        if ('showSaveFilePicker' in window) {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: `StudioExport_${Date.now()}.mp4`,
            types: [{ description: 'Video File', accept: { 'video/mp4': ['.mp4'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
        } else {
          const a = document.createElement('a');
          a.href = url;
          a.download = `StudioExport_${Date.now()}.mp4`;
          a.click();
        }
      } catch {
        const a = document.createElement('a');
        a.href = url;
        a.download = `StudioExport_${Date.now()}.mp4`;
        a.click();
      }

      setExportProgress(100);
      setExportMessage('Export complete! 🎉');
      setTimeout(() => setIsExportModalOpen(false), 2500);
    } catch (error: any) {
      console.error('Export failed:', error);
      const msg = error instanceof Error ? error.message : String(error);
      setExportMessage(`Export failed: ${msg}`);
      alert(`Export failed:\n\n${msg}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExtractAudio = useCallback(() => {
    if (!selectedTrackId || selectedTrackType !== 'video') return;

    setEditState((prev: EditState) => {
      const videoTrack = prev.videoTracks.find(t => t.id === selectedTrackId);
      if (!videoTrack) return prev;

      const newVideoTracks = prev.videoTracks.map(t =>
        t.id === selectedTrackId ? { ...t, muted: true } : t
      );

      const newAudioTrack: TrackItem = {
        ...videoTrack,
        id: `audio-ext-${Date.now()}`,
        type: 'audio',
        muted: false,
        transitionOut: null,
      };

      const newState = {
        ...prev,
        videoTracks: newVideoTracks,
        audioTracks: [...prev.audioTracks, newAudioTrack],
      };

      addToHistory(newState);
      return newState;
    });
  }, [selectedTrackId, selectedTrackType, addToHistory]);

  const handleDuplicate = useCallback(() => {
    if (!selectedTrackId) return;

    setEditState((prev: EditState) => {
      const itemToDup =
        prev.videoTracks.find(t => t.id === selectedTrackId) ||
        prev.audioTracks.find(t => t.id === selectedTrackId) ||
        prev.textTracks.find(t => t.id === selectedTrackId);

      if (!itemToDup) return prev;

      const newItem = {
        ...itemToDup,
        id: `${itemToDup.type}-${Date.now()}`,
        startTime: itemToDup.startTime + itemToDup.duration,
      };

      const newState = { ...prev };
      if (itemToDup.type === 'video') newState.videoTracks = [...newState.videoTracks, newItem];
      else if (itemToDup.type === 'audio') newState.audioTracks = [...newState.audioTracks, newItem];
      else if (itemToDup.type === 'text') newState.textTracks = [...newState.textTracks, newItem];

      addToHistory(newState);
      return newState;
    });
  }, [selectedTrackId, addToHistory]);

  const handleDelete = useCallback(() => {
    if (!selectedTrackId) return;

    setEditState((prev: EditState) => {
      const newState = {
        ...prev,
        videoTracks: prev.videoTracks.filter(t => t.id !== selectedTrackId),
        audioTracks: prev.audioTracks.filter(t => t.id !== selectedTrackId),
        textTracks: prev.textTracks.filter(t => t.id !== selectedTrackId),
      };
      addToHistory(newState);
      setSelectedTrackId(null);
      setSelectedTrackType(null);
      return newState;
    });
  }, [selectedTrackId, addToHistory]);

  const handleDone = useCallback(() => {
    const clipTracks = editState.clipTracks || [];
    if (clipTracks.length === 0) return;

    const usageDelta: Record<string, number> = {};
    for (const track of clipTracks) {
      if (track.actorClipId) {
        usageDelta[track.actorClipId] = (usageDelta[track.actorClipId] || 0) + 1;
      }
    }

    if (Object.keys(usageDelta).length === 0) return;

    setActors(prevActors =>
      prevActors.map(actor => ({
        ...actor,
        clips: actor.clips.map(clip =>
          usageDelta[clip.id]
            ? { ...clip, usageCount: clip.usageCount + usageDelta[clip.id] }
            : clip
        ),
      }))
    );
  }, [editState.clipTracks, setActors]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setEditState(prev => {
          if (!prev.isPlaying && prev.currentTime >= prev.duration - 0.1 && prev.duration > 0) {
            return { ...prev, isPlaying: true, currentTime: 0 };
          }
          return { ...prev, isPlaying: !prev.isPlaying };
        });
      }
      if (e.ctrlKey && !e.shiftKey && e.code === 'KeyZ') {
        e.preventDefault();
        undo();
      }

      if (e.ctrlKey && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return (
    <div className="capcut-editor">
      {/* Top Bar */}
      <div className="top-bar">
        <div className="brand">
          <h1>CutStudio</h1>
          <p>Professional Video Editor</p>
        </div>

        <div className="top-actions">
          <button className="icon-btn" title="Undo" onClick={undo} disabled={historyIndex <= 0}>
            <MdUndo size={18} />
          </button>
          <button className="icon-btn" title="Redo" onClick={redo} disabled={historyIndex >= history.length - 1}>
            <MdRedo size={18} />
          </button>
          <div className="action-divider" style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)', margin: '0 8px' }} />
          {/* Overlay Upload */}
          <input
            ref={overlayInputRef}
            type="file"
            hidden
            accept="video/*"
            onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const url = URL.createObjectURL(file);
              const video = document.createElement('video');
              video.src = url;
              video.onloadedmetadata = () => {
                const dur = video.duration;
                const newOverlay: TrackItem = {
                  id: `overlay-clip-${Date.now()}`,
                  type: 'video',
                  startTime: editState.currentTime,
                  duration: dur,
                  mediaStartTime: 0,
                  sourceDuration: dur,
                  volume: 1,
                  url,
                  file
                };
                const newState = {
                  ...editState,
                  overlayTracks: [...(editState.overlayTracks || []), newOverlay].sort((a,b) => a.startTime - b.startTime)
                };
                setEditState(newState);
                addToHistory(newState);
              };
              e.target.value = '';
            }}
          />
          <button
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
              color: '#fff',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              marginRight: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              boxShadow: '0 2px 10px rgba(124, 58, 237, 0.4)',
              transition: 'opacity 0.2s'
            }}
            title="Add clip to Overlay track at current playhead"
            onClick={() => overlayInputRef.current?.click()}
            onMouseOver={e => (e.currentTarget.style.opacity = '0.8')}
            onMouseOut={e => (e.currentTarget.style.opacity = '1')}
          >
            🎞️ Overlay
          </button>
          <div className="action-divider" style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)', margin: '0 8px' }} />
          <button className="btn-library" style={{ background: '#333', color: '#fff', padding: '6px 16px', borderRadius: '4px', fontSize: '14px', border: '1px solid rgba(255,255,255,0.1)', marginRight: '8px', cursor: 'pointer' }} onClick={() => setIsClipLibraryOpen(true)}>
            🎥 Clip Library
          </button>
          <button
            className="icon-btn extraction-btn"
            title="Extract Audio"
            onClick={handleExtractAudio}
            disabled={selectedTrackType !== 'video'}
            style={{
              color: selectedTrackType === 'video' ? '#00d4ff' : 'rgba(255,255,255,0.2)',
              border: selectedTrackType === 'video' ? '1px solid #00d4ff' : '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <FiVolumeX size={18} />
          </button>
          <button
            className="icon-btn"
            title="Duplicate"
            onClick={handleDuplicate}
            disabled={!selectedTrackId}
            style={{ color: selectedTrackId ? '#fff' : 'rgba(255,255,255,0.1)' }}
          >
            <FiCopy size={18} />
          </button>
          <button
            className="icon-btn"
            title="Delete"
            onClick={handleDelete}
            disabled={!selectedTrackId}
            style={{ color: selectedTrackId ? '#ff4d4d' : 'rgba(255,255,255,0.1)' }}
          >
            <FiX size={18} />
          </button>
          <button className="btn-export" onClick={handleExport} disabled={isExporting}>
            <FiDownload /> {isExporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>

      <div className={`editor-layout ${!hasVideo ? 'empty-state' : ''}`}>
        {!hasVideo ? (
          <div className="upload-area">
            <div className="upload-prompt">
              <div className="upload-icon">🎬</div>
              <h2>Start Creating</h2>
              <p>Import video, audio, images, or start from scratch</p>

              <div className="quick-import">
                <label className="import-btn">
                  <FiUpload /> Import Media
                  <input
                    type="file"
                    hidden
                    accept="video/*,audio/*,image/*"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleVideoUpload(file);
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="main-workspace">
              <div className="timeline-area">
                <MultiTrackTimeline
                  editState={editState}
                  setEditState={setEditState}
                  onHistoryChange={addToHistory}
                  selectedTrackId={selectedTrackId}
                  setSelectedTrackId={setSelectedTrackId}
                  setSelectedTrackType={setSelectedTrackType}
                  actors={actors}
                  setActors={setActors}
                />
              </div>
            </div>

            <div className="right-sidebar">
              <div className="preview-area">
                <Preview
                  editState={editState}
                  currentTime={editState.currentTime}
                  isPlaying={editState.isPlaying}
                  setEditState={setEditState}
                />

                <div className="playback-bar">
                  <button
                    className="play-btn"
                    onClick={() => setEditState(prev => ({ ...prev, isPlaying: !prev.isPlaying }))}
                  >
                    {editState.isPlaying ? <FiPause size={20} /> : <FiPlay size={20} />}
                  </button>
                  <div className="time-display">
                    {Math.floor(editState.currentTime)}s / {Math.floor(editState.duration)}s
                  </div>
                </div>

                {(editState.clipTracks || []).length > 0 && (
                  <button
                    onClick={handleDone}
                    title="Mark all placed clips as used and lock in usage counts"
                    style={{
                      marginTop: '10px',
                      width: '100%',
                      padding: '10px 0',
                      background: 'linear-gradient(135deg, #00c853, #00897b)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      letterSpacing: '0.5px',
                      boxShadow: '0 2px 12px rgba(0, 200, 83, 0.35)',
                      transition: 'opacity 0.2s',
                    }}
                    onMouseOver={e => (e.currentTarget.style.opacity = '0.85')}
                    onMouseOut={e => (e.currentTarget.style.opacity = '1')}
                  >
                    ✅ Done — Lock Clip Usage
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {isClipLibraryOpen && (
        <ClipLibrary
          actors={actors}
          setActors={setActors}
          onClose={() => setIsClipLibraryOpen(false)}
        />
      )}

      {isExportModalOpen && (
        <ExportProgress
          progress={exportProgress}
          message={exportMessage}
          onCancel={() => setIsExportModalOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
