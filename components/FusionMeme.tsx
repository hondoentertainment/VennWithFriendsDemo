import React, { useEffect, useRef, useState } from 'react';
import { memeFileName } from '../game/meme';
import { renderMemeBlob } from '../lib/memeImage';

interface FusionMemeProps {
  src: string;
  /** Top line of the meme — the intersection label. */
  label?: string;
  /** Bottom line — the winning answer, credited to whoever wrote it. */
  caption?: string;
  author?: string;
  /** "Alpine Peak × Circuit Pulse" — where the fusion came from. */
  subtitle: string;
  onClose: () => void;
}

type Busy = 'download' | 'share' | null;

function bottomText(caption?: string, author?: string): string | undefined {
  if (!caption) return undefined;
  return author ? `“${caption}” — ${author}` : `“${caption}”`;
}

/**
 * Full-size view of the generated fusion, captioned like a meme, with a way to
 * save or share the composed PNG. The lens in the diagram only shows a sliver
 * of the image; this is where the whole thing gets its moment.
 */
const FusionMeme: React.FC<FusionMemeProps> = ({ src, label, caption, author, subtitle, onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Freeze the page behind the dialog; restore whatever was there before.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const compose = () => renderMemeBlob({ src, topText: label, bottomText: bottomText(caption, author) });
  const fileName = memeFileName(label);

  const triggerDownload = (href: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDownload = async () => {
    if (busy) return;
    setBusy('download');
    setNotice(null);
    try {
      const blob = await compose();
      const url = URL.createObjectURL(blob);
      triggerDownload(url);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      // The bare image is still worth having if the caption bake fails.
      console.error('Meme render failed', err);
      triggerDownload(src);
      setNotice('Saved the image without captions.');
    } finally {
      setBusy(null);
    }
  };

  const handleShare = async () => {
    if (busy || !canShare) return;
    setBusy('share');
    setNotice(null);
    try {
      const blob = await compose();
      const file = new File([blob], fileName, { type: 'image/png' });
      const withFile = { files: [file], title: 'Venn with Friends' };
      if (navigator.canShare?.(withFile)) {
        await navigator.share(withFile);
      } else {
        await navigator.share({ title: 'Venn with Friends', text: label ? `${label} — ${subtitle}` : subtitle });
      }
    } catch (err) {
      // A dismissed share sheet is not an error.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        console.error('Share failed', err);
        setNotice("Couldn't open the share sheet — try downloading instead.");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-brand-dark/90 backdrop-blur-md animate-lightbox-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Fusion meme"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg flex flex-col gap-4"
      >
        <div className="relative aspect-square w-full rounded-[2rem] overflow-hidden shadow-2xl bg-black ring-4 ring-white/15">
          <img src={src} alt={label ? `${label}: the fusion of ${subtitle}` : `The fusion of ${subtitle}`} className="w-full h-full object-contain" />
          {label && (
            <div className="absolute inset-x-4 top-4 text-center meme-text text-[clamp(1.1rem,5.5vw,2.25rem)] line-clamp-3">
              {label}
            </div>
          )}
          {caption && (
            <div className="absolute inset-x-4 bottom-4 text-center meme-text text-[clamp(0.95rem,4.5vw,1.75rem)] line-clamp-4 normal-case">
              “{caption}”{author && <span className="block text-[0.7em] mt-1 opacity-90">— {author}</span>}
            </div>
          )}
        </div>

        <p className="text-center text-white/60 text-sm font-heading tracking-widest uppercase">{subtitle}</p>

        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={handleDownload}
            disabled={busy !== null}
            className="px-6 py-3 rounded-2xl bg-brand-primary text-white font-bold shadow-xl disabled:opacity-50"
          >
            {busy === 'download' ? 'Saving…' : '⬇️ Download meme'}
          </button>
          {canShare && (
            <button
              onClick={handleShare}
              disabled={busy !== null}
              className="px-6 py-3 rounded-2xl bg-white text-brand-dark font-bold shadow-xl disabled:opacity-50"
            >
              {busy === 'share' ? 'Sharing…' : '📤 Share'}
            </button>
          )}
          <button
            ref={closeRef}
            onClick={onClose}
            className="px-6 py-3 rounded-2xl bg-white/10 text-white font-bold border border-white/20"
          >
            Close
          </button>
        </div>

        {notice && (
          <p role="status" className="text-center text-sm text-white/70">
            {notice}
          </p>
        )}
      </div>
    </div>
  );
};

export default FusionMeme;
