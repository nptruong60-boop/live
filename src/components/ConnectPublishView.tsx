import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileJson,
  FileText,
  FolderArchive,
  Laptop,
  Link2,
  Radio,
  Send,
  Smartphone,
  Terminal,
  Tv,
  Upload,
} from 'lucide-react';
import type { RoomPresence, StudioProject } from '../types/studio';
import { generateStandaloneLiveHtml } from '../utils/standaloneExporter';
import {
  buildDesktopPackageFiles,
  buildDesktopPackageZip,
  PACKAGE_ROOT_FOLDER,
  type PackageFileDescriptor,
} from '../utils/desktopPackager';

interface ConnectPublishViewProps {
  project: StudioProject;
  roomId: string;
  presence: RoomPresence;
  wsConnected: boolean;
  tikfinityStatus: 'idle' | 'connecting' | 'connected' | 'error';
  tikfinityUrl: string;
  onConnectTikFinity: (url: string) => void;
  onDisconnectTikFinity: () => void;
  onSendExternalEvent: (payload: Record<string, unknown>) => Promise<boolean>;
  onImportProject: (project: StudioProject) => Promise<void>;
  onNotify: (msg: string, tone?: 'emerald' | 'amber' | 'rose' | 'indigo') => void;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const ConnectPublishView: React.FC<ConnectPublishViewProps> = ({
  project,
  roomId,
  presence,
  wsConnected,
  tikfinityStatus,
  tikfinityUrl,
  onConnectTikFinity,
  onDisconnectTikFinity,
  onSendExternalEvent,
  onImportProject,
  onNotify,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [bridgeInput, setBridgeInput] = useState(tikfinityUrl);
  const [testUser, setTestUser] = useState('Chị Bảo Trâm');
  const [testMessage, setTestMessage] = useState('Mã 01 serum B5 da dầu nhạy cảm có dùng được không, giá bao nhiêu shop?');
  const [deferredInstall, setDeferredInstall] = useState<BeforeInstallPromptEvent | null>(null);
  const [showFolderTree, setShowFolderTree] = useState(true);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const outputUrl = `${origin}/?view=output&room=${encodeURIComponent(roomId)}`;
  const outputWithCamUrl = `${origin}/?view=output&room=${encodeURIComponent(roomId)}&cam=1`;
  const teleprompterUrl = `${origin}/?view=teleprompter&room=${encodeURIComponent(roomId)}`;
  const webhookUrl = `${origin}/api/rooms/${encodeURIComponent(roomId)}/events`;

  const packageFiles = useMemo(
    () =>
      buildDesktopPackageFiles({
        project,
        roomId,
        serverOrigin: origin || 'http://localhost:3000',
        tikfinityUrl: bridgeInput || tikfinityUrl,
      }),
    [project, roomId, origin, bridgeInput, tikfinityUrl]
  );

  useEffect(() => {
    QRCode.toDataURL(teleprompterUrl, {
      width: 220,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [teleprompterUrl]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredInstall(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const copyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedKey(key);
    onNotify('Đã sao chép đường dẫn vào bộ nhớ tạm', 'emerald');
    window.setTimeout(() => setCopiedKey(null), 2000);
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadFullPackageZip = () => {
    const pkg = buildDesktopPackageZip({
      project,
      roomId,
      serverOrigin: origin || 'http://localhost:3000',
      tikfinityUrl: bridgeInput || tikfinityUrl,
    });
    const blob = new Blob([pkg.bytes as BlobPart], { type: 'application/zip' });
    triggerBlobDownload(blob, pkg.filename);
    onNotify(
      `Đã tải trọn bộ thư mục đóng gói (${pkg.files.length} file)! Giải nén rồi bấm đúp "1_CAI_DAT_VA_TAO_ICON_DESKTOP.bat".`,
      'emerald'
    );
  };

  const handleDownloadSingleFile = (file: PackageFileDescriptor) => {
    const blob = new Blob([file.content], { type: file.mimeType });
    const baseName = file.relativePath.split('/').pop() || file.relativePath;
    triggerBlobDownload(blob, baseName);
    onNotify(`Đã tải tệp ${baseName}`, 'indigo');
  };

  const handleExportStandaloneHtml = () => {
    const html = generateStandaloneLiveHtml(project);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    triggerBlobDownload(blob, `PocketLive-Player-${new Date().toISOString().slice(0, 10)}.html`);
    onNotify('Đã xuất App Live Offline (.html)! Nhân viên chỉ cần bấm đúp để chạy siêu nhẹ.', 'emerald');
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    triggerBlobDownload(blob, `pocketlive-project-${new Date().toISOString().slice(0, 10)}.json`);
    onNotify('Đã xuất file dự án .JSON!', 'emerald');
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || '')) as StudioProject;
        if (!parsed || !Array.isArray(parsed.scenes) || !Array.isArray(parsed.products)) {
          throw new Error('Invalid');
        }
        await onImportProject(parsed);
        onNotify(`Đã nạp dự án "${parsed.name}" (${parsed.scenes.length} Scene, ${parsed.products.length} SP)!`, 'emerald');
      } catch {
        onNotify('File .JSON không hợp lệ hoặc sai định dạng.', 'rose');
      }
    };
    reader.readAsText(file);
  };

  const handleInstallPwa = async () => {
    if (deferredInstall) {
      await deferredInstall.prompt();
      setDeferredInstall(null);
    } else {
      onNotify('Trên Chrome/Edge: bấm biểu tượng "Cài đặt ứng dụng" ở thanh địa chỉ góc phải để tạo icon trên màn hình máy tính.', 'indigo');
    }
  };

  const handleSendTest = async (type: 'comment' | 'order' | 'gift') => {
    const payload =
      type === 'comment'
        ? { type: 'comment', user: testUser || 'Khách Live', message: testMessage, platform: 'tiktok' }
        : type === 'order'
          ? { type: 'order', user: testUser || 'Khách Live', message: 'Chốt đơn mã 01 trên TikTok Live!', platform: 'tiktok' }
          : { type: 'gift', user: testUser || 'Khách Live', giftName: 'Hoa Hồng TikTok', platform: 'tiktok' };

    const ok = await onSendExternalEvent(payload);
    if (ok) {
      onNotify('Đã bắn tín hiệu thật qua server tới Màn hình Đọc Comment & Stage 9:16!', 'emerald');
    }
  };

  const renderCategoryIcon = (category: PackageFileDescriptor['category']) => {
    if (category === 'installer') return <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    if (category === 'guide') return <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    if (category === 'app') return <FileCode2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
    return <FileJson className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0b0e14] p-4 lg:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top summary strip */}
        <div className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <h1 className="font-display text-xl font-bold text-white">
              Kết nối TikTok LIVE Studio, Đóng gói Bộ Cài Máy Tính & Màn hình Comment ĐT
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Phòng đồng bộ thời gian thực: <span className="font-mono-num font-bold text-indigo-300">{roomId}</span> · Trạng thái máy chủ:{' '}
              <span className={wsConnected ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                {wsConnected ? 'Đã kết nối WebSocket' : 'Đang kết nối lại...'}
              </span>{' '}
              · Thiết bị đang mở: <span className="font-mono-num text-zinc-200">{presence.total}</span> ({presence.output} OBS/TikTok, {presence.teleprompter} ĐT Host)
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadFullPackageZip}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-950/50 cursor-pointer whitespace-nowrap"
          >
            <FolderArchive className="w-4 h-4" />
            <span>Tải trọn bộ thư mục đóng gói (.ZIP)</span>
          </button>
        </div>

        {/* =====================================================================
            FEATURED SECTION: COMPLETE DESKTOP INSTALLER PACKAGE + TIKTOK LIVE STUDIO QUICK CONNECT
            ===================================================================== */}
        <section className="bg-[#11151e] border border-emerald-500/30 rounded-2xl p-5 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1 max-w-2xl">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 rounded-md px-2 py-0.5">
                <FolderArchive className="w-3.5 h-3.5" />
                <span>TRỌN BỘ CÀI ĐẶT MÁY TÍNH WINDOWS / MACOS ({packageFiles.length} FILE)</span>
              </div>
              <h2 className="font-display text-base font-bold text-white pt-1">
                Thư mục đóng gói đầy đủ &amp; Kết nối siêu nhanh cho TikTok LIVE Studio
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Tải về 1 file <strong>.ZIP</strong> duy nhất chứa sẵn bộ cài tạo Icon ngoài Desktop, nút chạy bảng Điều khiển Live, cửa sổ Output có Camera, máy chủ Offline không cần mạng, toàn bộ kịch bản vừa thiết kế và tài liệu hướng dẫn TikTok LIVE Studio trực quan có nút Copy 1 chạm.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadFullPackageZip}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Tải thư mục {PACKAGE_ROOT_FOLDER}.zip</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const guide = packageFiles.find((f) => f.relativePath === 'HUONG_DAN_TIKTOK_LIVE_STUDIO.html');
                  if (guide) handleDownloadSingleFile(guide);
                }}
                className="px-3.5 py-2.5 rounded-xl bg-[#1b2230] hover:bg-[#252e40] border border-white/10 text-xs font-semibold text-zinc-100 flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-sky-400" />
                <span>Tải riêng Hướng dẫn (.HTML)</span>
              </button>
            </div>
          </div>

          {/* 3-Step TikTok LIVE Studio Quick Setup Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-[#0d1017] border border-white/10 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-emerald-600 text-white text-[11px] font-extrabold flex items-center justify-center shrink-0">
                  1
                </span>
                <span className="text-xs font-bold text-white">Giải nén &amp; Bấm đúp file Cài đặt</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Chạy <code className="text-emerald-300 font-mono-num">1_CAI_DAT_VA_TAO_ICON_DESKTOP.bat</code> để tự tạo 3 biểu tượng ngoài màn hình máy tính và tự copy sẵn Link 1080×1920 vào Clipboard.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0d1017] border border-white/10 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-indigo-600 text-white text-[11px] font-extrabold flex items-center justify-center shrink-0">
                  2
                </span>
                <span className="text-xs font-bold text-white">Dán 1 chạm vào TikTok LIVE Studio</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Trong TikTok LIVE Studio → <strong>+ Thêm nguồn → Liên kết (Link)</strong> → bấm <kbd className="px-1 py-0.5 rounded bg-white/10 text-zinc-200 font-mono-num">Ctrl+V</kbd> → nhập kích thước <span className="font-mono-num text-indigo-300 font-bold">1080 × 1920</span>, đặt nằm trên lớp Camera.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0d1017] border border-white/10 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-sky-600 text-white text-[11px] font-extrabold flex items-center justify-center shrink-0">
                  3
                </span>
                <span className="text-xs font-bold text-white">Bấm Live mượt — Hỗ trợ cả Offline</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Nhân viên chỉ cần bấm icon <strong>PocketLive - Điều Khiển Live</strong> để nhảy sản phẩm (phím 1–9). Nếu mạng yếu, chạy file số 4 để chạy <strong>Offline 100%</strong> qua <span className="font-mono-num text-sky-300">localhost:3456</span>.
              </p>
            </div>
          </div>

          {/* Interactive Folder Tree Preview */}
          <div className="rounded-xl bg-[#0b0e14] border border-white/10 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowFolderTree((v) => !v)}
              aria-expanded={showFolderTree}
              className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-bold text-zinc-200 hover:bg-white/5 cursor-pointer"
            >
              <span className="flex items-center gap-2 font-mono-num">
                <FolderArchive className="w-4 h-4 text-emerald-400" />
                {PACKAGE_ROOT_FOLDER}/ ({packageFiles.length} tệp sẵn sàng đóng gói)
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 font-sans">
                {showFolderTree ? 'Thu gọn' : 'Xem chi tiết các file'}
                {showFolderTree ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </span>
            </button>

            {showFolderTree && (
              <div className="border-t border-white/10 divide-y divide-white/5">
                {packageFiles.map((file) => (
                  <div
                    key={file.relativePath}
                    className="px-4 py-2 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-white/[0.02]"
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className="mt-0.5">{renderCategoryIcon(file.category)}</div>
                      <div className="min-w-0">
                        <div className="text-xs font-mono-num font-semibold text-zinc-100 truncate">
                          {file.relativePath}
                        </div>
                        <div className="text-[11px] text-zinc-400 leading-snug">
                          {file.description}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadSingleFile(file)}
                      aria-label={`Tải tệp ${file.relativePath}`}
                      className="px-2.5 py-1 rounded-lg bg-[#161c28] hover:bg-[#222b3d] border border-white/10 text-[11px] font-semibold text-zinc-200 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>Tải lẻ</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 1. OBS / TIKTOK LIVE STUDIO BROWSER SOURCE */}
          <section className="bg-[#11151e] border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-bold text-white flex items-center gap-2">
                  <Tv className="w-4 h-4 text-indigo-400" />
                  1. Đưa Overlay vào TikTok LIVE Studio / OBS / Prism
                </h2>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Dán đường dẫn bên dưới vào nguồn <strong>Link / Browser Source</strong> (kích thước <span className="font-mono-num">1080 × 1920</span>). Chọn nền <strong>Trong Suốt OBS</strong> ở Studio để lớp Overlay đè trực tiếp lên camera thật không cần tách phông.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="obs-url-input" className="block text-[11px] font-semibold text-zinc-400">
                Đường dẫn Output 9:16 sạch (không thanh công cụ)
              </label>
              <div className="flex gap-2">
                <input
                  id="obs-url-input"
                  type="text"
                  readOnly
                  value={outputUrl}
                  className="flex-1 bg-[#0b0e14] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono-num text-zinc-200"
                />
                <button
                  type="button"
                  onClick={() => copyText('obs', outputUrl)}
                  className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {copiedKey === 'obs' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'obs' ? 'Đã chép' : 'Sao chép'}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={outputWithCamUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Mở Output rời (Có Camera)</span>
              </a>
              <a
                href={outputUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 rounded-lg bg-[#1b2230] hover:bg-[#252e40] border border-white/10 text-xs font-semibold text-white inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Mở Output chỉ Overlay (OBS)</span>
              </a>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Lưu ý: Trình duyệt không truyền luồng webcam giữa 2 tab nên cửa sổ Output rời sẽ tự nhận Camera trực tiếp (và tự tắt cam bên tab Điều khiển để tránh trùng thiết bị). Di chuột góc phải cửa sổ Output để bật/đổi Camera.
            </p>
          </section>

          {/* 2. MÀN HÌNH ĐỌC COMMENT TỰ ĐỘNG CHO ĐIỆN THOẠI HOST */}
          <section className="bg-[#11151e] border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5 flex-1 min-w-0">
                <h2 className="font-display text-sm font-bold text-white flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  2. Màn hình Đọc Comment Phóng To (Điện thoại / iPad)
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Đặt điện thoại hoặc máy tính bảng cạnh chân máy quay, quét mã QR để mở màn hình phóng to bình luận, tự động đọc giọng nói tiếng Việt và lọc riêng câu hỏi chốt đơn / hỏi giá cho Host dễ tư vấn.
                </p>

                <div className="flex gap-2 pt-2">
                  <input
                    type="text"
                    readOnly
                    aria-label="Link màn hình đọc comment điện thoại"
                    value={teleprompterUrl}
                    className="flex-1 min-w-0 bg-[#0b0e14] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono-num text-zinc-200"
                  />
                  <button
                    type="button"
                    onClick={() => copyText('tele', teleprompterUrl)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#1b2230] hover:bg-[#252e40] border border-white/10 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
                  >
                    {copiedKey === 'tele' ? 'Đã chép' : 'Chép link'}
                  </button>
                </div>

                <div className="pt-1">
                  <a
                    href={teleprompterUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Mở Màn hình Đọc Comment ngay</span>
                  </a>
                </div>
              </div>

              <div className="w-[124px] h-[124px] rounded-xl bg-white p-1.5 shrink-0 flex items-center justify-center border border-white/20">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Mã QR mở màn hình đọc comment điện thoại" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-[10px] text-zinc-600">Đang tạo QR...</span>
                )}
              </div>
            </div>
          </section>

          {/* 3. KẾT NỐI COMMENT TIKTOK LIVE (TIKFINITY BRIDGE + WEBHOOK API) */}
          <section className="bg-[#11151e] border border-white/10 rounded-2xl p-5 space-y-4">
            <div>
              <h2 className="font-display text-sm font-bold text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-rose-400" />
                3. Kết nối Comment & Quà tặng từ TikTok LIVE / App ngoài
              </h2>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Nhận bình luận thời gian thực từ <strong>TikFinity Desktop</strong> (WebSocket cục bộ) hoặc từ Webhook (Shopee / Facebook / n8n / Bot tự động) và đẩy thẳng lên màn hình điện thoại Host.
              </p>
            </div>

            {/* TikFinity Bridge */}
            <div className="p-3 rounded-xl bg-[#0d1017] border border-white/10 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-200 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-indigo-400" />
                  Cầu nối TikFinity WebSocket (TikTok LIVE)
                </span>
                <span
                  className={`text-[11px] font-semibold ${
                    tikfinityStatus === 'connected'
                      ? 'text-emerald-400'
                      : tikfinityStatus === 'error'
                        ? 'text-rose-400'
                        : 'text-zinc-400'
                  }`}
                >
                  {tikfinityStatus === 'connected'
                    ? 'Đang nhận tín hiệu TikTok'
                    : tikfinityStatus === 'connecting'
                      ? 'Đang kết nối...'
                      : tikfinityStatus === 'error'
                        ? 'Không thấy TikFinity chạy trên máy'
                        : 'Chưa kết nối'}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  aria-label="Địa chỉ WebSocket TikFinity"
                  value={bridgeInput}
                  onChange={(e) => setBridgeInput(e.target.value)}
                  className="flex-1 bg-[#161c28] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono-num text-white"
                />
                {tikfinityStatus === 'connected' ? (
                  <button
                    type="button"
                    onClick={onDisconnectTikFinity}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    Ngắt kết nối
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onConnectTikFinity(bridgeInput)}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    Kết nối TikFinity
                  </button>
                )}
              </div>
            </div>

            {/* Universal Webhook + Live Test */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-400">
                  Webhook POST nhận comment từ app ngoài
                </span>
                <button
                  type="button"
                  onClick={() => copyText('webhook', webhookUrl)}
                  className="text-[11px] font-semibold text-indigo-300 hover:underline cursor-pointer"
                >
                  {copiedKey === 'webhook' ? 'Đã chép URL' : 'Sao chép Webhook URL'}
                </button>
              </div>
              <div className="bg-[#0b0e14] border border-white/10 rounded-lg px-3 py-2 text-[11px] font-mono-num text-zinc-300 truncate">
                POST {webhookUrl}
              </div>

              <div className="pt-2 space-y-2">
                <div className="text-[11px] font-semibold text-zinc-300">
                  Bắn thử tín hiệu thật vào hệ thống (kiểm tra Teleprompter & Stage)
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <input
                    type="text"
                    value={testUser}
                    onChange={(e) => setTestUser(e.target.value)}
                    placeholder="Tên khách"
                    className="bg-[#0b0e14] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    placeholder="Nội dung bình luận..."
                    className="col-span-2 bg-[#0b0e14] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSendTest('comment')}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Gửi thử Comment</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendTest('order')}
                    className="px-3 py-1.5 rounded-lg bg-[#1b2230] hover:bg-[#252e40] border border-white/10 text-xs font-semibold text-orange-200 cursor-pointer"
                  >
                    Thử Nổ đơn
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendTest('gift')}
                    className="px-3 py-1.5 rounded-lg bg-[#1b2230] hover:bg-[#252e40] border border-white/10 text-xs font-semibold text-amber-200 cursor-pointer"
                  >
                    Thử Tặng quà
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 4. XUẤT APP CHẠY RIÊNG & GIẢM TẢI HỆ THỐNG */}
          <section className="bg-[#11151e] border border-white/10 rounded-2xl p-5 space-y-4">
            <div>
              <h2 className="font-display text-sm font-bold text-white flex items-center gap-2">
                <Laptop className="w-4 h-4 text-amber-400" />
                4. Đóng gói App Chạy Riêng & Giảm tải CPU/RAM cho nhân viên
              </h2>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Tách riêng <strong>Thiết kế Canva (Admin)</strong> với <strong>Điều khiển Live</strong> giúp giảm tải rõ rệt vì toàn bộ thanh kéo thả, thước căn lề và trình sửa ảnh được gỡ bỏ hoàn toàn khi lên sóng. Bạn còn có thể xuất thành <strong>1 file App Offline duy nhất</strong> để cài/chạy trực tiếp trên máy tính nhân viên.
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleExportStandaloneHtml}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Xuất File App Live Offline (.html) — Bấm đúp chạy ngay</span>
              </button>

              <button
                type="button"
                onClick={handleInstallPwa}
                className="w-full py-2.5 px-4 rounded-xl bg-[#1b2230] hover:bg-[#252e40] border border-white/10 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Laptop className="w-4 h-4 text-emerald-400" />
                <span>Cài đặt biểu tượng App lên máy tính (Desktop PWA)</span>
              </button>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="py-2 px-3 rounded-xl bg-[#0d1017] hover:bg-[#161c28] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FileJson className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Xuất kịch bản .JSON</span>
                </button>
                <label className="py-2 px-3 rounded-xl bg-[#0d1017] hover:bg-[#161c28] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center justify-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Nạp kịch bản .JSON</span>
                  <input type="file" accept=".json,application/json" onChange={handleImportJson} className="hidden" />
                </label>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
