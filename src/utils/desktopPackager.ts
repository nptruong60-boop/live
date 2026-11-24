import type { StudioProject } from '../types/studio';
import { generateStandaloneLiveHtml } from './standaloneExporter';
import { buildZipArchive } from './zipBuilder';

export interface PackageFileDescriptor {
  /** Path inside the root folder, e.g. "1_CAI_DAT_VA_TAO_ICON_DESKTOP.bat" */
  relativePath: string;
  /** Folder category for UI display */
  category: 'installer' | 'guide' | 'app' | 'data';
  /** Short Vietnamese description shown in the folder preview */
  description: string;
  /** File content (UTF-8 string) */
  content: string;
  /** MIME type for individual file download */
  mimeType: string;
}

export interface DesktopPackageOptions {
  project: StudioProject;
  roomId: string;
  serverOrigin: string;
  tikfinityUrl?: string;
}

export const PACKAGE_ROOT_FOLDER = 'PocketLive_Studio_Package';

function escHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toCrlf(text: string): string {
  return text.replace(/\r?\n/g, '\r\n');
}

function buildUrls(origin: string, roomId: string) {
  const cleanOrigin = (origin || 'http://localhost:3000').replace(/\/+$/, '');
  const encRoom = encodeURIComponent(roomId || 'live-studio');
  return {
    origin: cleanOrigin,
    editorUrl: `${cleanOrigin}/?room=${encRoom}`,
    liveControlUrl: `${cleanOrigin}/?mode=live&room=${encRoom}`,
    tiktokLinkOverlayUrl: `${cleanOrigin}/?view=output&room=${encRoom}`,
    outputWithCamUrl: `${cleanOrigin}/?view=output&room=${encRoom}&cam=1`,
    teleprompterUrl: `${cleanOrigin}/?view=teleprompter&room=${encRoom}`,
    webhookUrl: `${cleanOrigin}/api/rooms/${encRoom}/events`,
  };
}

function buildLocalNodeServerMjs(): string {
  return `#!/usr/bin/env node
/**
 * PocketLive Studio — Local Zero-Dependency Live Server (HTTP + WebSocket)
 * Chay cuc bo khong can npm install, dong bo thoi gian thuc giua Bang Dieu Khien
 * va Nguon Link 1080x1920 trong TikTok LIVE Studio / OBS.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3456);
const PLAYER_HTML_PATH = path.join(__dirname, 'PocketLive_Offline_Player.html');

const wsClients = new Set();
let lastStatePayload = null;

function encodeWsText(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function decodeWsFrames(buffer) {
  const messages = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const opcode = buffer[offset] & 0x0f;
    const masked = (buffer[offset + 1] & 0x80) !== 0;
    let payloadLen = buffer[offset + 1] & 0x7f;
    let pos = offset + 2;
    if (payloadLen === 126) {
      if (pos + 2 > buffer.length) break;
      payloadLen = buffer.readUInt16BE(pos);
      pos += 2;
    } else if (payloadLen === 127) {
      if (pos + 8 > buffer.length) break;
      payloadLen = Number(buffer.readBigUInt64BE(pos));
      pos += 8;
    }
    const maskLen = masked ? 4 : 0;
    if (pos + maskLen + payloadLen > buffer.length) break;
    const mask = masked ? buffer.subarray(pos, pos + 4) : null;
    pos += maskLen;
    const data = Buffer.alloc(payloadLen);
    for (let i = 0; i < payloadLen; i++) {
      data[i] = masked && mask ? buffer[pos + i] ^ mask[i % 4] : buffer[pos + i];
    }
    offset = pos + payloadLen;
    if (opcode === 0x01) messages.push(data.toString('utf8'));
    if (opcode === 0x08) messages.push(null);
  }
  return { messages, remaining: buffer.subarray(offset) };
}

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/output') {
    try {
      const html = fs.readFileSync(PLAYER_HTML_PATH, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Khong tim thay file PocketLive_Offline_Player.html: ' + String(err));
      return;
    }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\\r\\n' +
    'Upgrade: websocket\\r\\n' +
    'Connection: Upgrade\\r\\n' +
    'Sec-WebSocket-Accept: ' + accept + '\\r\\n\\r\\n'
  );

  wsClients.add(socket);
  if (lastStatePayload) {
    socket.write(encodeWsText(lastStatePayload));
  }

  let rxBuf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    rxBuf = Buffer.concat([rxBuf, chunk]);
    const { messages, remaining } = decodeWsFrames(rxBuf);
    rxBuf = remaining;
    for (const msg of messages) {
      if (msg === null) {
        socket.end();
        return;
      }
      lastStatePayload = msg;
      const frame = encodeWsText(msg);
      for (const client of wsClients) {
        if (client !== socket && !client.destroyed) {
          client.write(frame);
        }
      }
    }
  });

  const cleanup = () => wsClients.delete(socket);
  socket.on('close', cleanup);
  socket.on('error', cleanup);
});

server.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLanIp();
  console.log('');
  console.log('===============================================================');
  console.log('  POCKETLIVE STUDIO LOCAL SERVER DA SAN SANG (CHAY OFFLINE)');
  console.log('===============================================================');
  console.log('  1. Bang Dieu Khien Live : http://localhost:' + PORT + '/');
  console.log('  2. Link TikTok LIVE Studio (1080x1920):');
  console.log('     http://localhost:' + PORT + '/?view=output');
  console.log('  3. Output Co Camera Rieng:');
  console.log('     http://localhost:' + PORT + '/?view=output&cam=1');
  console.log('  4. Mang LAN (Wi-Fi noi bo): http://' + lanIp + ':' + PORT + '/');
  console.log('===============================================================');
  console.log('  Giu cua so nay mo trong suot phien Live. Bam Ctrl+C de tat.');
  console.log('');
});
`;
}

function buildInstallBat(urls: ReturnType<typeof buildUrls>, projectName: string): string {
  return toCrlf(`@echo off
chcp 65001 >nul
title PocketLive Studio — Cai Dat & Tao Icon Desktop
color 0B
echo ========================================================================
echo   POCKETLIVE STUDIO — CAI DAT NHANH CHO MAY TINH & TIKTOK LIVE STUDIO
echo   Du an: ${projectName}
echo ========================================================================
echo.

set "PKG_DIR=%~dp0"
set "BROWSER="

if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"
if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"
if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"
if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"

if "%BROWSER%"=="" (
  echo [!] Khong tim thay Chrome hoac Edge. He thong se dung trinh duyet mac dinh.
) else (
  echo [OK] Da tim thay trinh duyet: %BROWSER%
)

echo.
echo [1/3] Dang tao cac bieu tuong (Shortcut) ngoai man hinh Desktop...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$desk = [Environment]::GetFolderPath('Desktop'); " ^
  "$s1 = $ws.CreateShortcut((Join-Path $desk 'PocketLive - Dieu Khien Live.lnk')); " ^
  "$s1.TargetPath = Join-Path $env:PKG_DIR '2_CHAY_BANG_DIEU_KHIEN_LIVE.bat'; " ^
  "$s1.WorkingDirectory = $env:PKG_DIR; " ^
  "$s1.Description = 'Mo Bang Dieu Khien Live PocketLive Studio'; " ^
  "$s1.Save(); " ^
  "$s2 = $ws.CreateShortcut((Join-Path $desk 'PocketLive - Output Co Camera.lnk')); " ^
  "$s2.TargetPath = Join-Path $env:PKG_DIR '3_MO_OUTPUT_CO_CAMERA_RIENG.bat'; " ^
  "$s2.WorkingDirectory = $env:PKG_DIR; " ^
  "$s2.Description = 'Mo Cua So Output 9:16 Co Camera cho TikTok LIVE Studio'; " ^
  "$s2.Save(); " ^
  "$s3 = $ws.CreateShortcut((Join-Path $desk 'PocketLive - Huong Dan TikTok LIVE.lnk')); " ^
  "$s3.TargetPath = Join-Path $env:PKG_DIR 'HUONG_DAN_TIKTOK_LIVE_STUDIO.html'; " ^
  "$s3.WorkingDirectory = $env:PKG_DIR; " ^
  "$s3.Save();"

echo [OK] Da tao 3 icon ngoai Desktop:
echo      - PocketLive - Dieu Khien Live
echo      - PocketLive - Output Co Camera
echo      - PocketLive - Huong Dan TikTok LIVE
echo.

echo [2/3] Dang copy san duong dan Link Nguon cho TikTok LIVE Studio (1080x1920)...
echo|set /p="${urls.tiktokLinkOverlayUrl}"|clip
echo [OK] Da copy vao Clipboard:
echo      ${urls.tiktokLinkOverlayUrl}
echo.
echo      -> Mo TikTok LIVE Studio -> Them nguon -> Lien ket (Link)
echo      -> Bam Ctrl + V de dan link -> Nhap kich thuoc 1080 x 1920!
echo.

echo [3/3] Dang mo trang Huong Dan Chi Tiet...
start "" "%PKG_DIR%HUONG_DAN_TIKTOK_LIVE_STUDIO.html"

echo.
echo ========================================================================
echo   CAI DAT HOAN TAT! Nhan phim bat ky de dong cua so nay.
echo ========================================================================
pause >nul
`);
}

function buildRunControlBat(urls: ReturnType<typeof buildUrls>): string {
  return toCrlf(`@echo off
chcp 65001 >nul
title PocketLive Studio — Bang Dieu Khien Live
echo|set /p="${urls.tiktokLinkOverlayUrl}"|clip
echo [OK] Da tu dong copy Link Nguon TikTok LIVE Studio vao Clipboard!
echo      Dan vao TikTok LIVE Studio ^> Them nguon ^> Lien ket (1080x1920):
echo      ${urls.tiktokLinkOverlayUrl}
echo.

set "BROWSER="
if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"
if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"
if "%BROWSER%"=="" if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"
if "%BROWSER%"=="" if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"

if not "%BROWSER%"=="" (
  start "" "%BROWSER%" --app="${urls.liveControlUrl}" --window-size=1360,860
) else (
  start "" "${urls.liveControlUrl}"
)
exit /b 0
`);
}

function buildRunOutputCamBat(urls: ReturnType<typeof buildUrls>): string {
  return toCrlf(`@echo off
chcp 65001 >nul
title PocketLive Studio — Output 9:16 Co Camera
set "BROWSER="
if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"
if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"
if "%BROWSER%"=="" if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"
if "%BROWSER%"=="" if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"

if not "%BROWSER%"=="" (
  start "" "%BROWSER%" --app="${urls.outputWithCamUrl}" --window-size=470,840
) else (
  start "" "${urls.outputWithCamUrl}"
)
exit /b 0
`);
}

function buildRunOfflineBat(): string {
  return toCrlf(`@echo off
chcp 65001 >nul
title PocketLive Studio — Che Do Offline Cuc Bo
set "PKG_DIR=%~dp0"

where node >nul 2>nul
if %errorlevel%==0 (
  echo [OK] Phat hien Node.js! Dang khoi dong may chu cuc bo sieu nhe (port 3456)...
  echo|set /p="http://localhost:3456/?view=output"|clip
  echo [OK] Da copy Link Offline cho TikTok LIVE Studio: http://localhost:3456/?view=output
  start "" "http://localhost:3456/"
  node "%PKG_DIR%app\\pocketlive-local-server.mjs"
  pause
) else (
  echo [i] May chua cai Node.js -> Dang mo ban App Offline HTML doc lap (0%% cau hinh)...
  start "" "%PKG_DIR%app\\PocketLive_Offline_Player.html"
)
`);
}

function buildMacCommand(urls: ReturnType<typeof buildUrls>): string {
  return `#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
printf "%s" "${urls.tiktokLinkOverlayUrl}" | pbcopy
echo "==================================================================="
echo "  POCKETLIVE STUDIO (macOS)"
echo "  Da tu dong copy Link Nguon cho TikTok LIVE Studio / OBS:"
echo "  ${urls.tiktokLinkOverlayUrl}"
echo "==================================================================="
open "${urls.liveControlUrl}"
open "$DIR/HUONG_DAN_TIKTOK_LIVE_STUDIO.html"
`;
}

function buildLinksTxt(urls: ReturnType<typeof buildUrls>, roomId: string, tikfinityUrl: string): string {
  return toCrlf(`========================================================================
POCKETLIVE STUDIO — DANH SACH DUONG DAN KET NOI NHANH
Ma phong dong bo (Room ID): ${roomId}
========================================================================

1. LINK CHO TIKTOK LIVE STUDIO / OBS (KHUYEN DUNG — OVERLAY TRONG SUOT 1080x1920)
   ${urls.tiktokLinkOverlayUrl}

   Cach dan vao TikTok LIVE Studio:
   - Bam "+ Them nguon" (Add Source) -> chon "Lien ket" (Link)
   - Dan duong dan o tren vao o URL
   - Chieu rong (Width): 1080 | Chieu cao (Height): 1920 | FPS: 60
   - Dat lop Camera (DJI Osmo Pocket / Webcam) nam BEN DUOI lop Lien ket nay.

2. CUA SO OUTPUT ROI CO CAMERA (DUNG CHO GHI CUA SO / WINDOW CAPTURE)
   ${urls.outputWithCamUrl}

3. BANG DIEU KHIEN LIVE (CHO NHAN VIEN BAM SAN PHAM & CHOT DON)
   ${urls.liveControlUrl}

4. TRANG THIET KE CANVA (ADMIN CHINH SUA LAYOUT, ANH, SAN PHAM)
   ${urls.editorUrl}

5. MAN HINH DOC COMMENT PHONG TO TREN DIEN THOAI / IPAD HOST
   ${urls.teleprompterUrl}

6. KET NOI COMMENT THAT TU TIKTOK LIVE (TIKFINITY DESKTOP)
   WebSocket URL: ${tikfinityUrl}
   Webhook API (POST): ${urls.webhookUrl}

7. LINK OFFLINE CUC BO (KHI CHAY FILE 4_CHAY_LOCAL_OFFLINE_KHONG_CAN_MANG.bat)
   - Bang dieu khien: http://localhost:3456/
   - Link TikTok LIVE Studio: http://localhost:3456/?view=output
`);
}

function buildReadmeTxt(projectName: string, roomId: string): string {
  return toCrlf(`========================================================================
  POCKETLIVE STUDIO — THU MUC DONG GOI DAY DU CHO MAY TINH
  Du an: ${projectName} | Phong Live: ${roomId}
========================================================================

I. CAU TRUC THU MUC
-------------------
  1_CAI_DAT_VA_TAO_ICON_DESKTOP.bat   -> Chay 1 lan duy nhat de tao icon ngoai Desktop
                                         va tu dong copy Link cho TikTok LIVE Studio.
  2_CHAY_BANG_DIEU_KHIEN_LIVE.bat     -> Nhan vien bam de mo Bang Dieu Khien Live hang ngay.
  3_MO_OUTPUT_CO_CAMERA_RIENG.bat     -> Mo cua so 9:16 co san Camera (dung cho Window Capture).
  4_CHAY_LOCAL_OFFLINE_KHONG_CAN_MANG.bat -> Chay Offline 100% tren may tinh (khong lag).
  CHAY_TREN_MAC.command               -> File chay nhanh cho macOS.
  HUONG_DAN_TIKTOK_LIVE_STUDIO.html   -> Huong dan truc quan co nut Copy 1 cham (Bam dup de xem).
  LINK_TIKTOK_LIVE_STUDIO.txt         -> Tong hop tat ca duong dan ket noi.
  app/PocketLive_Offline_Player.html  -> App Live Offline 1 file duy nhat (chay khong can cai gi).
  app/pocketlive-local-server.mjs     -> May chu cuc bo sieu nhe (0 MB thu vien ngoai).
  data/project-preset.json            -> File luu du phong toan bo Scene, Layer va San pham.

II. QUY TRINH KET NOI TIKTOK LIVE STUDIO TRONG 3 BUOC (NHANH NHAT)
------------------------------------------------------------------
  Buoc 1: Giai nen toan bo thu muc nay ra o D:\\ hoac Desktop.
  Buoc 2: Bam dup file "1_CAI_DAT_VA_TAO_ICON_DESKTOP.bat"
          (He thong tu tao icon ngoai Desktop va copy san Link 1080x1920).
  Buoc 3: Mo phan mem TikTok LIVE Studio:
          - Chon khung doc 9:16 (1080x1920).
          - Them nguon "Camera" (DJI Osmo Pocket 4P hoac Webcam cua ban).
          - Bam "+ Them nguon" -> "Lien ket" (Link) -> Bam Ctrl+V de dan link vua copy
            -> Chinh kich thuoc 1080 x 1920 -> Dat nam TREN lop Camera.
          - Trong PocketLive Studio, chon nen "Trong Suot OBS" -> XONG!

III. PHIM TAT NHANH KHI LIVE
----------------------------
  Phim 1 - 9 : Chuyen nhanh san pham dang ghim
  Phim 0     : An the san pham
  Phim H     : An/Hien toan bo Overlay
  Phim F     : Bat/Tat dong ho dem nguoc Flash Sale
  Phim S     : Bat/Tat khung vung an toan TikTok Safe Zone
  Phim ESC   : Thoat che do Clean View
`);
}

function buildInteractiveGuideHtml(
  project: StudioProject,
  urls: ReturnType<typeof buildUrls>,
  roomId: string,
  tikfinityUrl: string
): string {
  const safeName = escHtml(project.name || 'PocketLive Studio');
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hướng dẫn Cài đặt & Kết nối TikTok LIVE Studio — ${safeName}</title>
  <style>
    :root { --bg:#0b0e14; --card:#121722; --border:rgba(255,255,255,.1); --text:#f4f4f5; --muted:#9ca3af; --accent:#6366f1; --green:#10b981; }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;padding:28px 18px 64px}
    .wrap{max-width:940px;margin:0 auto}
    header{padding-bottom:20px;border-bottom:1px solid var(--border);margin-bottom:24px}
    .badge{display:inline-block;padding:4px 10px;border-radius:8px;background:rgba(99,102,241,.2);color:#a5b4fc;font-size:12px;font-weight:700;margin-bottom:10px}
    h1{font-size:26px;font-weight:800;letter-spacing:-0.02em}
    .sub{color:var(--muted);font-size:14px;margin-top:6px}
    .grid{display:grid;grid-template-columns:1fr;gap:18px}
    @media(min-width:820px){.grid-2{grid-template-columns:1fr 1fr}}
    .card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px}
    .card h2{font-size:16px;font-weight:800;margin-bottom:10px;display:flex;align-items:center;gap:8px}
    .step-num{width:24px;height:24px;border-radius:8px;background:var(--accent);color:#fff;font-size:12px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
    .copy-box{display:flex;gap:8px;margin:10px 0}
    .copy-box input{flex:1;background:#090c12;border:1px solid var(--border);border-radius:10px;padding:9px 12px;color:#e4e4e7;font-family:ui-monospace,Consolas,monospace;font-size:12px}
    .btn{padding:9px 14px;border-radius:10px;border:0;background:var(--accent);color:#fff;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
    .btn:hover{filter:brightness(1.1)}
    .btn-green{background:#059669}
    .steps{list-style:none;display:flex;flex-direction:column;gap:9px;margin-top:10px;font-size:13.5px;color:#d4d4d8}
    .steps li{padding:10px 12px;background:#0d111a;border:1px solid rgba(255,255,255,.06);border-radius:10px}
    .steps strong{color:#fff}
    .specs{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}
    .spec{background:#090c12;border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center}
    .spec .k{font-size:11px;color:var(--muted)}
    .spec .v{font-size:17px;font-weight:800;color:#818cf8;font-family:ui-monospace,Consolas,monospace}
    .tip{margin-top:12px;padding:12px;border-radius:10px;background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.3);font-size:12.5px;color:#a7f3d0}
    .warn{margin-top:12px;padding:12px;border-radius:10px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);font-size:12.5px;color:#fde68a}
    table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
    th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--border)}
    th{color:var(--muted);font-size:11.5px;text-transform:uppercase}
    code{background:#090c12;padding:2px 6px;border-radius:6px;font-family:ui-monospace,Consolas,monospace;color:#c7d2fe;font-size:12px}
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="badge">BỘ HƯỚNG DẪN CÀI ĐẶT TRỌN GÓI · PHÒNG LIVE: ${escHtml(roomId)}</div>
      <h1>Hướng dẫn Kết nối PocketLive Studio với TikTok LIVE Studio</h1>
      <p class="sub">Dự án: <strong>${safeName}</strong> (${project.scenes.length} Scene · ${project.products.length} Sản phẩm) — Tối ưu siêu nhẹ cho máy tính livestream Windows &amp; macOS.</p>
    </header>

    <div class="grid">
      <!-- CACH 1: LINK SOURCE -->
      <section class="card">
        <h2><span class="step-num">1</span> Cách 1 (Khuyên dùng — Siêu nét, 60 FPS): Thêm nguồn Liên kết (Link) trong TikTok LIVE Studio</h2>
        <p style="font-size:13px;color:var(--muted)">Cách này để TikTok LIVE Studio nhận trực tiếp Camera thật (DJI Osmo Pocket 4P / Webcam) ở lớp dưới, còn PocketLive chỉ xuất lớp Overlay Kính mờ trong suốt đè lên trên — cực kỳ nhẹ CPU/RAM và không bao giờ bị trùng Camera!</p>

        <div class="copy-box">
          <input id="url-link" type="text" readonly value="${escHtml(urls.tiktokLinkOverlayUrl)}" />
          <button class="btn btn-green" onclick="copyVal('url-link', this)">Sao chép Link 1080×1920</button>
        </div>

        <div class="specs">
          <div class="spec"><div class="k">Chiều rộng (Width)</div><div class="v">1080</div></div>
          <div class="spec"><div class="k">Chiều cao (Height)</div><div class="v">1920</div></div>
          <div class="spec"><div class="k">Khung hình (FPS)</div><div class="v">60 FPS</div></div>
        </div>

        <ol class="steps">
          <li><strong>Bước 1:</strong> Mở <strong>TikTok LIVE Studio</strong>, chọn chế độ khung dọc <strong>9:16 (Chân dung)</strong>.</li>
          <li><strong>Bước 2:</strong> Bấm <strong>+ Thêm nguồn (Add Source) → Camera</strong>, chọn DJI Osmo Pocket 4P hoặc Webcam của bạn.</li>
          <li><strong>Bước 3:</strong> Bấm <strong>+ Thêm nguồn (Add Source) → Liên kết (Link / Web)</strong>.</li>
          <li><strong>Bước 4:</strong> Dán đường dẫn vừa sao chép ở trên, đặt kích thước <strong>1080 × 1920</strong>, kéo lớp Liên kết nằm <strong>TRÊN lớp Camera</strong>.</li>
          <li><strong>Bước 5:</strong> Mở file <code>2_CHAY_BANG_DIEU_KHIEN_LIVE.bat</code> để nhân viên bấm đổi mã sản phẩm (phím <code>1–9</code>), Flash Sale (<code>F</code>) → trên TikTok LIVE Studio sẽ nhảy ngay tức thì!</li>
        </ol>

        <div class="tip">
          <strong>Mẹo trong suốt nền:</strong> Trong tab <em>Thiết kế Canva</em>, chọn nền <strong>Trong Suốt OBS</strong> rồi bấm <strong>Lưu &amp; Phát bản mới</strong> — TikTok LIVE Studio sẽ tự tách nền trong suốt tuyệt đối không cần phông xanh.
        </div>
      </section>

      <!-- CACH 2: WINDOW CAPTURE + CAMERA -->
      <section class="card">
        <h2><span class="step-num">2</span> Cách 2: Mở Cửa sổ Output rời có sẵn Camera (Khi dùng lớp Trung cảnh sau lưng Host)</h2>
        <p style="font-size:13px;color:var(--muted)">Nếu bạn muốn PocketLive hiển thị trực tiếp Camera trong cửa sổ Output rời (ví dụ để chụp cửa sổ / Window Capture):</p>
        <div class="copy-box">
          <input id="url-cam" type="text" readonly value="${escHtml(urls.outputWithCamUrl)}" />
          <button class="btn" onclick="copyVal('url-cam', this)">Sao chép Link Output + Cam</button>
        </div>
        <ol class="steps">
          <li><strong>Bước 1:</strong> Bấm đúp file <code>3_MO_OUTPUT_CO_CAMERA_RIENG.bat</code> (hoặc biểu tượng <em>PocketLive - Output Co Camera</em> ngoài Desktop).</li>
          <li><strong>Bước 2:</strong> Cho phép quyền Camera trên trình duyệt. Di chuột lên góc trên bên phải cửa sổ Output để chọn đúng Camera / Lật gương (thanh nút tự ẩn sau 2.8 giây).</li>
          <li><strong>Bước 3:</strong> Trong <strong>TikTok LIVE Studio</strong>, bấm <strong>+ Thêm nguồn → Ghi cửa sổ (Window Capture)</strong> → chọn cửa sổ <em>PocketLive Studio</em>.</li>
        </ol>
        <div class="warn">
          <strong>Lưu ý tránh xung đột Camera:</strong> Mỗi Camera UVC trên Windows chỉ cấp hình cho 1 phần mềm tại 1 thời điểm. Nếu dùng Cách 2, hãy tắt nguồn Camera trực tiếp trong TikTok LIVE Studio để nhường Camera cho cửa sổ Output.
        </div>
      </section>

      <!-- CACH 3: COMMENT & PHONE TELEPROMPTER -->
      <div class="grid grid-2">
        <section class="card">
          <h2><span class="step-num">3</span> Màn hình Đọc Comment trên Điện Thoại Host</h2>
          <p style="font-size:13px;color:var(--muted)">Mở đường dẫn dưới đây trên điện thoại / iPad đặt cạnh chân máy để đọc bình luận chữ siêu to và bật giọng đọc tự động tiếng Việt:</p>
          <div class="copy-box">
            <input id="url-phone" type="text" readonly value="${escHtml(urls.teleprompterUrl)}" />
            <button class="btn" onclick="copyVal('url-phone', this)">Sao chép</button>
          </div>
          <p style="font-size:12.5px;color:#d4d4d8">Hoặc vào tab <strong>Kết nối &amp; Xuất bản</strong> trên máy tính để quét mã QR trực tiếp bằng camera điện thoại.</p>
        </section>

        <section class="card">
          <h2><span class="step-num">4</span> Nhận Comment thật từ TikTok LIVE (TikFinity)</h2>
          <p style="font-size:13px;color:var(--muted)">Cài phần mềm miễn phí <strong>TikFinity Desktop</strong>, đăng nhập kênh TikTok của bạn, sau đó kết nối WebSocket cục bộ:</p>
          <div class="copy-box">
            <input id="url-tik" type="text" readonly value="${escHtml(tikfinityUrl)}" />
            <button class="btn" onclick="copyVal('url-tik', this)">Sao chép</button>
          </div>
          <p style="font-size:12.5px;color:#d4d4d8">Vào tab <strong>Kết nối &amp; Xuất bản</strong> → mục 3 → bấm <strong>Kết nối TikFinity</strong>. Bình luận khách hỏi giá/mua hàng sẽ tự đổ sang điện thoại Host!</p>
        </section>
      </div>

      <!-- CHE DO OFFLINE + PHIM TAT -->
      <div class="grid grid-2">
        <section class="card">
          <h2><span class="step-num">5</span> Chế độ Offline 100% (Không phụ thuộc mạng)</h2>
          <p style="font-size:13px;color:#d4d4d8;margin-bottom:8px">Bấm đúp file <code>4_CHAY_LOCAL_OFFLINE_KHONG_CAN_MANG.bat</code> trong thư mục này:</p>
          <ul class="steps">
            <li>Nếu máy có cài <strong>Node.js</strong>: Tự mở server nội bộ <code>http://localhost:3456</code> và copy ngay Link <code>http://localhost:3456/?view=output</code> cho TikTok LIVE Studio.</li>
            <li>Nếu máy chưa cài Node.js: Tự mở thẳng file <code>app/PocketLive_Offline_Player.html</code> chạy trực tiếp trên Chrome/Edge cực mượt!</li>
          </ul>
        </section>

        <section class="card">
          <h2><span class="step-num">6</span> Bảng Phím Tắt Cho Nhân Viên Live</h2>
          <table>
            <thead><tr><th>Phím</th><th>Chức năng</th></tr></thead>
            <tbody>
              <tr><td><code>1</code> – <code>9</code></td><td>Ghim nhanh Sản phẩm số 1 đến 9</td></tr>
              <tr><td><code>0</code></td><td>Ẩn thẻ sản phẩm đang ghim</td></tr>
              <tr><td><code>H</code></td><td>Ẩn / Hiện toàn bộ lớp Overlay</td></tr>
              <tr><td><code>F</code></td><td>Bật / Tắt đếm ngược Flash Sale</td></tr>
              <tr><td><code>S</code></td><td>Hiện / Ẩn vùng an toàn TikTok Safe Zone</td></tr>
              <tr><td><code>ESC</code></td><td>Thoát chế độ Clean View</td></tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  </div>
  <script>
    function copyVal(id, btn){
      const el = document.getElementById(id);
      if(!el) return;
      navigator.clipboard?.writeText(el.value).catch(()=>{ el.select(); document.execCommand('copy'); });
      const old = btn.textContent;
      btn.textContent = 'Đã sao chép!';
      setTimeout(()=>{ btn.textContent = old; }, 1800);
    }
  </script>
</body>
</html>`;
}

/**
 * Generates the complete list of files inside the downloadable desktop package folder
 * (`PocketLive_Studio_Package/`). Pure function — easy to preview in UI and unit test.
 */
export function buildDesktopPackageFiles(options: DesktopPackageOptions): PackageFileDescriptor[] {
  const { project, roomId, serverOrigin, tikfinityUrl = 'ws://localhost:21213' } = options;
  const urls = buildUrls(serverOrigin, roomId);
  const projectName = project.name || 'PocketLive Studio';
  const offlineHtml = generateStandaloneLiveHtml(project);
  const projectJson = JSON.stringify(project, null, 2);

  return [
    {
      relativePath: '1_CAI_DAT_VA_TAO_ICON_DESKTOP.bat',
      category: 'installer',
      description: 'Bấm đúp 1 lần để tạo 3 icon ngoài Desktop & tự copy Link TikTok LIVE Studio (1080×1920)',
      content: buildInstallBat(urls, projectName),
      mimeType: 'text/plain;charset=utf-8',
    },
    {
      relativePath: '2_CHAY_BANG_DIEU_KHIEN_LIVE.bat',
      category: 'installer',
      description: 'Mở Bảng Điều Khiển Live dạng cửa sổ App gọn nhẹ + tự copy Link TikTok LIVE Studio',
      content: buildRunControlBat(urls),
      mimeType: 'text/plain;charset=utf-8',
    },
    {
      relativePath: '3_MO_OUTPUT_CO_CAMERA_RIENG.bat',
      category: 'installer',
      description: 'Mở cửa sổ Output 9:16 có sẵn Camera (dành cho Ghi cửa sổ / Window Capture)',
      content: buildRunOutputCamBat(urls),
      mimeType: 'text/plain;charset=utf-8',
    },
    {
      relativePath: '4_CHAY_LOCAL_OFFLINE_KHONG_CAN_MANG.bat',
      category: 'installer',
      description: 'Chạy Offline 100% cục bộ (tự khởi chạy Local Server 3456 hoặc mở App HTML độc lập)',
      content: buildRunOfflineBat(),
      mimeType: 'text/plain;charset=utf-8',
    },
    {
      relativePath: 'CHAY_TREN_MAC.command',
      category: 'installer',
      description: 'File chạy nhanh cho máy tính macOS (tự copy Link TikTok LIVE Studio & mở App)',
      content: buildMacCommand(urls),
      mimeType: 'text/plain;charset=utf-8',
    },
    {
      relativePath: 'HUONG_DAN_TIKTOK_LIVE_STUDIO.html',
      category: 'guide',
      description: 'Hướng dẫn trực quan từng bước kết nối TikTok LIVE Studio + nút Copy 1 chạm',
      content: buildInteractiveGuideHtml(project, urls, roomId, tikfinityUrl),
      mimeType: 'text/html;charset=utf-8',
    },
    {
      relativePath: 'LINK_TIKTOK_LIVE_STUDIO.txt',
      category: 'guide',
      description: 'Tổng hợp sẵn toàn bộ Link Overlay, Output+Cam, Điện thoại Host & TikFinity của phòng này',
      content: buildLinksTxt(urls, roomId, tikfinityUrl),
      mimeType: 'text/plain;charset=utf-8',
    },
    {
      relativePath: 'README_HUONG_DAN_NHANH.txt',
      category: 'guide',
      description: 'Hướng dẫn nhanh dạng văn bản + bảng phím tắt cho nhân viên livestream',
      content: buildReadmeTxt(projectName, roomId),
      mimeType: 'text/plain;charset=utf-8',
    },
    {
      relativePath: 'app/PocketLive_Offline_Player.html',
      category: 'app',
      description: 'File App Live Offline duy nhất (chứa sẵn toàn bộ Scene, Ảnh & Sản phẩm vừa thiết kế)',
      content: offlineHtml,
      mimeType: 'text/html;charset=utf-8',
    },
    {
      relativePath: 'app/pocketlive-local-server.mjs',
      category: 'app',
      description: 'Máy chủ cục bộ siêu nhẹ (0 thư viện ngoài) cấp link localhost:3456/?view=output cho TikTok LIVE Studio',
      content: buildLocalNodeServerMjs(),
      mimeType: 'text/javascript;charset=utf-8',
    },
    {
      relativePath: 'data/project-preset.json',
      category: 'data',
      description: 'Bản sao lưu toàn bộ kịch bản thiết kế Canva (.JSON) để nạp sang máy khác bất cứ lúc nào',
      content: projectJson,
      mimeType: 'application/json;charset=utf-8',
    },
  ];
}

/**
 * Packages the entire folder into a single ready-to-extract `.zip` Uint8Array.
 */
export function buildDesktopPackageZip(options: DesktopPackageOptions): {
  filename: string;
  bytes: Uint8Array;
  files: PackageFileDescriptor[];
} {
  const files = buildDesktopPackageFiles(options);
  const entries = files.map((file) => ({
    path: `${PACKAGE_ROOT_FOLDER}/${file.relativePath}`,
    content: file.content,
  }));
  const bytes = buildZipArchive(entries);
  const dateTag = new Date().toISOString().slice(0, 10);
  const safeRoom = (options.roomId || 'studio').replace(/[^a-zA-Z0-9_-]/g, '');
  return {
    filename: `PocketLive-Studio-Package-${safeRoom}-${dateTag}.zip`,
    bytes,
    files,
  };
}
