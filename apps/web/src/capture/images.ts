import type { EngineLimits } from '@attivita/core';

/** Scales a size down to fit within maxEdge on its longer side; never enlarges. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Re-encodes photos and screenshots as JPEG within the engine limits; other files pass through. */
export async function shrinkImage(file: File, limits: EngineLimits): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  const bitmap = await createImageBitmap(file);
  const size = fitWithin(bitmap.width, bitmap.height, limits.imageMaxEdgePx);
  const canvas = new OffscreenCanvas(size.width, size.height);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: limits.imageJpegQuality });
  if (blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}
