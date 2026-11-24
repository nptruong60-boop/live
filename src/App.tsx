import { useCallback, useMemo, useState } from 'react';
import type { AppViewMode, StudioProject, WorkspaceTab } from './types/studio';
import { getInitialRoomId, useLiveRoom } from './hooks/useLiveRoom';
import { useWebcam } from './hooks/useWebcam';
import { CanvaEditor } from './components/CanvaEditor';
import { LiveOperator } from './components/LiveOperator';
import { ConnectPublishView } from './components/ConnectPublishView';
import { TeleprompterView } from './components/TeleprompterView';
import { OutputView } from './components/OutputView';

function resolveViewMode(): AppViewMode {
  const params = new URLSearchParams(window.location.search);
  const v = params.get('view') || params.get('mode');
  if (v === 'output') return 'output';
  if (v === 'teleprompter') return 'teleprompter';
  return 'studio';
}

function resolveInitialTab(): WorkspaceTab {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  if (mode === 'live') return 'live';
  if (mode === 'connect') return 'connect';
  return 'editor';
}

interface ToastItem {
  id: number;
  msg: string;
  tone: 'emerald' | 'amber' | 'rose' | 'indigo';
}

export default function App() {
  const [viewMode] = useState<AppViewMode>(() => resolveViewMode());
  const [roomId] = useState<string>(() => getInitialRoomId());
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => resolveInitialTab());
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const role =
    viewMode === 'output'
      ? 'output'
      : viewMode === 'teleprompter'
        ? 'teleprompter'
        : activeTab === 'editor'
          ? 'admin'
          : 'operator';

  const webcam = useWebcam();

  const notify = useCallback(
    (msg: string, tone: ToastItem['tone'] = 'indigo') => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-2), { id, msg, tone }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    },
    []
  );

  const handleCameraClaimedByOutput = useCallback(() => {
    if (viewMode !== 'output' && webcam.isActive) {
      webcam.stopCamera();
      notify('Đã tự động nhường Camera sang cửa sổ Output rời!', 'indigo');
    }
  }, [notify, viewMode, webcam]);

  const room = useLiveRoom(roomId, role, {
    onCameraClaimedByOutput: handleCameraClaimedByOutput,
  });

  const pinnedComment = useMemo(
    () => room.comments.find((c) => c.id === room.live.pinnedCommentId) || null,
    [room.comments, room.live.pinnedCommentId]
  );

  // Dedicated zero-chrome OBS / TikTok Output window
  if (viewMode === 'output') {
    return (
      <OutputView
        project={room.savedProject}
        live={room.live}
        comments={room.comments}
        onClaimCamera={room.claimCameraForOutput}
      />
    );
  }

  // Dedicated mobile/tablet Host Comment Teleprompter
  if (viewMode === 'teleprompter') {
    return (
      <TeleprompterView
        roomId={roomId}
        project={room.savedProject}
        live={room.live}
        comments={room.comments}
        wsConnected={room.wsConnected}
        onPinComment={room.pinComment}
        onToggleAnswered={room.toggleCommentAnswered}
        onClearComments={room.clearComments}
      />
    );
  }

  const handlePublish = async (nextProject: StudioProject) => {
    await room.publishProject(nextProject);
    if (!nextProject.scenes.some((s) => s.id === room.live.activeSceneId)) {
      room.patchLive({ activeSceneId: nextProject.activeSceneId });
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#0b0e14] text-zinc-100">
      {/* Toast Notifications */}
      <div
        aria-live="polite"
        className="fixed top-14 left-1/2 -translate-x-1/2 z-[120] flex flex-col gap-2 pointer-events-none w-[92%] max-w-md"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2.5 rounded-xl border text-xs font-semibold text-center shadow-2xl backdrop-blur-md ${
              t.tone === 'emerald'
                ? 'bg-emerald-950/95 border-emerald-500/45 text-emerald-100'
                : t.tone === 'amber'
                  ? 'bg-amber-950/95 border-amber-500/45 text-amber-100'
                  : t.tone === 'rose'
                    ? 'bg-rose-950/95 border-rose-500/45 text-rose-100'
                    : 'bg-indigo-950/95 border-indigo-400/45 text-indigo-100'
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>

      {/* Clean 3-Zone Top Bar */}
      <header className="h-12 px-4 lg:px-5 border-b border-white/10 bg-[#0d1017] flex items-center justify-between gap-8 shrink-0">
        {/* Zone 1: Brand Wordmark */}
        <span className="font-display text-sm font-extrabold tracking-tight text-white whitespace-nowrap shrink-0">
          PocketLive Studio
        </span>

        {/* Zone 2: Clean Single-Line Navigation */}
        <nav aria-label="Điều hướng không gian làm việc" className="flex items-center gap-6 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`py-3.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'editor'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Thiết kế Canva
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('live')}
            className={`py-3.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'live'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Điều khiển Live
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('connect')}
            className={`py-3.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'connect'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Kết nối & Xuất bản
          </button>
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="shrink-0">
          <a
            href={`/?view=teleprompter&room=${encodeURIComponent(roomId)}`}
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold whitespace-nowrap shrink-0 transition-colors inline-block"
          >
            Màn hình Comment ĐT
          </a>
        </div>
      </header>

      {/* Active Workspace (Unmounts Canva Editor completely when Live/Connect is active to save CPU/RAM) */}
      {activeTab === 'editor' && (
        <CanvaEditor
          savedProject={room.savedProject}
          live={room.live}
          pinnedComment={pinnedComment}
          cameraStream={webcam.stream}
          cameraMirrored={webcam.isMirrored}
          onToggleCamera={webcam.toggleCamera}
          onToggleSafeZone={() => room.patchLive({ showSafeZone: !room.live.showSafeZone })}
          onPublishProject={handlePublish}
          onSwitchToLive={() => setActiveTab('live')}
          onNotify={notify}
        />
      )}

      {activeTab === 'live' && (
        <LiveOperator
          project={room.savedProject}
          live={room.live}
          comments={room.comments}
          presence={room.presence}
          roomId={roomId}
          cameraStream={webcam.stream}
          cameraDevices={webcam.devices}
          selectedCameraId={webcam.selectedDeviceId}
          cameraMirrored={webcam.isMirrored}
          onToggleCamera={webcam.toggleCamera}
          onSelectCamera={(id) => {
            webcam.setSelectedDeviceId(id);
            if (webcam.isActive) webcam.startCamera(id);
          }}
          onToggleMirror={webcam.toggleMirror}
          onPatchLive={room.patchLive}
          onTriggerAlert={room.triggerAlert}
          onPinComment={room.pinComment}
          onToggleAnswered={room.toggleCommentAnswered}
          onSendComment={room.sendExternalEvent}
          onOpenConnectTab={() => setActiveTab('connect')}
          onNotify={notify}
        />
      )}

      {activeTab === 'connect' && (
        <ConnectPublishView
          project={room.savedProject}
          roomId={roomId}
          presence={room.presence}
          wsConnected={room.wsConnected}
          tikfinityStatus={room.tikfinityStatus}
          tikfinityUrl={room.tikfinityUrl}
          onConnectTikFinity={room.connectTikFinity}
          onDisconnectTikFinity={room.disconnectTikFinity}
          onSendExternalEvent={room.sendExternalEvent}
          onImportProject={handlePublish}
          onNotify={notify}
        />
      )}
    </div>
  );
}
