import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Cpu,
  ExternalLink,
  EyeOff,
  Flame,
  Gift,
  Heart,
  Maximize,
  MessageSquare,
  Pin,
  RotateCcw,
  Send,
  Shield,
  Smartphone,
  Sparkles,
  Tv,
  Zap,
} from 'lucide-react';
import type {
  LiveAlert,
  LiveAlertType,
  LiveComment,
  LiveRuntimeState,
  RoomPresence,
  StudioProject,
} from '../types/studio';
import { STAGE_H, STAGE_W } from '../utils/canvasMath';
import { calcDiscountPercent, formatMMSS, formatVND } from '../utils/format';
import { StageRenderer } from './StageRenderer';
import { ProductVisual } from './ProductVisual';

interface LiveOperatorProps {
  project: StudioProject;
  live: LiveRuntimeState;
  comments: LiveComment[];
  presence: RoomPresence;
  roomId: string;
  cameraStream: MediaStream | null;
  cameraDevices: Array<{ deviceId: string; label: string }>;
  selectedCameraId: string;
  cameraMirrored: boolean;
  onToggleCamera: () => void;
  onSelectCamera: (deviceId: string) => void;
  onToggleMirror: () => void;
  onPatchLive: (patch: Partial<LiveRuntimeState>) => void;
  onTriggerAlert: (alert: LiveAlert) => void;
  onPinComment: (commentId: string | null, showOnStage?: boolean) => void;
  onToggleAnswered: (commentId: string) => void;
  onSendComment: (payload: Record<string, unknown>) => Promise<boolean>;
  onOpenConnectTab: () => void;
  onNotify: (msg: string, tone?: 'emerald' | 'amber' | 'rose' | 'indigo') => void;
}

const SAMPLE_BUYERS = ['Chị Linh', 'Ngọc Hân', 'Minh Thư', 'Bảo Trâm', 'Thanh Hà', 'Hoàng Anh'];

export const LiveOperator: React.FC<LiveOperatorProps> = ({
  project,
  live,
  comments,
  presence,
  roomId,
  cameraStream,
  cameraDevices,
  selectedCameraId,
  cameraMirrored,
  onToggleCamera,
  onSelectCamera,
  onToggleMirror,
  onPatchLive,
  onTriggerAlert,
  onPinComment,
  onToggleAnswered,
  onSendComment,
  onOpenConnectTab,
  onNotify,
}) => {
  const [cleanView, setCleanView] = useState(false);
  const [pausePreview, setPausePreview] = useState(false);
  const [buyerInput, setBuyerInput] = useState('');
  const [quickCommentUser, setQuickCommentUser] = useState('');
  const [quickCommentText, setQuickCommentText] = useState('');
  const [stageScale, setStageScale] = useState(0.95);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);

  const activeScene = useMemo(
    () => project.scenes.find((s) => s.id === live.activeSceneId) || project.scenes[0],
    [live.activeSceneId, project.scenes]
  );

  const pinnedComment = useMemo(
    () => comments.find((c) => c.id === live.pinnedCommentId) || null,
    [comments, live.pinnedCommentId]
  );

  // Responsive fit for 9:16 stage preview without CSS layout thrashing
  useEffect(() => {
    const el = stageContainerRef.current;
    if (!el) return;
    const recalc = () => {
      const availW = Math.max(200, el.clientWidth - 20);
      const availH = Math.max(320, el.clientHeight - 20);
      const next = Math.min(availW / STAGE_W, availH / STAGE_H, 1.35);
      setStageScale(Math.max(0.45, Number(next.toFixed(3))));
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cleanView, pausePreview]);

  // Flash sale 1s countdown driver (runs only when flashRunning === true)
  useEffect(() => {
    if (!live.flashRunning) return;
    const id = window.setInterval(() => {
      if (live.flashLeft <= 1) {
        onPatchLive({ flashLeft: 0, flashRunning: false });
        onTriggerAlert({
          id: `alert-flash-end-${Date.now()}`,
          type: 'fireworks',
          title: 'Hết giờ Flash Sale!',
          subtitle: 'Cảm ơn cả nhà đã săn deal siêu tốc',
          timestamp: Date.now(),
        });
      } else {
        onPatchLive({ flashLeft: live.flashLeft - 1 });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [live.flashRunning, live.flashLeft, onPatchLive, onTriggerAlert]);

  // Auto-clear active alert after 3.8s
  useEffect(() => {
    if (!live.activeAlert) return;
    const t = window.setTimeout(() => {
      onPatchLive({ activeAlert: null });
    }, 3800);
    return () => clearTimeout(t);
  }, [live.activeAlert, onPatchLive]);

  // Operator hotkeys: 1-9 product, 0 hide, H pulse price, F flash, S safe zone, ESC exit clean view
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && cleanView) {
        setCleanView(false);
        return;
      }
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key >= '1' && e.key <= '9') {
        const prod = project.products[Number(e.key) - 1];
        if (prod) {
          onPatchLive({
            activeProductId: live.activeProductId === prod.id ? null : prod.id,
          });
        }
      } else if (e.key === '0') {
        onPatchLive({ activeProductId: null });
      } else if (e.key.toLowerCase() === 'h') {
        onPatchLive({ pricePulseAt: Date.now() });
      } else if (e.key.toLowerCase() === 'f') {
        toggleFlashSale();
      } else if (e.key.toLowerCase() === 's') {
        onPatchLive({ showSafeZone: !live.showSafeZone });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toggleFlashSale = () => {
    if (live.flashRunning) {
      onPatchLive({ flashRunning: false });
    } else {
      onPatchLive({
        flashActive: true,
        flashRunning: true,
        flashLeft: live.flashLeft <= 0 ? live.flashTotal : live.flashLeft,
      });
    }
  };

  const fireLiveEvent = (type: LiveAlertType) => {
    const sender =
      buyerInput.trim() || SAMPLE_BUYERS[Math.floor(Math.random() * SAMPLE_BUYERS.length)];
    const defs: Record<LiveAlertType, { title: string; subtitle: string }> = {
      order: { title: `${sender} vừa chốt đơn thành công!`, subtitle: 'Cảm ơn đã ủng hộ phiên Live hôm nay' },
      gift: { title: `${sender} vừa tặng Quà VIP!`, subtitle: 'Cảm ơn tình cảm siêu dễ thương trên Live' },
      hearts: { title: 'Đạt mốc tim mới trên Live!', subtitle: 'Tiếp tục thả tim mở khóa thêm ưu đãi' },
      flash: { title: 'Mở khóa Flash Sale giới hạn!', subtitle: 'Chốt ngay trước khi đồng hồ về 00:00' },
      lixi: { title: 'Tung lì xì & Voucher độc quyền!', subtitle: 'Bấm giỏ hàng để áp mã giảm giá ngay' },
      fireworks: { title: `Chúc mừng mốc mới cùng ${sender}!`, subtitle: 'Cảm ơn cả nhà đã đồng hành cùng Shop' },
    };
    if (type === 'flash' && !live.flashActive) {
      toggleFlashSale();
    }
    onTriggerAlert({
      id: `evt-${Date.now()}`,
      type,
      title: defs[type].title,
      subtitle: defs[type].subtitle,
      timestamp: Date.now(),
    });
  };

  const handleQuickSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCommentText.trim()) return;
    const ok = await onSendComment({
      type: 'comment',
      user: quickCommentUser.trim() || 'Khách TikTok',
      message: quickCommentText.trim(),
      platform: 'tiktok',
    });
    if (ok) {
      setQuickCommentText('');
      onNotify('Đã gửi comment tới màn hình Đọc Comment trên điện thoại!', 'emerald');
    }
  };

  const openDedicatedView = (view: 'output' | 'teleprompter') => {
    const url = `${window.location.origin}/?view=${view}&room=${encodeURIComponent(roomId)}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    onNotify(
      view === 'output'
        ? 'Đã sao chép link Output 9:16 cho OBS / TikTok LIVE Studio!'
        : 'Đã sao chép link Màn hình Đọc Comment cho điện thoại!',
      'indigo'
    );
  };

  if (cleanView) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
        <button
          type="button"
          onClick={() => setCleanView(false)}
          className="fixed top-4 right-4 z-[110] px-4 py-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/15 text-xs font-semibold opacity-25 hover:opacity-100 transition cursor-pointer"
        >
          Thoát Clean View (ESC)
        </button>
        <div
          ref={stageContainerRef}
          className="w-full h-full flex items-center justify-center"
        >
          <div style={{ transform: `scale(${stageScale})`, transformOrigin: 'center center' }}>
            <StageRenderer
              scene={activeScene}
              products={project.products}
              live={live}
              pinnedComment={pinnedComment}
              cameraStream={cameraStream}
              cameraMirrored={cameraMirrored}
              showHostPlaceholder={false}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden bg-[#0b0e14]">
      {/* =====================================================================
          LEFT COLUMN: LIGHTWEIGHT LIVE PREVIEW STAGE
          ===================================================================== */}
      <section className="flex-1 flex flex-col min-w-0 min-h-0 p-3 gap-2.5 bg-[#0d111a]">
        {/* Camera & Performance Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#11151e] border border-white/10 rounded-xl px-3 py-2 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={onToggleCamera}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                cameraStream
                  ? 'bg-rose-500/20 border-rose-400/40 text-rose-200'
                  : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{cameraStream ? 'Tắt Camera' : 'Bật Camera UVC'}</span>
            </button>

            <select
              aria-label="Chọn nguồn Camera UVC"
              value={selectedCameraId}
              onChange={(e) => onSelectCamera(e.target.value)}
              className="bg-[#0b0e14] text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 border border-white/10 max-w-[160px] truncate cursor-pointer"
            >
              {cameraDevices.length === 0 ? (
                <option value="">Nguồn Camera UVC...</option>
              ) : (
                cameraDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))
              )}
            </select>

            <button
              type="button"
              onClick={onToggleMirror}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer whitespace-nowrap ${
                cameraMirrored
                  ? 'bg-indigo-600/25 border-indigo-400/50 text-indigo-200'
                  : 'bg-[#181f2c] border-white/10 text-zinc-300'
              }`}
            >
              Lật gương
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => onPatchLive({ performanceMode: !live.performanceMode })}
              title="Tắt blur nặng & hạt nền để tối ưu GPU/CPU cho máy yếu"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                live.performanceMode
                  ? 'bg-emerald-600/25 border-emerald-400/60 text-emerald-200'
                  : 'bg-[#181f2c] border-white/10 text-zinc-300'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>{live.performanceMode ? 'Siêu mượt: BẬT' : 'Tối ưu GPU'}</span>
            </button>

            <button
              type="button"
              onClick={() => setPausePreview((p) => !p)}
              title="Tạm dừng khung xem trước ở máy điều khiển để nhường 100% GPU cho OBS/TikTok Output"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                pausePreview
                  ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                  : 'bg-[#181f2c] border-white/10 text-zinc-300'
              }`}
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>{pausePreview ? 'Đang ẩn Preview' : 'Ẩn Preview'}</span>
            </button>

            <button
              type="button"
              onClick={() => onPatchLive({ showSafeZone: !live.showSafeZone })}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                live.showSafeZone
                  ? 'bg-sky-500/25 border-sky-400/50 text-sky-200'
                  : 'bg-[#181f2c] border-white/10 text-zinc-300'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Safe [S]</span>
            </button>

            <button
              type="button"
              onClick={() => setCleanView(true)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Maximize className="w-3.5 h-3.5" />
              <span>Clean View</span>
            </button>
          </div>
        </div>

        {/* 9:16 Live Stage Viewport */}
        <div
          ref={stageContainerRef}
          className="flex-1 min-h-0 flex items-center justify-center overflow-hidden"
        >
          {pausePreview ? (
            <div className="max-w-sm text-center p-6 rounded-2xl bg-[#11151e] border border-white/10 space-y-2.5">
              <Cpu className="w-8 h-8 text-emerald-400 mx-auto" />
              <div className="text-sm font-bold text-white">
                Đã tạm ẩn Preview để tiết kiệm tài nguyên
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Cửa sổ Output 9:16 trên OBS / TikTok LIVE Studio và điện thoại đọc Comment vẫn đang chạy đồng bộ thời gian thực.
              </p>
              <button
                type="button"
                onClick={() => setPausePreview(false)}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
              >
                Hiện lại Preview
              </button>
            </div>
          ) : (
            <div
              className="rounded-[26px] overflow-hidden border-2 border-white/15 shadow-[0_24px_75px_rgba(0,0,0,0.75)]"
              style={{
                width: `${STAGE_W}px`,
                height: `${STAGE_H}px`,
                transform: `scale(${stageScale})`,
                transformOrigin: 'center center',
              }}
            >
              <StageRenderer
                scene={activeScene}
                products={project.products}
                live={live}
                pinnedComment={pinnedComment}
                cameraStream={cameraStream}
                cameraMirrored={cameraMirrored}
                onSelectProduct={(prodId) =>
                  onPatchLive({
                    activeProductId: live.activeProductId === prodId ? null : prodId,
                  })
                }
              />
            </div>
          )}
        </div>
      </section>

      {/* =====================================================================
          RIGHT COLUMN: FAST 1-CLICK LIVE OPERATOR DESK + COMMENT TELEPROMPTER FEED
          ===================================================================== */}
      <aside className="w-full lg:w-[440px] xl:w-[480px] bg-[#11151e] border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col shrink-0 max-h-[52vh] lg:max-h-none">
        {/* Connected devices strip */}
        <div className="px-4 py-2.5 border-b border-white/10 bg-[#0d1017] flex items-center justify-between gap-2 text-xs shrink-0">
          <div className="text-zinc-400 truncate">
            Phòng Live <span className="font-mono-num font-bold text-zinc-200">{roomId}</span> ·{' '}
            <span className="font-mono-num text-emerald-400">{presence.output} OBS</span> ·{' '}
            <span className="font-mono-num text-indigo-300">{presence.teleprompter} ĐT Host</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={`/?view=output&room=${encodeURIComponent(roomId)}&cam=1`}
              target="_blank"
              rel="noreferrer"
              className="px-2 py-1 rounded-md bg-emerald-600/85 hover:bg-emerald-500 text-[11px] font-semibold text-white flex items-center gap-1 whitespace-nowrap"
            >
              <Camera className="w-3 h-3" />
              <span>Output + Cam</span>
            </a>
            <button
              type="button"
              onClick={() => openDedicatedView('output')}
              className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 text-[11px] font-semibold text-zinc-200 flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Tv className="w-3 h-3" />
              <span>Copy Link</span>
            </button>
            <button
              type="button"
              onClick={onOpenConnectTab}
              className="px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-[11px] font-semibold text-white flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Smartphone className="w-3 h-3" />
              <span>Gói Cài / QR</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
          {/* 1. CHUYỂN SCENE ĐÃ LƯU */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-zinc-100">1. Scene đã lưu từ Studio</h2>
              <span className="text-[11px] text-zinc-400">{project.scenes.length} bố cục</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {project.scenes.map((sc) => {
                const active = sc.id === activeScene.id;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => onPatchLive({ activeSceneId: sc.id })}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                      active
                        ? 'bg-indigo-600/20 border-indigo-400 text-white'
                        : 'bg-[#161c28] border-white/10 text-zinc-300 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: sc.accentColor }}
                      />
                      <span className="text-xs font-bold truncate">{sc.name}</span>
                    </div>
                    <div className="text-[10.5px] text-zinc-400 mt-0.5 truncate">{sc.tag}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. CHUYỂN SẢN PHẨM 1-9 */}
          <section className="space-y-2 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold text-zinc-100">2. Chuyển sản phẩm (Phím 1–9)</h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onPatchLive({ pricePulseAt: Date.now() })}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/35 text-[11px] font-bold text-amber-200 cursor-pointer"
                >
                  Nhấn giá [H]
                </button>
                <button
                  type="button"
                  onClick={() => onPatchLive({ activeProductId: null })}
                  className="px-2.5 py-1 rounded-lg bg-[#1b2230] hover:bg-[#252e40] border border-white/10 text-[11px] font-semibold text-zinc-300 cursor-pointer"
                >
                  Ẩn [0]
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              {project.products.map((prod, idx) => {
                const active = prod.id === live.activeProductId;
                const disc = calcDiscountPercent(prod.originalPrice, prod.livePrice);
                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() =>
                      onPatchLive({ activeProductId: active ? null : prod.id })
                    }
                    className={`w-full flex items-center gap-2.5 p-2 rounded-xl border text-left transition cursor-pointer ${
                      active
                        ? 'bg-indigo-600/20 border-indigo-400/80'
                        : 'bg-[#161c28] hover:bg-[#1c2433] border-white/10'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-white/95 p-1 shrink-0 overflow-hidden">
                      <ProductVisual product={prod} transparent />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-indigo-300">{prod.code}</span>
                        <span className="text-[10.5px] font-mono-num text-zinc-400">
                          {active ? 'Đang lên sóng' : idx < 9 ? `Phím ${idx + 1}` : ''}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-white truncate">{prod.name}</div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs font-mono-num">
                        <span className="font-bold text-white">{formatVND(prod.livePrice)}</span>
                        {disc > 0 && <span className="text-rose-400 font-semibold">-{disc}%</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 3. FLASH SALE & SỰ KIỆN LIVE */}
          <section className="space-y-2.5 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-zinc-100">3. Flash Sale [F] & Sự kiện Live</h2>
              <span className="font-mono-num text-sm font-bold text-rose-400">
                {formatMMSS(live.flashLeft)}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {[60, 180, 300, 600].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => onPatchLive({ flashTotal: sec, flashLeft: sec })}
                  className="py-1.5 rounded-lg bg-[#161c28] hover:bg-[#222b3c] border border-white/10 text-xs font-semibold text-zinc-200 cursor-pointer font-mono-num"
                >
                  {sec / 60} phút
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={toggleFlashSale}
                className={`col-span-2 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                  live.flashRunning
                    ? 'bg-amber-400 hover:bg-amber-300 text-zinc-950'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{live.flashRunning ? 'Tạm dừng Flash Sale' : 'Bật Flash Sale'}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onPatchLive({ flashRunning: false, flashActive: false, flashLeft: live.flashTotal })
                }
                className="py-2 rounded-lg bg-[#1b2230] hover:bg-[#252e40] border border-white/10 text-xs font-semibold text-zinc-300 flex items-center justify-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Đặt lại</span>
              </button>
            </div>

            <input
              type="text"
              value={buyerInput}
              onChange={(e) => setBuyerInput(e.target.value)}
              placeholder="Tên khách chốt đơn / tặng quà (để trống tự chọn mẫu)..."
              className="w-full bg-[#0d1017] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-400"
            />

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => fireLiveEvent('order')}
                className="py-2 px-2 rounded-lg bg-[#161c28] hover:bg-[#222b3c] border border-white/10 text-[11px] font-semibold text-orange-200 flex items-center justify-center gap-1 cursor-pointer"
              >
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <span>Nổ đơn</span>
              </button>
              <button
                type="button"
                onClick={() => fireLiveEvent('gift')}
                className="py-2 px-2 rounded-lg bg-[#161c28] hover:bg-[#222b3c] border border-white/10 text-[11px] font-semibold text-amber-200 flex items-center justify-center gap-1 cursor-pointer"
              >
                <Gift className="w-3.5 h-3.5 text-amber-400" />
                <span>Quà VIP</span>
              </button>
              <button
                type="button"
                onClick={() => fireLiveEvent('hearts')}
                className="py-2 px-2 rounded-lg bg-[#161c28] hover:bg-[#222b3c] border border-white/10 text-[11px] font-semibold text-pink-200 flex items-center justify-center gap-1 cursor-pointer"
              >
                <Heart className="w-3.5 h-3.5 text-pink-400" />
                <span>Bão tim</span>
              </button>
              <button
                type="button"
                onClick={() => fireLiveEvent('flash')}
                className="py-2 px-2 rounded-lg bg-[#161c28] hover:bg-[#222b3c] border border-white/10 text-[11px] font-semibold text-rose-200 flex items-center justify-center gap-1 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-rose-400" />
                <span>Flash</span>
              </button>
              <button
                type="button"
                onClick={() => fireLiveEvent('lixi')}
                className="py-2 px-2 rounded-lg bg-[#161c28] hover:bg-[#222b3c] border border-white/10 text-[11px] font-semibold text-red-200 flex items-center justify-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-red-400" />
                <span>Lì xì</span>
              </button>
              <button
                type="button"
                onClick={() => fireLiveEvent('fireworks')}
                className="py-2 px-2 rounded-lg bg-[#161c28] hover:bg-[#222b3c] border border-white/10 text-[11px] font-semibold text-indigo-200 flex items-center justify-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Pháo hoa</span>
              </button>
            </div>
          </section>

          {/* 4. LUỒNG COMMENT TRỰC TIẾP -> ĐẨY PHÓNG TO LÊN ĐIỆN THOẠI HOST / MÀN LIVE */}
          <section className="space-y-2.5 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                4. Luồng Comment & Đẩy ĐT Host ({comments.length})
              </h2>
              <a
                href={`/?view=teleprompter&room=${encodeURIComponent(roomId)}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-semibold text-indigo-300 hover:underline flex items-center gap-1"
              >
                <span>Mở màn ĐT</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Quick comment push / test input */}
            <form onSubmit={handleQuickSendComment} className="flex gap-1.5">
              <input
                type="text"
                value={quickCommentUser}
                onChange={(e) => setQuickCommentUser(e.target.value)}
                placeholder="Tên khách"
                className="w-24 bg-[#0d1017] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
              />
              <input
                type="text"
                value={quickCommentText}
                onChange={(e) => setQuickCommentText(e.target.value)}
                placeholder="Nhập câu hỏi / comment khách..."
                className="flex-1 bg-[#0d1017] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
              />
              <button
                type="submit"
                aria-label="Gửi comment vào phòng live"
                className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>

            <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-0.5">
              {comments.length === 0 ? (
                <div className="text-center py-4 text-xs text-zinc-500 bg-[#0d1017] rounded-xl border border-white/5">
                  Chưa có bình luận. Kết nối TikTok/TikFinity ở tab Kết nối hoặc nhập thử ở trên.
                </div>
              ) : (
                comments.map((cmt) => {
                  const isPinned = live.pinnedCommentId === cmt.id;
                  return (
                    <div
                      key={cmt.id}
                      className={`p-2.5 rounded-xl border transition ${
                        isPinned
                          ? 'bg-indigo-600/20 border-indigo-400'
                          : cmt.answered
                            ? 'bg-[#0d1017]/60 border-white/5 opacity-60'
                            : 'bg-[#161c28] border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-bold text-white truncate">
                          {cmt.user}{' '}
                          <span className="font-normal text-zinc-400">· {cmt.platform}</span>
                        </span>
                        <span
                          className={`font-semibold shrink-0 ${
                            cmt.priority === 'hot'
                              ? 'text-rose-400'
                              : cmt.priority === 'question'
                                ? 'text-amber-300'
                                : 'text-zinc-500'
                          }`}
                        >
                          {cmt.priority === 'hot'
                            ? 'Chốt đơn'
                            : cmt.priority === 'question'
                              ? 'Cần tư vấn'
                              : 'Bình luận'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-200 mt-1 leading-snug">{cmt.text}</p>
                      <div className="flex items-center gap-1.5 mt-2">
                        <button
                          type="button"
                          onClick={() => onPinComment(isPinned ? null : cmt.id, false)}
                          className={`px-2 py-1 rounded-md text-[10.5px] font-semibold flex items-center gap-1 cursor-pointer ${
                            isPinned && !live.showPinnedOnStage
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white/10 hover:bg-white/15 text-zinc-200'
                          }`}
                        >
                          <Smartphone className="w-3 h-3" />
                          <span>{isPinned ? 'Đang ghim ĐT' : 'Phóng to ĐT'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onPinComment(
                              isPinned && live.showPinnedOnStage ? null : cmt.id,
                              !(isPinned && live.showPinnedOnStage)
                            )
                          }
                          className={`px-2 py-1 rounded-md text-[10.5px] font-semibold flex items-center gap-1 cursor-pointer ${
                            isPinned && live.showPinnedOnStage
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white/10 hover:bg-white/15 text-zinc-200'
                          }`}
                        >
                          <Pin className="w-3 h-3" />
                          <span>Lên màn Live</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleAnswered(cmt.id)}
                          className="ml-auto px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-[10.5px] font-semibold text-zinc-300 flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          <span>{cmt.answered ? 'Đã tư vấn' : 'Xong'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
};
