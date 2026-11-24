import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  LiveAlert,
  LiveComment,
  LiveRuntimeState,
  RoomPresence,
  StudioProject,
} from './src/types/studio';
import { normalizeExternalEvent } from './src/utils/commentFilter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ClientRole = 'admin' | 'operator' | 'output' | 'teleprompter';

interface RoomClient {
  ws: WebSocket;
  role: ClientRole;
}

interface ServerRoom {
  id: string;
  project: StudioProject | null;
  live: LiveRuntimeState;
  comments: LiveComment[];
  clients: Set<RoomClient>;
  updatedAt: number;
}

const rooms = new Map<string, ServerRoom>();

function createDefaultLiveState(): LiveRuntimeState {
  return {
    activeSceneId: 'scene-pure-glass',
    activeProductId: 'p1',
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
}

function getOrCreateRoom(roomId: string): ServerRoom {
  const cleanId = (roomId || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'default';
  let room = rooms.get(cleanId);
  if (!room) {
    room = {
      id: cleanId,
      project: null,
      live: createDefaultLiveState(),
      comments: [
        {
          id: 'seed-cmt-1',
          user: 'Chị Ngọc Hân',
          text: 'Mã 01 Serum B5 da nhạy cảm dùng được không shop, giá trên live bao nhiêu ạ?',
          platform: 'tiktok',
          timestamp: Date.now() - 45000,
          priority: 'question',
          matchedKeywords: ['mã', 'giá', 'nhạy cảm'],
          answered: false,
        },
        {
          id: 'seed-cmt-2',
          user: 'Minh Thư',
          text: 'Chốt mã 02 kem chống nắng nha shop ơi, có freeship không?',
          platform: 'tiktok',
          timestamp: Date.now() - 20000,
          priority: 'hot',
          matchedKeywords: ['chốt', 'mã', 'freeship'],
          answered: false,
        },
      ],
      clients: new Set(),
      updatedAt: Date.now(),
    };
    rooms.set(cleanId, room);
  }
  return room;
}

function getPresence(room: ServerRoom): RoomPresence {
  const counts: RoomPresence = { total: 0, admin: 0, operator: 0, output: 0, teleprompter: 0 };
  for (const c of room.clients) {
    if (c.ws.readyState === WebSocket.OPEN) {
      counts.total += 1;
      counts[c.role] += 1;
    }
  }
  return counts;
}

function broadcast(room: ServerRoom, payload: Record<string, unknown>, exclude?: WebSocket) {
  const raw = JSON.stringify(payload);
  for (const client of room.clients) {
    if (client.ws !== exclude && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(raw);
    }
  }
}

function addCommentIdempotent(room: ServerRoom, comment: LiveComment): boolean {
  if (room.comments.some((c) => c.id === comment.id)) return false;
  room.comments = [comment, ...room.comments].slice(0, 120);
  room.updatedAt = Date.now();
  return true;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size, uptime: process.uptime() });
  });

  // Get room state
  app.get('/api/rooms/:roomId', (req, res) => {
    const room = getOrCreateRoom(req.params.roomId);
    res.json({
      roomId: room.id,
      project: room.project,
      live: room.live,
      comments: room.comments,
      presence: getPresence(room),
    });
  });

  // Publish / save project snapshot to room
  app.post('/api/rooms/:roomId/publish', (req, res) => {
    const room = getOrCreateRoom(req.params.roomId);
    const project = req.body?.project as StudioProject | undefined;
    if (!project || !Array.isArray(project.scenes)) {
      res.status(400).json({ error: 'Invalid project payload' });
      return;
    }
    room.project = project;
    if (!project.scenes.some((s) => s.id === room.live.activeSceneId) && project.scenes[0]) {
      room.live.activeSceneId = project.activeSceneId || project.scenes[0].id;
    }
    room.updatedAt = Date.now();
    broadcast(room, { type: 'PROJECT_UPDATED', project: room.project, live: room.live });
    res.json({ ok: true, updatedAt: room.updatedAt });
  });

  // Universal External Webhook (TikTok LIVE / TikFinity / Shopee / Zapier / Custom Script)
  app.post('/api/rooms/:roomId/events', (req, res) => {
    const room = getOrCreateRoom(req.params.roomId);
    const normalized = normalizeExternalEvent(req.body || {});
    if (!normalized) {
      res.status(400).json({ error: 'Payload requires message or event type' });
      return;
    }

    if (normalized.comment) {
      const added = addCommentIdempotent(room, normalized.comment);
      if (added) {
        broadcast(room, { type: 'COMMENT_ADDED', comment: normalized.comment });
      }
    }

    if (normalized.alert) {
      room.live.activeAlert = normalized.alert;
      broadcast(room, { type: 'ALERT_TRIGGERED', alert: normalized.alert });
    }

    res.json({
      ok: true,
      comment: normalized.comment || null,
      alert: normalized.alert || null,
      connectedDevices: getPresence(room),
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const urlObj = new URL(req.url || '/ws', 'http://localhost:3000');
    const roomId = urlObj.searchParams.get('room') || 'default';
    const rawRole = urlObj.searchParams.get('role') || 'operator';
    const role: ClientRole =
      rawRole === 'admin' || rawRole === 'output' || rawRole === 'teleprompter'
        ? rawRole
        : 'operator';

    const room = getOrCreateRoom(roomId);
    const clientRef: RoomClient = { ws, role };
    room.clients.add(clientRef);

    // Send initial authoritative state
    ws.send(
      JSON.stringify({
        type: 'ROOM_INIT',
        roomId: room.id,
        project: room.project,
        live: room.live,
        comments: room.comments,
        presence: getPresence(room),
      })
    );
    broadcast(room, { type: 'PRESENCE_UPDATED', presence: getPresence(room) }, ws);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (!msg || typeof msg.type !== 'string') return;

        switch (msg.type) {
          case 'PROJECT_PUBLISH': {
            if (msg.project && Array.isArray(msg.project.scenes)) {
              room.project = msg.project as StudioProject;
              room.updatedAt = Date.now();
              broadcast(room, { type: 'PROJECT_UPDATED', project: room.project, live: room.live }, ws);
            }
            break;
          }
          case 'LIVE_PATCH': {
            if (msg.patch && typeof msg.patch === 'object') {
              room.live = { ...room.live, ...msg.patch };
              room.updatedAt = Date.now();
              broadcast(room, { type: 'LIVE_UPDATED', live: room.live }, ws);
            }
            break;
          }
          case 'ALERT_TRIGGER': {
            const alert = msg.alert as LiveAlert | undefined;
            if (alert && alert.id) {
              room.live.activeAlert = alert;
              broadcast(room, { type: 'ALERT_TRIGGERED', alert }, ws);
            }
            break;
          }
          case 'COMMENT_ADD': {
            const normalized = normalizeExternalEvent(msg.payload || msg.comment || {});
            if (normalized?.comment) {
              if (addCommentIdempotent(room, normalized.comment)) {
                broadcast(room, { type: 'COMMENT_ADDED', comment: normalized.comment });
              }
            }
            if (normalized?.alert) {
              room.live.activeAlert = normalized.alert;
              broadcast(room, { type: 'ALERT_TRIGGERED', alert: normalized.alert });
            }
            break;
          }
          case 'COMMENT_PIN': {
            const commentId = typeof msg.commentId === 'string' ? msg.commentId : null;
            room.live.pinnedCommentId = commentId;
            if (typeof msg.showOnStage === 'boolean') {
              room.live.showPinnedOnStage = msg.showOnStage;
            }
            broadcast(room, { type: 'LIVE_UPDATED', live: room.live });
            break;
          }
          case 'COMMENT_TOGGLE_ANSWERED': {
            const commentId = msg.commentId;
            room.comments = room.comments.map((c) =>
              c.id === commentId ? { ...c, answered: !c.answered } : c
            );
            broadcast(room, { type: 'COMMENTS_REPLACED', comments: room.comments });
            break;
          }
          case 'COMMENT_CLEAR': {
            room.comments = [];
            room.live.pinnedCommentId = null;
            room.live.showPinnedOnStage = false;
            broadcast(room, { type: 'COMMENTS_REPLACED', comments: room.comments });
            broadcast(room, { type: 'LIVE_UPDATED', live: room.live });
            break;
          }
          case 'CAMERA_CLAIMED_BY_OUTPUT': {
            broadcast(room, { type: 'CAMERA_CLAIMED_BY_OUTPUT' }, ws);
            break;
          }
          case 'ROLE_UPDATE': {
            const nextRole = msg.role;
            if (
              nextRole === 'admin' ||
              nextRole === 'operator' ||
              nextRole === 'output' ||
              nextRole === 'teleprompter'
            ) {
              clientRef.role = nextRole;
              broadcast(room, { type: 'PRESENCE_UPDATED', presence: getPresence(room) });
            }
            break;
          }
        }
      } catch {
        // Ignore malformed socket frames
      }
    });

    ws.on('close', () => {
      room.clients.delete(clientRef);
      broadcast(room, { type: 'PRESENCE_UPDATED', presence: getPresence(room) });
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`PocketLive Canva Studio server running at http://localhost:${PORT}`);
  });
}

startServer();
