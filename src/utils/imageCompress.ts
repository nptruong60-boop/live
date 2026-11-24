export interface CompressedImageResult {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Compresses and resizes uploaded PNG/JPG/WebP assets on the client before storing,
 * preserving transparency for PNG/WebP foreground and midground elements so memory stays lightweight.
 */
export function compressUploadedImage(
  file: File,
  maxDimension = 960
): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được file ảnh'));
    reader.onload = (ev) => {
      const src = String(ev.target?.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('Ảnh không hợp lệ'));
      img.onload = () => {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxDimension || h > maxDimension) {
          if (w > h) {
            h = Math.round((h * maxDimension) / w);
            w = maxDimension;
          } else {
            w = Math.round((w * maxDimension) / h);
            h = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl: src, width: w, height: h });
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const keepAlpha =
          file.type === 'image/png' ||
          file.type === 'image/webp' ||
          file.type === 'image/svg+xml';
        const dataUrl = keepAlpha
          ? canvas.toDataURL('image/png')
          : canvas.toDataURL('image/jpeg', 0.84);
        resolve({ dataUrl, width: w, height: h });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
