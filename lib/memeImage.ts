import { layoutMemeText } from '../game/meme';

/**
 * Bakes the fusion image and its captions into a PNG — the shareable meme.
 *
 * The source is either a data URL (fresh from the model) or the same-origin
 * /r/:id/image.png of a shared round, so the canvas is never tainted.
 */
export interface MemeSpec {
  src: string;
  topText?: string;
  bottomText?: string;
}

const FONT_FAMILY = '"Space Grotesk", Impact, "Arial Black", sans-serif';
const MIN_SIZE = 512;
const MAX_SIZE = 1024;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Fusion image failed to load'));
    img.src = src;
  });
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  anchorY: number,
  align: 'top' | 'bottom',
  maxLines: number
) {
  const layout = layoutMemeText(text, {
    maxWidth: width * 0.9,
    maxLines,
    maxFontSize: width * 0.09,
    minFontSize: width * 0.04,
    measure: (s, size) => {
      ctx.font = `700 ${size}px ${FONT_FAMILY}`;
      return ctx.measureText(s).width;
    },
  });
  if (layout.lines.length === 0) return;

  const { fontSize, lines } = layout;
  const lineHeight = fontSize * 1.15;
  ctx.font = `700 ${fontSize}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, fontSize / 9);
  ctx.strokeStyle = 'rgba(0,0,0,0.95)';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = fontSize / 6;

  const blockHeight = lines.length * lineHeight;
  const startY = align === 'top' ? anchorY : anchorY - blockHeight;
  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    ctx.strokeText(line, width / 2, y);
    ctx.fillText(line, width / 2, y);
  });
}

export async function renderMemeBlob(spec: MemeSpec): Promise<Blob> {
  // The web font is already on the page; waiting for it keeps the canvas
  // from falling back to a system font mid-render. Missing FontFaceSet is fine.
  try {
    await document.fonts?.load(`700 40px ${FONT_FAMILY}`);
  } catch {
    // Font loading is best-effort.
  }

  const img = await loadImage(spec.src);
  const width = Math.min(MAX_SIZE, Math.max(MIN_SIZE, img.naturalWidth || MIN_SIZE));
  const ratio = img.naturalWidth && img.naturalHeight ? img.naturalHeight / img.naturalWidth : 1;
  const height = Math.round(width * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');

  ctx.drawImage(img, 0, 0, width, height);

  const padding = width * 0.04;
  if (spec.topText) drawBlock(ctx, spec.topText.toUpperCase(), width, padding, 'top', 3);
  if (spec.bottomText) drawBlock(ctx, spec.bottomText, width, height - padding, 'bottom', 4);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the meme'))), 'image/png');
  });
}
