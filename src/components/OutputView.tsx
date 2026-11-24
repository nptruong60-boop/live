import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CameraOff, FlipHorizontal2, Maximize2 } from 'lucide-react';
import type {
  LiveComment,
  LiveRuntimeState,
  StudioProject,
} from '../types/studio';
import { STAGE_H, STAGE_W } from '../utils/canvasMath';
import { useWebcam } from '../hooks/useWebcam';
import { StageRenderer } from './StageRenderer';

interface OutputViewProps {
  project: StudioProject;
  live: LiveRuntimeState;
  comments: LiveComment[];
  onClaimCamera: () => void;
}

/**
 * Clean 9:16 Output View for OBS Studio / TikTok LIVE Studio or standalone Window Capture.
 * - Supports native UVC webcam directly inside the Output window (auto-starts with ?cam=1 or via auto-hiding hover controls).
 * - Automatically signals the Control Desk to release its camera lock when Output enables camera.
 * - Hover toolbar auto-hides after 2.5s of mouse inactivity so captures stay 100% clean.
 */
export const OutputView: React.FC<OutputViewProps> = ({
  project,
  live,
  comments,
  onClaimCamera,
}) => {
  const [scale, setScale] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);
  const webcam = useWebcam();

  const autoCamRequested = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('cam') === '1';
  }, []);

  const activeScene = useMemo(
    () => project.scenes.find((s) => s.id === live.activeSceneId) || project.scenes[0],
    [live.activeSceneId, project.scenes]
  );

  const pinnedComment = useMemo(
    () => comments.find((c) => c.id === live.pinnedCommentId) || null,
    [comments, live.pinnedCommentId]
  );

  // Auto-start camera when opened with ?cam=1 (claiming camera from operator tab first)
  const autoStartRanRef = useRef(false);
  useEffect(() => {
    if (!autoCamRequested || autoStartRanRef.current) return;
    autoStartRanRef.current = true;
    onClaimCamera();
    const t = window.setTimeout(() => {
      webcam.startCamera();
    }, 260);
    return () => clearTimeout(t);
  }, [autoCamRequested, onClaimCamera, webcam]);

  // Auto-hide controls after inactivity so OBS / Window Capture stays completely clean
  useEffect(() => {
    const showTemporarily = () => {
      setControlsVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, 2800);
    };

    showTemporarily();
    window.addEventListener('mousemove', showTemporarily);
    window.addEventListener('pointerdown', showTemporarily);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      window.removeEventListener('mousemove', showTemporarily);
      window.removeEventListener('pointerdown', showTemporarily);
    };
  }, []);

  useEffect(() => {
    if (activeScene.backdrop === 'transparent') {
      document.documentElement.style.background = 'transparent';
      document.body.style.background = 'transparent';
    } else {
      document.documentElement.style.background = '#000000';
      document.body.style.background = '#000000';
    }
    const updateScale = () => {
      const next = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
      setScale(Math.max(0.25, next));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [activeScene.backdrop]);

  const handleToggleCamera = () => {
    if (webcam.isActive) {
      webcam.stopCamera();
    } else {
      onClaimCamera();
      window.setTimeout(() => {
        webcam.startCamera(webcam.selectedDeviceId);
      }, 180);
    }
  };

  const handleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  };

  return (
    <main className="fixed inset-0 overflow-hidden flex items-center justify-center bg-transparent">
      {/* Auto-hiding hover control bar for Camera & Fullscreen (invisible when mouse is idle) */}
      <div
        className={`fixed top-3 right-3 z-[80] flex flex-wrap items-center gap-1.5 bg-[#0d1017]/90 border border-white/15 rounded-xl px-2.5 py-1.5 backdrop-blur-md shadow-2xl transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={handleToggleCamera}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            webcam.isActive
              ? 'bg-rose-600 hover:bg-rose-500 text-white'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
        >
          {webcam.isActive ? <CameraOff className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
          <span>{webcam.isActive ? 'Tắt Camera' : 'Bật Camera Output'}</span>
        </button>

        {webcam.devices.length > 0 && (
          <select
            aria-label="Chọn Camera cho cửa sổ Output"
            value={webcam.selectedDeviceId}
            onChange={(e) => {
              const id = e.target.value;
              webcam.setSelectedDeviceId(id);
              if (webcam.isActive) webcam.startCamera(id);
            }}
            className="bg-[#161c28] text-zinc-200 text-xs rounded-lg px-2 py-1 border border-white/10 max-w-[155px] truncate cursor-pointer"
          >
            {webcam.devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          aria-label="Lật gương camera"
          onClick={webcam.toggleMirror}
          className={`p-1.5 rounded-lg border text-xs cursor-pointer ${
            webcam.isMirrored
              ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200'
              : 'bg-[#161c28] border-white/10 text-zinc-300'
          }`}
        >
          <FlipHorizontal2 className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          aria-label="Toàn màn hình"
          onClick={handleFullscreen}
          className="p-1.5 rounded-lg bg-[#161c28] border border-white/10 text-zinc-300 hover:text-white cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Camera error banner (auto-hidden when controls hide or camera works) */}
      {webcam.error && controlsVisible && (
        <div className="fixed top-14 right-3 z-[80] max-w-xs bg-amber-950/95 border border-amber-500/45 text-amber-100 rounded-xl px-3 py-2 text-xs font-medium shadow-2xl">
          {webcam.error} Nếu tab Điều khiển đang giữ cam, hãy bấm Tắt Camera ở tab đó rồi thử lại.
        </div>
      )}

      <div
        className="shrink-0"
        style={{
          width: `${STAGE_W}px`,
          height: `${STAGE_H}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        <StageRenderer
          scene={activeScene}
          products={project.products}
          live={live}
          pinnedComment={pinnedComment}
          cameraStream={webcam.stream}
          cameraMirrored={webcam.isMirrored}
          showHostPlaceholder={false}
          outputTransparent
        />
      </div>
    </main>
  );
};
