import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LiveAlert,
  LiveComment,
  LiveRuntimeState,
  RoomPresence,
  StudioProject,
} from '../types/studio';
import { createDefaultProject } from '../data/presets';

export const LOCAL_PROJECT_KEY = 'pocketlive_canva_project_v2';
export const LOCAL_ROOM_KEY = 'pocketlive_canva_room_id_v2';
const BC_NAME = 'pocketlive_canva_bc_v2';

type Role = 'admin' | 'operator' | 'output' | 'teleprompter';

function loadLocalProject(): StudioProject {
  try {
    const raw = localStorage.getItem(LOCAL_PROJECT_KEY);
    if (!raw) return createDefaultProject();
    const parsed = JSON.parse(raw) as StudioProject;
    if (parsed && Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
      return parsed;
    }
  } catch {
    // Fallback to default
  }
  return createDefaultProject();
}

export function getInitialRoomId(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('room');
  if (fromUrl) {
    const clean = fromUrl.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
    if (clean) return clean;
  }
  try {
    const saved = localStorage.getItem(LOCAL_ROOM_KEY);
    if (saved) return saved;
    const generated = 'live-' + Math.random().toString(36).slice(2, 7);
    localStorage.setItem(LOCAL_ROOM_KEY, generated);
    return generated;
  } catch {
    return 'live-studio';
  }
}

export function useLiveRoom(
  roomId: string,
  role: Role,
  options?: { onCameraClaimedByOutput?: () => void }
) {
  const onCameraClaimedRef = useRef(options?.onCameraClaimedByOutput);
  onCameraClaimedRef.current = options?.onCameraClaimedByOutput;
  const [savedProject, setSavedProject] = useState<StudioProject>(() => loadLocalProject());
  const [live, setLive] = useState<LiveRuntimeState>(() => {
    const initial = loadLocalProject();
    return {
      activeSceneId: initial.activeSceneId || initial.scenes[0]?.id || 'scene-pure-glass',
      activeProductId: initial.products[0]?.id || null,
      pricePulseAt: 0,
      flashTotal: 180,
      flashLeft: 180,
      flashRunning: false,
      flashActive: false,
      performanceMode: false,
      showSafeZone: false,
      pinnedCommentId: null,
      showPinnedOnStage: false,
      activeAlert: null,
    };
  });
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [presence, setPresence] = useState<RoomPresence>({
    total: 1,
    admin: role === 'admin' ? 1 : 0,
    operator: role === 'operator' ? 1 : 0,
    output: role === 'output' ? 1 : 0,
    teleprompter: role === 'teleprompter' ? 1 : 0,
  });
  const [wsConnected, setWsConnected] = useState(false);

  // External TikFinity local WebSocket bridge (ws://localhost:21213)
  const [tikfinityStatus, setTikfinityStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [tikfinityUrl, setTikfinityUrl] = useState('ws://localhost:21213');
  const tikfinityRef = useRef<WebSocket | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const savedProjectRef = useRef(savedProject);
  savedProjectRef.current = savedProject;

  const sendWs = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
    if (bcRef.current) {
      try {
        bcRef.current.postMessage({ roomId, ...payload });
      } catch {
        // Ignore broadcast error
      }
    }
  }, [roomId]);

  // Connect to Express WebSocket server + BroadcastChannel fallback
  useEffect(() => {
    let closed = false;
    let reconnectTimer: number | null = null;

    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel(BC_NAME);
      bcRef.current = bc;
      bc.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg || msg.roomId !== roomId) return;
        if (msg.type === 'PROJECT_PUBLISH' && msg.project) {
          setSavedProject(msg.project);
        } else if (msg.type === 'LIVE_PATCH' && msg.patch) {
          setLive((prev) => ({ ...prev, ...msg.patch }));
        } else if (msg.type === 'ALERT_TRIGGER' && msg.alert) {
          setLive((prev) => ({ ...prev, activeAlert: msg.alert }));
        } else if (msg.type === 'CAMERA_CLAIMED_BY_OUTPUT') {
          onCameraClaimedRef.current?.();
        }
      };
    }

    const connect = () => {
      if (closed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws?room=${encodeURIComponent(roomId)}&role=${role}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (!msg || !msg.type) return;

          if (msg.type === 'ROOM_INIT') {
            if (msg.project) {
              setSavedProject(msg.project);
              try {
                localStorage.setItem(LOCAL_PROJECT_KEY, JSON.stringify(msg.project));
              } catch {
                // ignore quota
              }
            } else if (role === 'admin' || role === 'operator') {
              // Seed room with local saved project on first connect
              ws.send(JSON.stringify({ type: 'PROJECT_PUBLISH', project: savedProjectRef.current }));
            }
            if (msg.live) setLive(msg.live);
            if (Array.isArray(msg.comments)) setComments(msg.comments);
            if (msg.presence) setPresence(msg.presence);
          } else if (msg.type === 'PROJECT_UPDATED' && msg.project) {
            setSavedProject(msg.project);
            if (msg.live) setLive(msg.live);
          } else if (msg.type === 'LIVE_UPDATED' && msg.live) {
            setLive(msg.live);
          } else if (msg.type === 'ALERT_TRIGGERED' && msg.alert) {
            setLive((prev) => ({ ...prev, activeAlert: msg.alert }));
          } else if (msg.type === 'COMMENT_ADDED' && msg.comment) {
            setComments((prev) => {
              if (prev.some((c) => c.id === msg.comment.id)) return prev;
              return [msg.comment, ...prev].slice(0, 120);
            });
          } else if (msg.type === 'COMMENTS_REPLACED' && Array.isArray(msg.comments)) {
            setComments(msg.comments);
          } else if (msg.type === 'PRESENCE_UPDATED' && msg.presence) {
            setPresence(msg.presence);
          } else if (msg.type === 'CAMERA_CLAIMED_BY_OUTPUT') {
            onCameraClaimedRef.current?.();
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!closed) {
          reconnectTimer = window.setTimeout(connect, 2200);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      bcRef.current?.close();
    };
  }, [roomId, role]);

  const publishProject = useCallback(
    async (project: StudioProject) => {
      const stamped: StudioProject = {
        ...project,
        updatedAt: new Date().toISOString(),
      };
      setSavedProject(stamped);
      try {
        localStorage.setItem(LOCAL_PROJECT_KEY, JSON.stringify(stamped));
      } catch {
        // localStorage full is handled cleanly via toast in caller
      }
      sendWs({ type: 'PROJECT_PUBLISH', project: stamped });
      try {
        await fetch(`/api/rooms/${encodeURIComponent(roomId)}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project: stamped }),
        });
      } catch {
        // WS/local fallback already applied
      }
      return stamped;
    },
    [roomId, sendWs]
  );

  const patchLive = useCallback(
    (patch: Partial<LiveRuntimeState>) => {
      setLive((prev) => ({ ...prev, ...patch }));
      sendWs({ type: 'LIVE_PATCH', patch });
    },
    [sendWs]
  );

  const triggerAlert = useCallback(
    (alert: LiveAlert) => {
      setLive((prev) => ({ ...prev, activeAlert: alert }));
      sendWs({ type: 'ALERT_TRIGGER', alert });
    },
    [sendWs]
  );

  const sendExternalEvent = useCallback(
    async (payload: Record<string, unknown>) => {
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return res.ok;
      } catch {
        sendWs({ type: 'COMMENT_ADD', payload });
        return true;
      }
    },
    [roomId, sendWs]
  );

  const pinComment = useCallback(
    (commentId: string | null, showOnStage?: boolean) => {
      setLive((prev) => ({
        ...prev,
        pinnedCommentId: commentId,
        showPinnedOnStage: typeof showOnStage === 'boolean' ? showOnStage : prev.showPinnedOnStage,
      }));
      sendWs({ type: 'COMMENT_PIN', commentId, showOnStage });
    },
    [sendWs]
  );

  const toggleCommentAnswered = useCallback(
    (commentId: string) => {
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, answered: !c.answered } : c))
      );
      sendWs({ type: 'COMMENT_TOGGLE_ANSWERED', commentId });
    },
    [sendWs]
  );

  const clearComments = useCallback(() => {
    setComments([]);
    setLive((prev) => ({ ...prev, pinnedCommentId: null, showPinnedOnStage: false }));
    sendWs({ type: 'COMMENT_CLEAR' });
  }, [sendWs]);

  // Real TikFinity Local Desktop Bridge WebSocket (ws://localhost:21213)
  const connectTikFinity = useCallback(
    (endpoint: string) => {
      tikfinityRef.current?.close();
      setTikfinityUrl(endpoint);
      setTikfinityStatus('connecting');
      try {
        const bridge = new WebSocket(endpoint);
        tikfinityRef.current = bridge;
        bridge.onopen = () => setTikfinityStatus('connected');
        bridge.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data && (data.event === 'chat' || data.event === 'gift' || data.event === 'like')) {
              sendExternalEvent({ ...data, platform: 'tiktok' });
            }
          } catch {
            // ignore non-json bridge packet
          }
        };
        bridge.onerror = () => setTikfinityStatus('error');
        bridge.onclose = () => {
          setTikfinityStatus((curr) => (curr === 'error' ? 'error' : 'idle'));
        };
      } catch {
        setTikfinityStatus('error');
      }
    },
    [sendExternalEvent]
  );

  const disconnectTikFinity = useCallback(() => {
    tikfinityRef.current?.close();
    tikfinityRef.current = null;
    setTikfinityStatus('idle');
  }, []);

  useEffect(() => {
    return () => {
      tikfinityRef.current?.close();
    };
  }, []);

  const claimCameraForOutput = useCallback(() => {
    sendWs({ type: 'CAMERA_CLAIMED_BY_OUTPUT' });
  }, [sendWs]);

  return {
    savedProject,
    setSavedProject,
    live,
    comments,
    presence,
    wsConnected,
    publishProject,
    patchLive,
    triggerAlert,
    sendExternalEvent,
    pinComment,
    toggleCommentAnswered,
    clearComments,
    claimCameraForOutput,
    tikfinityStatus,
    tikfinityUrl,
    connectTikFinity,
    disconnectTikFinity,
  };
}
