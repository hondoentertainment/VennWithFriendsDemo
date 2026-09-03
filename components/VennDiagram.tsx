import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ImageItem } from '../types';
import FusionMeme from './FusionMeme';

interface VennDiagramProps {
  imageA: ImageItem | null;
  imageB: ImageItem | null;
  label?: string;
  showGlow?: boolean;
  /** The AI-generated fusion of both halves; shown in the overlap once it exists. */
  intersectionImage?: string | null;
  /** The winning line and who wrote it — the caption on the fusion meme. */
  memeCaption?: string;
  memeAuthor?: string;
}

// Geometry in viewBox units. Everything (clips, media boxes, the lens, the
// label) derives from these so the pieces stay aligned if they are tuned.
const VIEW = { w: 800, h: 500 };
const R = 200;
const CY = 250;
const CX = { a: 300, b: 500 };
const LENS_HALF = Math.sqrt(R * R - ((CX.b - CX.a) / 2) ** 2);
const LENS_TOP = CY - LENS_HALF;
const LENS_BOTTOM = CY + LENS_HALF;
const LENS_MID_X = (CX.a + CX.b) / 2;
const LENS_LEFT = CX.b - R;
const LENS_WIDTH = CX.a + R - LENS_LEFT;
// The exact intersection of the two circles: circle A's right arc down, then
// circle B's left arc back up.
const LENS_PATH =
  `M ${LENS_MID_X} ${LENS_TOP.toFixed(1)} ` +
  `A ${R} ${R} 0 0 1 ${LENS_MID_X} ${LENS_BOTTOM.toFixed(1)} ` +
  `A ${R} ${R} 0 0 1 ${LENS_MID_X} ${LENS_TOP.toFixed(1)} Z`;

type Side = 'a' | 'b';
type MediaStatus = 'loading' | 'ready' | 'error';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(REDUCED_MOTION).matches === true;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const query = window.matchMedia?.(REDUCED_MOTION);
    if (!query) return;
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * Loads an image off-screen so the diagram can show a placeholder until it
 * is ready and a fallback if it never is. Callers key the component on the
 * source, so a status never outlives the URL it belongs to.
 */
function useImageStatus(src: string | null | undefined): MediaStatus {
  const [status, setStatus] = useState<MediaStatus>('loading');
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setStatus('ready');
    };
    img.onerror = () => {
      if (!cancelled) setStatus('error');
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);
  return src ? status : 'loading';
}

interface MediaPlaceholderProps {
  item: ImageItem;
  cx: number;
  status: MediaStatus;
}

/** Shimmer while media loads; a titled tile if it fails. Sits under the media. */
const MediaPlaceholder: React.FC<MediaPlaceholderProps> = ({ item, cx, status }) => {
  if (status === 'ready') return null;
  if (status === 'loading') {
    return <circle cx={cx} cy={CY} r={R} className="fill-white/30 animate-pulse pointer-events-none" />;
  }
  const isVideo = item.mediaType === 'video';
  return (
    <g className="pointer-events-none select-none">
      <text x={cx} y={CY - 24} textAnchor="middle" fontSize="60">
        {isVideo ? '🎬' : '📷'}
      </text>
      <text x={cx} y={CY + 34} textAnchor="middle" fontSize="26" className="fill-white font-heading font-bold">
        {item.title}
      </text>
      <text x={cx} y={CY + 64} textAnchor="middle" fontSize="16" className="fill-white/75 font-bold">
        {isVideo ? "Video couldn't load" : "Photo couldn't load"}
      </text>
    </g>
  );
};

interface MediaLayerProps {
  item: ImageItem;
  cx: number;
  clipId: string;
  paused: boolean;
  /** The translucent copy of A drawn inside the lens: decorative, no placeholder. */
  ghost?: boolean;
  onStatus?: (status: MediaStatus) => void;
}

const PhotoLayer: React.FC<MediaLayerProps> = ({ item, cx, clipId, ghost, onStatus }) => {
  const status = useImageStatus(item.url);
  useEffect(() => onStatus?.(status), [status, onStatus]);

  return (
    <>
      {!ghost && <MediaPlaceholder item={item} cx={cx} status={status} />}
      {status === 'ready' && (
        <g clipPath={`url(#${clipId})`} opacity={ghost ? 0.55 : 1} aria-hidden={ghost || undefined}>
          <image
            href={item.url}
            x={cx - R}
            y={CY - R}
            width={2 * R}
            height={2 * R}
            preserveAspectRatio="xMidYMid slice"
            className={`venn-media animate-media-entry scale-110 ${ghost ? '' : 'group-hover:scale-[1.16]'}`}
          />
        </g>
      )}
    </>
  );
};

const VideoLayer: React.FC<MediaLayerProps> = ({ item, cx, clipId, paused, ghost, onStatus }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<MediaStatus>('loading');
  useEffect(() => onStatus?.(status), [status, onStatus]);

  // play() returns a promise that rejects when autoplay is refused; a paused
  // video is the correct outcome there, not an error to surface.
  const play = () => void videoRef.current?.play().catch(() => {});

  useEffect(() => {
    if (paused) videoRef.current?.pause();
    else play();
  }, [paused]);

  // Background tabs keep decoding looping video otherwise; resume on return
  // unless the player chose to pause.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) videoRef.current?.pause();
      else if (!paused) play();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [paused]);

  return (
    <>
      {!ghost && <MediaPlaceholder item={item} cx={cx} status={status} />}
      {status !== 'error' && (
        <g clipPath={`url(#${clipId})`} aria-hidden={ghost || undefined}>
          <foreignObject x={cx - R} y={CY - R} width={2 * R} height={2 * R}>
            {/*
              Safari ignores clip-path on foreignObject, so the HTML side clips
              itself to the same circle and the SVG clip is only a second line.
            */}
            <div
              className="w-full h-full rounded-full overflow-hidden [clip-path:circle(50%)]"
              style={{ opacity: ghost ? 0.55 : 1 }}
            >
              <video
                ref={videoRef}
                src={item.url}
                autoPlay={!paused}
                loop
                muted
                playsInline
                preload="auto"
                disablePictureInPicture
                disableRemotePlayback
                aria-hidden="true"
                onLoadedData={() => setStatus('ready')}
                onError={() => setStatus('error')}
                className={`w-full h-full object-cover venn-media scale-110 ${
                  status === 'ready' ? 'animate-media-entry' : 'opacity-0'
                } ${ghost ? '' : 'group-hover:scale-[1.16]'}`}
              />
            </div>
          </foreignObject>
        </g>
      )}
    </>
  );
};

const MediaLayer: React.FC<MediaLayerProps> = (props) =>
  props.item.mediaType === 'video' ? <VideoLayer {...props} /> : <PhotoLayer {...props} />;

interface MediaCaptionProps {
  item: ImageItem;
  tone: string;
  status: MediaStatus;
  paused: boolean;
  onToggle: () => void;
}

/** The title under each circle, plus the play/pause control for a video. */
const MediaCaption: React.FC<MediaCaptionProps> = ({ item, tone, status, paused, onToggle }) => (
  <div className="text-center space-y-2 min-w-0">
    <h4 className={`font-heading font-bold ${tone} text-base sm:text-lg uppercase tracking-widest break-words [text-wrap:balance]`}>
      {item.title}
    </h4>
    {item.mediaType === 'video' ? (
      <button
        type="button"
        onClick={onToggle}
        disabled={status === 'error'}
        aria-pressed={!paused}
        aria-label={`${paused ? 'Play' : 'Pause'} the ${item.title} video`}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-brand-dark/70 hover:text-brand-dark text-xs font-bold shadow-sm border border-brand-dark/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span aria-hidden="true">{paused ? '▶' : '⏸'}</span>
        {paused ? 'Play video' : 'Pause video'}
      </button>
    ) : (
      <span className="inline-block px-3 py-1 text-xs font-bold uppercase tracking-widest text-brand-dark/40">Photo</span>
    )}
  </div>
);

const VennDiagram: React.FC<VennDiagramProps> = ({
  imageA,
  imageB,
  label,
  showGlow,
  intersectionImage,
  memeCaption,
  memeAuthor,
}) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const reducedMotion = useReducedMotion();
  // null = follow the motion preference; a tap on the control overrides it.
  const [userPaused, setUserPaused] = useState<Record<Side, boolean | null>>({ a: null, b: null });
  const [mediaStatus, setMediaStatus] = useState<Record<Side, MediaStatus>>({ a: 'loading', b: 'loading' });
  const [memeOpen, setMemeOpen] = useState(false);
  const memeStatus = useImageStatus(intersectionImage);

  // Stable per-side callbacks so the layers' status effects don't re-fire on
  // every render of the diagram.
  const onStatusA = useCallback((status: MediaStatus) => setMediaStatus((s) => ({ ...s, a: status })), []);
  const onStatusB = useCallback((status: MediaStatus) => setMediaStatus((s) => ({ ...s, b: status })), []);
  const closeMeme = useCallback(() => setMemeOpen(false), []);

  if (!imageA || !imageB) return null;

  const clipA = `${uid}-a`;
  const clipB = `${uid}-b`;
  const clipLens = `${uid}-lens`;

  const paused: Record<Side, boolean> = {
    a: userPaused.a ?? reducedMotion,
    b: userPaused.b ?? reducedMotion,
  };
  const toggle = (side: Side) => setUserPaused((prev) => ({ ...prev, [side]: !paused[side] }));

  const memeReady = Boolean(intersectionImage) && memeStatus === 'ready';
  const memeLoading = Boolean(intersectionImage) && memeStatus === 'loading';
  const subtitle = `${imageA.title} × ${imageB.title}`;
  const openMeme = () => memeReady && setMemeOpen(true);

  return (
    <div className="flex flex-col gap-6 sm:gap-8 w-full max-w-3xl mx-auto items-center">
      <div className="relative w-full aspect-[1.6/1] p-2 sm:p-4 overflow-visible">
        <svg
          viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
          className="w-full h-full drop-shadow-[0_20px_50px_rgba(0,0,0,0.2)] overflow-visible"
          role="group"
          aria-label={`Venn diagram: ${imageA.title} meets ${imageB.title}${label ? `, the intersection is ${label}` : ''}`}
        >
          <defs>
            <clipPath id={clipA}>
              <circle cx={CX.a} cy={CY} r={R} />
            </clipPath>
            <clipPath id={clipB}>
              <circle cx={CX.b} cy={CY} r={R} />
            </clipPath>
            <clipPath id={clipLens}>
              <path d={LENS_PATH} />
            </clipPath>
          </defs>

          {/* Tinted bases: the diagram is legible before (and without) any media. */}
          <circle cx={CX.a} cy={CY} r={R} className="venn-circle-a" />
          <circle cx={CX.b} cy={CY} r={R} className="venn-circle-b" />

          <g className="group">
            <MediaLayer key={`a-${imageA.id}`} item={imageA} cx={CX.a} clipId={clipA} paused={paused.a} onStatus={onStatusA} />
          </g>
          <g className="group">
            <MediaLayer key={`b-${imageB.id}`} item={imageB} cx={CX.b} clipId={clipB} paused={paused.b} onStatus={onStatusB} />
          </g>

          {/*
            The overlap is an actual intersection: A shows through B inside the
            lens until the generated fusion takes its place.
          */}
          {!memeReady && (
            <MediaLayer key={`lens-${imageA.id}`} item={imageA} cx={CX.a} clipId={clipLens} paused={paused.a} ghost />
          )}

          {memeLoading && <path d={LENS_PATH} className="fill-white/40 animate-pulse pointer-events-none" />}

          {memeReady && intersectionImage && (
            <g clipPath={`url(#${clipLens})`} className="cursor-zoom-in animate-lens-reveal" onClick={openMeme}>
              <title>Open the fusion meme</title>
              <image
                href={intersectionImage}
                x={LENS_LEFT}
                y={LENS_TOP}
                width={LENS_WIDTH}
                height={2 * LENS_HALF}
                preserveAspectRatio="xMidYMid slice"
                className="venn-media animate-fade-zoom-in brightness-105 contrast-105 group-hover:scale-105"
              />
            </g>
          )}

          {/* Overlap tint and glow. The tint lifts once the fusion is in place. */}
          <path
            d={LENS_PATH}
            className={`venn-overlap transition-all duration-1000 ${showGlow ? 'animate-overlap-glow' : ''} stroke-white/30 stroke-1 pointer-events-none`}
            style={{ fillOpacity: memeReady ? 0 : undefined }}
          />

          {/* Crisp outlines on top of the media so both circles read as a Venn. */}
          <circle cx={CX.a} cy={CY} r={R} className="fill-none stroke-white/50 pointer-events-none" strokeWidth={3} />
          <circle cx={CX.b} cy={CY} r={R} className="fill-none stroke-white/50 pointer-events-none" strokeWidth={3} />

        </svg>

        {/*
          The label is HTML over the SVG rather than a foreignObject inside it:
          text in the viewBox scales with the diagram and turns unreadable on a
          phone, whereas this keeps a CSS font size. It is anchored to the
          lens geometry so it still sits where the overlap is.
        */}
        {label && (
          <div className="absolute inset-2 sm:inset-4 pointer-events-none" aria-hidden="true">
            <div
              className="absolute left-1/2 -translate-x-1/2 -translate-y-full w-[60%] sm:w-[50%] flex justify-center"
              style={{ top: `${((LENS_BOTTOM - 12) / VIEW.h) * 100}%` }}
            >
              <div className="max-w-xs bg-brand-primary/95 backdrop-blur-xl text-white px-3 py-1.5 sm:px-5 sm:py-2.5 rounded-xl sm:rounded-2xl text-[11px] sm:text-sm leading-snug font-heading font-bold shadow-2xl border border-white/30 animate-label-pop line-clamp-2 text-center [text-wrap:balance]">
                {label}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6 sm:gap-12 w-full px-4">
        <MediaCaption item={imageA} tone="text-brand-coral" status={mediaStatus.a} paused={paused.a} onToggle={() => toggle('a')} />
        <MediaCaption item={imageB} tone="text-brand-blue" status={mediaStatus.b} paused={paused.b} onToggle={() => toggle('b')} />
      </div>

      {memeReady && (
        <button
          type="button"
          onClick={openMeme}
          className="px-6 py-3 rounded-full bg-white text-brand-primary font-heading font-bold shadow-lg border-2 border-brand-primary/20 hover:border-brand-primary transition-colors"
        >
          ✨ See the fusion meme
        </button>
      )}

      {memeOpen && intersectionImage && (
        <FusionMeme
          src={intersectionImage}
          label={label}
          caption={memeCaption}
          author={memeAuthor}
          subtitle={subtitle}
          onClose={closeMeme}
        />
      )}
    </div>
  );
};

export default VennDiagram;
