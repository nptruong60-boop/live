import React, { useEffect, useMemo, useRef } from 'react';
import { Camera, Gift, Flame, Heart, Sparkles, Zap } from 'lucide-react';
import type {
  CanvasElement,
  LiveComment,
  LiveRuntimeState,
  Product,
  Scene,
} from '../types/studio';
import {
  STAGE_H,
  STAGE_W,
  sortElementsByRenderOrder,
  type ResizeHandle,
  type SnapGuide,
} from '../utils/canvasMath';
import { getContrastTextColor, hexToRgb, lightenHex } from '../utils/format';
import { StageElementContent } from './StageElementContent';
import { FxCanvas } from './FxCanvas';

interface StageRendererProps {
  scene: Scene;
  products: Product[];
  live: LiveRuntimeState;
  pinnedComment: LiveComment | null;
  cameraStream?: MediaStream | null;
  cameraMirrored?: boolean;
  showHostPlaceholder?: boolean;
  outputTransparent?: boolean;
  editable?: boolean;
  selectedId?: string | null;
  snapGuides?: SnapGuide[];
  onSelectElement?: (id: string | null) => void;
  onStartDrag?: (e: React.PointerEvent, el: CanvasElement) => void;
  onStartResize?: (e: React.PointerEvent, el: CanvasElement, handle: ResizeHandle) => void;
  onStartRotate?: (e: React.PointerEvent, el: CanvasElement) => void;
  onSelectProduct?: (productId: string) => void;
}

const HANDLES: Array<{ id: ResizeHandle; posClass: string; cursor: string }> = [
  { id: 'nw', posClass: '-top-1.5 -left-1.5', cursor: 'nwse-resize' },
  { id: 'n', posClass: '-top-1.5 left-1/2 -translate-x-1/2', cursor: 'ns-resize' },
  { id: 'ne', posClass: '-top-1.5 -right-1.5', cursor: 'nesw-resize' },
  { id: 'e', posClass: 'top-1/2 -right-1.5 -translate-y-1/2', cursor: 'ew-resize' },
  { id: 'se', posClass: '-bottom-1.5 -right-1.5', cursor: 'nwse-resize' },
  { id: 's', posClass: '-bottom-1.5 left-1/2 -translate-x-1/2', cursor: 'ns-resize' },
  { id: 'sw', posClass: '-bottom-1.5 -left-1.5', cursor: 'nesw-resize' },
  { id: 'w', posClass: 'top-1/2 -left-1.5 -translate-y-1/2', cursor: 'ew-resize' },
];

export const StageRenderer: React.FC<StageRendererProps> = React.memo(
  ({
    scene,
    products,
    live,
    pinnedComment,
    cameraStream = null,
    cameraMirrored = false,
    showHostPlaceholder = true,
    outputTransparent = false,
    editable = false,
    selectedId = null,
    snapGuides = [],
    onSelectElement,
    onStartDrag,
    onStartResize,
    onStartRotate,
    onSelectProduct,
  }) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = cameraStream || null;
    }, [cameraStream]);

    const sortedElements = useMemo(
      () => sortElementsByRenderOrder(scene.elements).filter((el) => el.visible),
      [scene.elements]
    );

    const bgElements = useMemo(
      () => sortedElements.filter((el) => el.layer === 'background'),
      [sortedElements]
    );
    const midElements = useMemo(
      () => sortedElements.filter((el) => el.layer === 'midground'),
      [sortedElements]
    );
    const fgElements = useMemo(
      () => sortedElements.filter((el) => el.layer === 'foreground'),
      [sortedElements]
    );

    const hasExplicitPinnedWidget = useMemo(
      () => scene.elements.some((el) => el.kind === 'pinned-comment' && el.visible),
      [scene.elements]
    );

    const styleVars = useMemo(() => {
      const rgb = hexToRgb(scene.accentColor);
      const accent2 = scene.accentColor2 || lightenHex(scene.accentColor, 34);
      return {
        '--accent': scene.accentColor,
        '--accent-2': accent2,
        '--accent-soft': `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`,
        '--accent-glow': `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.36)`,
        '--accent-contrast': getContrastTextColor(scene.accentColor),
        '--glass-blur': live.performanceMode ? '0px' : `${scene.glassBlur}px`,
        '--glass-opacity': (scene.glassOpacity / 100).toFixed(2),
      } as React.CSSProperties;
    }, [scene.accentColor, scene.accentColor2, scene.glassBlur, scene.glassOpacity, live.performanceMode]);

    const backdropClass = useMemo(() => {
      if (outputTransparent && scene.backdrop === 'transparent') return 'bg-transparent';
      switch (scene.backdrop) {
        case 'soft-gray':
          return 'bg-soft-gray';
        case 'chroma-green':
          return 'bg-chroma-green';
        case 'transparent':
          return 'bg-transparent-grid';
        case 'custom-color':
          return '';
        case 'white-studio':
        default:
          return 'bg-white-studio';
      }
    }, [outputTransparent, scene.backdrop]);

    const renderElementNode = (el: CanvasElement) => {
      const isSelected = editable && selectedId === el.id;
      return (
        <div
          key={el.id}
          data-element-id={el.id}
          onPointerDown={(e) => {
            if (!editable) return;
            e.stopPropagation();
            onSelectElement?.(el.id);
            if (!el.locked) {
              onStartDrag?.(e, el);
            }
          }}
          className={`absolute select-none ${
            editable
              ? el.locked
                ? 'cursor-not-allowed'
                : 'cursor-move hover:outline hover:outline-1 hover:outline-indigo-400/80'
              : ''
          }`}
          style={{
            transform: `translate3d(${el.x}px, ${el.y}px, 0) rotate(${el.rotation || 0}deg)`,
            width: `${el.width}px`,
            height: `${el.height}px`,
            opacity: el.opacity,
            transformOrigin: 'center center',
            willChange: editable ? 'transform' : 'auto',
          }}
        >
          <StageElementContent
            element={el}
            products={products}
            live={live}
            pinnedComment={pinnedComment}
            isEditor={editable}
            onSelectProduct={onSelectProduct}
          />

          {/* Canva selection box + 8 resize handles + rotate handle */}
          {isSelected && (
            <div className="absolute inset-0 pointer-events-none ring-2 ring-indigo-500 rounded-sm z-50">
              <div className="absolute -top-5 left-0 px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-bold whitespace-nowrap shadow">
                {el.layer === 'background'
                  ? 'Nền'
                  : el.layer === 'midground'
                    ? 'Trung cảnh'
                    : 'Tiền cảnh'}{' '}
                · {Math.round(el.width)}×{Math.round(el.height)}
              </div>

              {!el.locked &&
                HANDLES.map((h) => (
                  <div
                    key={h.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onStartResize?.(e, el, h.id);
                    }}
                    className={`pointer-events-auto absolute w-3 h-3 rounded-full bg-white border-2 border-indigo-600 shadow ${h.posClass}`}
                    style={{ cursor: h.cursor }}
                  />
                ))}

              {!el.locked && (
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onStartRotate?.(e, el);
                  }}
                  title="Xoay element"
                  className="pointer-events-auto absolute -bottom-7 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-indigo-600 shadow cursor-grab active:cursor-grabbing flex items-center justify-center"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                </div>
              )}
            </div>
          )}
        </div>
      );
    };

    const renderAlertIcon = (type: string) => {
      switch (type) {
        case 'gift':
          return <Gift className="w-3.5 h-3.5" />;
        case 'hearts':
          return <Heart className="w-3.5 h-3.5" />;
        case 'flash':
          return <Zap className="w-3.5 h-3.5" />;
        case 'order':
          return <Flame className="w-3.5 h-3.5" />;
        default:
          return <Sparkles className="w-3.5 h-3.5" />;
      }
    };

    return (
      <div
        data-testid="live-stage"
        onPointerDown={() => {
          if (editable) onSelectElement?.(null);
        }}
        className={`stage-root relative overflow-hidden ${
          scene.glassFinish === 'dark' ? 'stage-glass-dark' : 'stage-glass-light'
        } ${live.performanceMode ? 'stage-perf-mode' : ''} ${backdropClass}`}
        style={{
          ...styleVars,
          width: `${STAGE_W}px`,
          height: `${STAGE_H}px`,
          backgroundColor:
            scene.backdrop === 'custom-color' ? scene.backdropColor : undefined,
        }}
      >
        {/* DEPTH LAYER 1: NỀN (BACKGROUND) */}
        <div className="absolute inset-0 z-[5]">
          {bgElements.map(renderElementNode)}
        </div>

        {/* DEPTH LAYER 2: TRUNG CẢNH (MIDGROUND - BEHIND HOST) */}
        <div className="absolute inset-0 z-[10] pointer-events-none">
          <div className="relative w-full h-full pointer-events-auto">
            {midElements.map(renderElementNode)}
          </div>
        </div>

        {/* DEPTH LAYER 3: CAMERA / HOST LAYER */}
        <div className="absolute inset-0 z-[15] pointer-events-none">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${cameraStream ? 'block' : 'hidden'}`}
            style={{ transform: cameraMirrored ? 'scaleX(-1)' : 'none' }}
          />
          {!cameraStream && showHostPlaceholder && scene.backdrop !== 'chroma-green' && !outputTransparent && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-12">
              <div className="w-11 h-11 rounded-2xl bg-black/[0.06] border border-black/[0.08] flex items-center justify-center mb-1.5">
                <Camera className="w-4 h-4 text-zinc-500" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Vùng Camera Host
              </span>
              <span className="text-[9px] text-zinc-500/80 mt-0.5">
                Nằm giữa Trung cảnh & Tiền cảnh
              </span>
            </div>
          )}
        </div>

        {/* DEPTH LAYER 4: TIỀN CẢNH (FOREGROUND - ABOVE HOST) */}
        <div className="absolute inset-0 z-[22]">
          {fgElements.map(renderElementNode)}
        </div>

        {/* FLOATING PINNED COMMENT FALLBACK (if staff pushes a comment to stage without adding a custom pinned widget) */}
        {!hasExplicitPinnedWidget && live.showPinnedOnStage && pinnedComment && (
          <div className="absolute bottom-[190px] left-3 right-3 z-[32] pointer-events-none animate-event-pop">
            <div
              className="glass-surface-strong rounded-2xl px-3 py-2 border"
              style={{ borderColor: 'var(--accent)' }}
            >
              <div className="flex items-center justify-between text-[8.5px] font-extrabold uppercase tracking-wider accent-text-adaptive">
                <span className="truncate">Khách hỏi · {pinnedComment.user}</span>
                <span>{pinnedComment.platform}</span>
              </div>
              <div className="font-display text-[11.5px] font-bold leading-snug mt-0.5">
                “{pinnedComment.text}”
              </div>
            </div>
          </div>
        )}

        {/* FLOATING LIVE EVENT ALERT */}
        {live.activeAlert && (
          <div className="absolute top-[134px] inset-x-3 z-[34] flex justify-center pointer-events-none">
            <div
              key={live.activeAlert.id}
              className="animate-event-pop glass-surface-strong rounded-full pl-2 pr-3.5 py-1.5 flex items-center gap-2 max-w-[94%]"
            >
              <span className="w-6 h-6 rounded-full glass-accent-pill flex items-center justify-center shrink-0">
                {renderAlertIcon(live.activeAlert.type)}
              </span>
              <div className="min-w-0">
                <div className="font-display text-[10px] font-extrabold leading-tight truncate">
                  {live.activeAlert.title}
                </div>
                <div className="text-[8.5px] font-medium truncate" style={{ color: 'var(--g-muted)' }}>
                  {live.activeAlert.subtitle}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ON-DEMAND FX CANVAS (0% CPU WHEN IDLE) */}
        <FxCanvas
          ambientType={scene.ambientType}
          ambientDensity={scene.ambientDensity}
          accentColor={scene.accentColor}
          accentColor2={scene.accentColor2}
          performanceMode={live.performanceMode}
          activeAlert={live.activeAlert}
        />

        {/* CANVA SMART ALIGNMENT SNAP GUIDES */}
        {editable && snapGuides.length > 0 && (
          <div className="absolute inset-0 z-[48] pointer-events-none">
            {snapGuides.map((g, idx) =>
              g.axis === 'x' ? (
                <div
                  key={`gx-${idx}`}
                  className="absolute top-0 bottom-0 w-px bg-fuchsia-500 shadow-[0_0_6px_rgba(217,70,239,0.9)]"
                  style={{ left: `${g.position}px` }}
                />
              ) : (
                <div
                  key={`gy-${idx}`}
                  className="absolute left-0 right-0 h-px bg-fuchsia-500 shadow-[0_0_6px_rgba(217,70,239,0.9)]"
                  style={{ top: `${g.position}px` }}
                />
              )
            )}
          </div>
        )}

        {/* TIKTOK SAFE ZONE GUIDE OVERLAY */}
        {live.showSafeZone && (
          <div className="absolute inset-0 z-[45] pointer-events-none">
            <div className="absolute top-0 inset-x-0 h-[48px] bg-rose-500/15 border-b border-dashed border-rose-400/90 flex items-end justify-center pb-1">
              <span className="text-[8px] font-bold text-rose-100 bg-rose-950/85 px-1.5 py-0.5 rounded">
                Vùng TikTok Top Bar (7.5%)
              </span>
            </div>
            <div className="absolute top-[168px] left-1/2 -translate-x-1/2 w-[136px] h-[160px] rounded-[50%] border border-dashed border-emerald-400/70 flex items-center justify-center">
              <span className="text-[8px] font-bold text-emerald-100 bg-emerald-950/75 px-2 py-0.5 rounded-full">
                Vùng mặt Host
              </span>
            </div>
            <div className="absolute bottom-[56px] left-3 w-[205px] h-[118px] rounded-xl bg-sky-500/15 border border-dashed border-sky-400/80 p-2 flex flex-col justify-end">
              <span className="text-[8px] font-bold text-sky-100 bg-sky-950/85 px-1.5 py-0.5 rounded w-fit">
                Luồng bình luận TikTok
              </span>
            </div>
            <div className="absolute bottom-[12px] right-3 w-[112px] h-[94px] rounded-xl bg-amber-500/15 border border-dashed border-amber-400/80 p-1.5 flex items-end justify-center">
              <span className="text-[8px] font-bold text-amber-100 bg-amber-950/85 px-1.5 py-0.5 rounded">
                Giỏ hàng & Quà
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }
);
StageRenderer.displayName = 'StageRenderer';
