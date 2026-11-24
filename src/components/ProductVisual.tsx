import React from 'react';
import type { Product } from '../types/studio';

interface ProductVisualProps {
  product: Product;
  transparent?: boolean;
}

export const ProductVisual: React.FC<ProductVisualProps> = React.memo(
  ({ product, transparent = false }) => {
    if (product.customImage) {
      return (
        <img
          src={product.customImage}
          alt={product.name}
          referrerPolicy="no-referrer"
          className="w-full h-full object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.18)]"
        />
      );
    }

    const renderSvg = () => {
      switch (product.svgType) {
        case 'sunscreen':
          return (
            <svg viewBox="0 0 80 80" className="w-full h-full" fill="none" aria-hidden="true">
              <rect x="32" y="10" width="16" height="9" rx="2.5" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.2" />
              <path d="M22 22 C22 19 25 18 40 18 C55 18 58 19 58 22 L56 66 C56 69 53 71 40 71 C27 71 24 69 24 66 Z" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1.2" />
              <rect x="27" y="31" width="26" height="11" rx="5.5" fill="#fb923c" opacity="0.22" />
              <text x="40" y="39" textAnchor="middle" fill="#ea580c" fontSize="8" fontWeight="800" fontFamily="sans-serif">SPF50+</text>
              <rect x="31" y="49" width="18" height="2.4" rx="1.2" fill="#334155" />
              <rect x="34" y="55" width="12" height="2" rx="1" fill="#94a3b8" />
            </svg>
          );
        case 'cleanser-duo':
          return (
            <svg viewBox="0 0 80 80" className="w-full h-full" fill="none" aria-hidden="true">
              <rect x="16" y="20" width="22" height="48" rx="6" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1.2" />
              <rect x="21" y="13" width="12" height="7" rx="2" fill="#cbd5e1" />
              <circle cx="27" cy="40" r="6" fill="#6366f1" opacity="0.2" />
              <circle cx="27" cy="40" r="3" fill="#6366f1" />
              <path d="M44 16 L62 16 L60 62 C60 65 57 68 53 68 C49 68 46 65 46 62 Z" fill="#eef2ff" stroke="#e2e8f0" strokeWidth="1.2" />
              <rect x="48" y="64" width="10" height="6" rx="2" fill="#e2e8f0" />
              <rect x="48" y="28" width="10" height="3" rx="1.5" fill="#10b981" />
            </svg>
          );
        case 'mist':
          return (
            <svg viewBox="0 0 80 80" className="w-full h-full" fill="none" aria-hidden="true">
              <rect x="33" y="9" width="14" height="12" rx="4" fill="#ffffff" stroke="#f9a8d4" strokeWidth="1.2" />
              <rect x="27" y="21" width="26" height="50" rx="8" fill="#fbcfe8" stroke="#f472b6" strokeWidth="1.2" />
              <rect x="31" y="34" width="18" height="24" rx="3" fill="rgba(255,255,255,0.9)" />
              <rect x="34" y="41" width="12" height="2.4" rx="1.2" fill="#be185d" />
              <rect x="35" y="47" width="10" height="2" rx="1" fill="#f472b6" />
            </svg>
          );
        case 'serum-amber':
        default:
          return (
            <svg viewBox="0 0 80 80" className="w-full h-full" fill="none" aria-hidden="true">
              <rect x="34" y="8" width="12" height="10" rx="4" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.2" />
              <rect x="31" y="18" width="18" height="7" rx="2" fill="#e2e8f0" />
              <rect x="24" y="25" width="32" height="45" rx="7" fill="#78350f" />
              <rect x="27" y="34" width="26" height="26" rx="2.5" fill="rgba(255,255,255,0.94)" />
              <rect x="31" y="40" width="18" height="2.6" rx="1.3" fill="#451a03" />
              <rect x="33" y="46" width="14" height="2" rx="1" fill="#92400e" opacity="0.65" />
              <rect x="35" y="51" width="10" height="3.5" rx="1.7" fill="#d97706" />
            </svg>
          );
      }
    };

    if (transparent) return renderSvg();
    return (
      <div className="w-full h-full rounded-xl bg-gradient-to-br from-white/80 to-white/35 flex items-center justify-center p-1">
        {renderSvg()}
      </div>
    );
  }
);
ProductVisual.displayName = 'ProductVisual';
