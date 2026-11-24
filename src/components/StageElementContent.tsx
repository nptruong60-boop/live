import React from 'react';
import { ShieldCheck, Ticket, Truck, Zap } from 'lucide-react';
import type {
  CanvasElement,
  LiveComment,
  LiveRuntimeState,
  Product,
} from '../types/studio';
import {
  calcDiscountPercent,
  formatMMSS,
  formatShortPrice,
  formatVND,
} from '../utils/format';
import { ProductVisual } from './ProductVisual';

interface StageElementContentProps {
  element: CanvasElement;
  products: Product[];
  live: LiveRuntimeState;
  pinnedComment: LiveComment | null;
  isEditor?: boolean;
  onSelectProduct?: (productId: string) => void;
}

export const StageElementContent: React.FC<StageElementContentProps> = React.memo(
  ({ element, products, live, pinnedComment, isEditor = false, onSelectProduct }) => {
    const p = element.props;
    const resolvedProduct =
      (p.linkedProductId
        ? products.find((item) => item.id === p.linkedProductId)
        : products.find((item) => item.id === live.activeProductId)) ||
      (isEditor ? products[0] : undefined);

    const isPulsing =
      live.pricePulseAt > 0 && Date.now() - live.pricePulseAt < 900;

    switch (element.kind) {
      case 'image':
        if (!p.src) {
          return (
            <div
              className="w-full h-full flex flex-col items-center justify-center bg-zinc-800/40 border border-dashed border-zinc-400/50 text-[10px] text-zinc-400 text-center p-2"
              style={{ borderRadius: p.borderRadius ?? 8 }}
            >
              <span>Chưa có ảnh</span>
            </div>
          );
        }
        return (
          <img
            src={p.src}
            alt={element.name}
            draggable={false}
            referrerPolicy="no-referrer"
            className="w-full h-full select-none pointer-events-none"
            style={{
              objectFit: p.objectFit || 'contain',
              borderRadius: `${p.borderRadius ?? 0}px`,
            }}
          />
        );

      case 'header': {
        const variant = p.headerVariant || 'editorial';
        if (variant === 'minimal-pill') {
          return (
            <div className="w-full h-full flex items-center justify-center">
              <div className="glass-surface inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full max-w-full">
                <span className="font-display text-[10.5px] font-extrabold tracking-wide uppercase truncate">
                  {p.title || 'SIÊU SALE HÔM NAY'}
                </span>
                {p.subtitle && (
                  <span className="text-[9px] opacity-75 truncate">
                    · {p.subtitle}
                  </span>
                )}
              </div>
            </div>
          );
        }

        if (variant === 'mega-sale') {
          return (
            <div className="w-full h-full flex flex-col items-center justify-center text-center">
              {p.shopName && (
                <div className="glass-surface inline-flex items-center px-2.5 py-0.5 rounded-full mb-1 max-w-[90%]">
                  <span className="text-[8.5px] font-bold tracking-wider uppercase truncate">
                    {p.shopName}
                  </span>
                </div>
              )}
              <div className="font-display font-black text-[24px] leading-[1.04] tracking-tight uppercase mega-headline-text w-full truncate px-1">
                {p.title || 'GIẢM ĐẾN 50%'}
              </div>
              {p.subtitle && (
                <div className="mt-1 -rotate-[1deg] glass-accent-pill px-3.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wide max-w-[95%] truncate">
                  {p.subtitle}
                </div>
              )}
            </div>
          );
        }

        return (
          <div className="w-full h-full flex flex-col items-center justify-center text-center">
            {p.shopName && (
              <div className="glass-surface inline-flex items-center px-3 py-0.5 rounded-full max-w-[90%]">
                <span className="font-display text-[9px] font-bold tracking-[0.1em] uppercase truncate">
                  {p.shopName}
                </span>
              </div>
            )}
            <h2 className="font-display font-black text-[21px] leading-[1.1] tracking-tight mt-1 editorial-headline-light uppercase w-full truncate px-1">
              {p.title || 'SIÊU SALE THÁNG 11'}
            </h2>
            {p.subtitle && (
              <div className="glass-accent-pill mt-1 px-3 py-0.5 rounded-full text-[9px] font-bold tracking-wide max-w-[95%] truncate">
                {p.subtitle}
              </div>
            )}
          </div>
        );
      }

      case 'voucher': {
        const variant = p.voucherVariant || 'ticket';
        if (variant === 'pill') {
          return (
            <div className="w-full h-full glass-surface rounded-2xl px-2 py-1.5 flex flex-col items-center justify-center text-center overflow-hidden">
              <div className="glass-accent-pill inline-block px-2 py-0.5 rounded-full font-display text-[7.5px] font-extrabold uppercase tracking-wide max-w-full truncate">
                {p.topLabel || 'MUA 1 TẶNG 3'}
              </div>
              <div className="font-display font-extrabold text-[9.5px] leading-tight mt-1 truncate w-full">
                {p.mainValue || 'QUÀ ĐƠN 299K'}
              </div>
              {p.subLabel && (
                <div className="text-[7.5px] font-semibold truncate w-full" style={{ color: 'var(--g-muted)' }}>
                  {p.subLabel}
                </div>
              )}
            </div>
          );
        }

        return (
          <div className="w-full h-full glass-surface rounded-2xl px-2 py-1.5 flex flex-col items-center justify-center text-center overflow-hidden">
            <div
              className="text-[7.5px] font-extrabold uppercase tracking-widest pb-1 border-b border-dashed w-full truncate"
              style={{ borderColor: 'var(--g-divider)', color: 'var(--g-muted)' }}
            >
              {p.topLabel || 'VOUCHER LIVE'}
            </div>
            <div className="font-display font-black text-[13px] leading-tight pt-1 accent-text-adaptive tracking-tight w-full truncate">
              {p.mainValue || 'GIẢM 50%'}
            </div>
            {p.subLabel && (
              <div className="text-[7.5px] font-semibold truncate w-full" style={{ color: 'var(--g-muted)' }}>
                {p.subLabel}
              </div>
            )}
          </div>
        );
      }

      case 'host-tag':
        return (
          <div className="w-full h-full glass-surface rounded-2xl px-2.5 py-1.5 flex flex-col justify-center overflow-hidden">
            <div className="font-display text-[9.5px] font-extrabold uppercase tracking-wide truncate accent-text-adaptive">
              {p.hostName || 'HOST: MINH ANH'}
            </div>
            <div className="text-[8.5px] font-medium mt-0.5 truncate" style={{ color: 'var(--g-muted)' }}>
              {p.hostSub || 'Tư vấn & Chốt đơn'}
            </div>
          </div>
        );

      case 'flash-timer': {
        const pct = live.flashTotal > 0 ? Math.max(0, (live.flashLeft / live.flashTotal) * 100) : 0;
        if (!live.flashActive && !isEditor) {
          return null;
        }
        return (
          <div
            className="w-full h-full glass-surface-strong rounded-2xl px-2 py-1.5 flex flex-col items-center justify-center text-center border-2 overflow-hidden"
            style={{ borderColor: 'var(--accent)' }}
          >
            <div className="flex items-center justify-center gap-1">
              <Zap className="w-2.5 h-2.5 accent-text-adaptive shrink-0" />
              <span className="font-display text-[8px] font-extrabold uppercase tracking-wider accent-text-adaptive">
                FLASH SALE
              </span>
            </div>
            <div className="font-mono-num font-extrabold text-[15px] leading-tight mt-0.5 tracking-wider">
              {formatMMSS(live.flashLeft)}
            </div>
            <div
              className="mt-1 h-1 w-full rounded-full overflow-hidden"
              style={{ background: 'var(--g-chip-bg)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-300 ease-linear"
                style={{
                  width: `${pct}%`,
                  background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
                }}
              />
            </div>
          </div>
        );
      }

      case 'product-spotlight': {
        if (!resolvedProduct) return null;
        const discount = calcDiscountPercent(resolvedProduct.originalPrice, resolvedProduct.livePrice);
        return (
          <div
            className={`w-full h-full glass-surface-strong rounded-[20px] p-2.5 flex items-center gap-2.5 overflow-hidden ${
              isPulsing ? 'animate-price-pulse' : ''
            }`}
          >
            <div className="relative w-[68px] h-[68px] rounded-2xl shrink-0 overflow-hidden border border-white/60 shadow-sm">
              <ProductVisual product={resolvedProduct} />
              <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md glass-accent-pill font-display text-[7px] font-extrabold tracking-wide leading-none">
                {resolvedProduct.code}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-[11px] font-bold leading-snug line-clamp-2">
                {resolvedProduct.name}
              </div>
              {resolvedProduct.tags.length > 0 && (
                <div className="text-[8.5px] font-medium mt-0.5 truncate" style={{ color: 'var(--g-muted)' }}>
                  {resolvedProduct.tags.slice(0, 2).join(' · ')}
                </div>
              )}
              <div
                className="flex items-end justify-between gap-2 mt-1.5 pt-1 border-t"
                style={{ borderColor: 'var(--g-divider)' }}
              >
                <div className="min-w-0">
                  {resolvedProduct.originalPrice > resolvedProduct.livePrice && (
                    <div
                      className="text-[9px] line-through leading-none font-mono-num"
                      style={{ color: 'var(--g-muted)' }}
                    >
                      {formatVND(resolvedProduct.originalPrice)}
                    </div>
                  )}
                  <div className="font-display font-black text-[16px] leading-none mt-0.5 accent-text-adaptive tracking-tight font-mono-num">
                    {formatVND(resolvedProduct.livePrice)}
                  </div>
                </div>
                {p.showDiscountBadge !== false && discount > 0 && (
                  <span className="glass-accent-pill px-2 py-0.5 rounded-full font-display text-[9px] font-extrabold shrink-0 font-mono-num">
                    -{discount}%
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      }

      case 'product-shelf': {
        if (!live.activeProductId && !isEditor) return null;
        let shelfItems = products.slice(0, 3);
        const activeProd = products.find((item) => item.id === live.activeProductId);
        if (activeProd && !shelfItems.some((item) => item.id === activeProd.id)) {
          shelfItems = [products[0], activeProd, products[2]].filter(Boolean);
        }

        return (
          <div className="w-full h-full grid grid-cols-3 gap-1.5 items-end">
            {shelfItems.map((item) => {
              const isSelected = item.id === live.activeProductId;
              return (
                <div
                  key={item.id}
                  onClick={() => !isEditor && onSelectProduct?.(item.id)}
                  className={`relative h-full text-center rounded-2xl p-1.5 flex flex-col justify-between transition-transform duration-200 ${
                    isSelected ? 'glass-surface-strong -translate-y-1 border-2' : 'glass-surface opacity-95'
                  }`}
                  style={isSelected ? { borderColor: 'var(--accent)' } : undefined}
                >
                  <div className="w-10 h-10 mx-auto flex items-center justify-center shrink-0">
                    <ProductVisual product={item} transparent />
                  </div>
                  <div
                    className={`rounded-md px-1 py-0.5 text-[7.5px] font-extrabold truncate ${
                      isSelected ? 'glass-accent-pill' : ''
                    }`}
                    style={!isSelected ? { background: 'var(--g-chip-bg)', color: 'var(--g-chip-text)' } : undefined}
                  >
                    {item.code}
                  </div>
                  <div className="text-[8px] font-bold leading-tight line-clamp-1 px-0.5">
                    {item.name}
                  </div>
                  <div className="pt-1 border-t" style={{ borderColor: 'var(--g-divider)' }}>
                    {item.originalPrice > item.livePrice && (
                      <div className="text-[7px] line-through leading-none font-mono-num" style={{ color: 'var(--g-muted)' }}>
                        {formatVND(item.originalPrice)}
                      </div>
                    )}
                    <div className="font-display font-black text-[10.5px] leading-tight mt-0.5 accent-text-adaptive font-mono-num">
                      {formatVND(item.livePrice)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      }

      case 'product-pill': {
        if (!resolvedProduct) return null;
        return (
          <div
            className={`w-full h-full glass-surface-strong rounded-full p-1.5 pl-2 flex items-center gap-2 overflow-hidden ${
              isPulsing ? 'animate-price-pulse' : ''
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-white/80 border border-white/80 flex items-center justify-center p-1 shrink-0 overflow-hidden">
              <ProductVisual product={resolvedProduct} transparent />
            </div>
            <div className="flex-1 min-w-0 pr-1">
              <div className="text-[8px] font-extrabold uppercase truncate accent-text-adaptive">
                {resolvedProduct.code} {resolvedProduct.tags[0] ? `· ${resolvedProduct.tags[0]}` : ''}
              </div>
              <div className="font-display text-[10.5px] font-bold leading-tight truncate mt-0.5">
                {resolvedProduct.name}
              </div>
            </div>
            <div className="glass-accent-pill rounded-full px-3 py-1.5 text-center shrink-0">
              {resolvedProduct.originalPrice > resolvedProduct.livePrice && (
                <div className="text-[7px] line-through opacity-85 leading-none font-mono-num">
                  {formatShortPrice(resolvedProduct.originalPrice)}
                </div>
              )}
              <div className="font-display font-black text-[13px] leading-none mt-0.5 font-mono-num">
                {formatShortPrice(resolvedProduct.livePrice)}
              </div>
            </div>
          </div>
        );
      }

      case 'trust-bar':
        return (
          <div className="w-full h-full glass-surface rounded-2xl px-2 py-1 grid grid-cols-3 items-center text-center divide-x">
            <div className="flex flex-col items-center justify-center px-1" style={{ borderColor: 'var(--g-divider)' }}>
              <Truck className="w-3.5 h-3.5 mb-0.5 accent-text-adaptive shrink-0" />
              <span className="text-[7.5px] font-bold leading-tight truncate w-full">
                {p.trust1 || 'Freeship Toàn Quốc'}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center px-1" style={{ borderColor: 'var(--g-divider)' }}>
              <Ticket className="w-3.5 h-3.5 mb-0.5 accent-text-adaptive shrink-0" />
              <span className="text-[7.5px] font-bold leading-tight truncate w-full">
                {p.trust2 || 'Voucher Độc Quyền'}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center px-1" style={{ borderColor: 'var(--g-divider)' }}>
              <ShieldCheck className="w-3.5 h-3.5 mb-0.5 accent-text-adaptive shrink-0" />
              <span className="text-[7.5px] font-bold leading-tight truncate w-full">
                {p.trust3 || 'Kiểm Hàng / COD'}
              </span>
            </div>
          </div>
        );

      case 'pinned-comment': {
        if (!live.showPinnedOnStage && !isEditor) return null;
        const displayComment = pinnedComment || (isEditor
          ? {
              user: 'Chị Ngọc Hân',
              text: 'Serum B5 da nhạy cảm dùng được không shop ơi?',
              platform: 'tiktok',
            }
          : null);
        if (!displayComment) return null;
        return (
          <div className="w-full h-full glass-surface-strong rounded-2xl px-3 py-2 flex flex-col justify-center overflow-hidden border" style={{ borderColor: 'var(--accent)' }}>
            <div className="flex items-center justify-between gap-2 text-[8px] font-extrabold uppercase tracking-wider accent-text-adaptive">
              <span className="truncate">Câu hỏi khách · {displayComment.user}</span>
              <span className="uppercase opacity-75 shrink-0">{displayComment.platform}</span>
            </div>
            <div className="font-display text-[11px] font-bold leading-snug line-clamp-2 mt-0.5">
              “{displayComment.text}”
            </div>
          </div>
        );
      }

      case 'text':
      default:
        return (
          <div
            className="w-full h-full flex items-center justify-center px-2.5 py-1 overflow-hidden leading-tight"
            style={{
              fontSize: `${p.fontSize || 15}px`,
              fontWeight: p.fontWeight || '800',
              textAlign: p.textAlign || 'center',
              color: p.color || '#ffffff',
              backgroundColor: p.backgroundColor || 'transparent',
              borderRadius: `${p.borderRadius ?? 10}px`,
            }}
          >
            <span className="w-full break-words">{p.text || 'Chữ tùy chỉnh'}</span>
          </div>
        );
    }
  }
);
StageElementContent.displayName = 'StageElementContent';
