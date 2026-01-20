import React from 'react';
import { ImageItem } from '../types';

interface VennDiagramProps {
  imageA: ImageItem | null;
  imageB: ImageItem | null;
  label?: string;
  showGlow?: boolean;
  intersectionImage?: string | null;
}

const VennDiagram: React.FC<VennDiagramProps> = ({ imageA, imageB, label, showGlow, intersectionImage }) => {
  if (!imageA || !imageB) return null;

  const renderMedia = (item: ImageItem, x: number, y: number, clipId: string) => {
    if (item.mediaType === 'video') {
      return (
        <foreignObject x={x} y={y} width="400" height="400" clipPath={`url(#${clipId})`}>
          <video 
            src={item.url} 
            autoPlay 
            loop 
            muted 
            playsInline 
            className="w-full h-full object-cover scale-110 animate-media-entry"
          />
        </foreignObject>
      );
    }
    return (
      <image 
        href={item.url} 
        x={x} y={y} width="400" height="400" 
        clipPath={`url(#${clipId})`} 
        preserveAspectRatio="xMidYMid slice"
        className="scale-110 animate-media-entry"
      />
    );
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-3xl mx-auto items-center">
      <div className="relative w-full aspect-[1.6/1] p-4 overflow-visible">
        <svg viewBox="0 0 800 500" className="w-full h-full drop-shadow-[0_20px_50px_rgba(0,0,0,0.2)] overflow-visible">
          <defs>
            <clipPath id="circleA">
              <circle cx="300" cy="250" r="200" />
            </clipPath>
            <clipPath id="circleB">
              <circle cx="500" cy="250" r="200" />
            </clipPath>
            <clipPath id="intersectionClip">
              <path d="M 400 90 A 200 200 0 0 1 400 410 A 200 200 0 0 1 400 90" />
            </clipPath>
          </defs>

          {/* Backgrounds */}
          <circle cx="300" cy="250" r="200" className="venn-circle-a stroke-[4] stroke-white/20" />
          <circle cx="500" cy="250" r="200" className="venn-circle-b stroke-[4] stroke-white/20" />

          {/* Media A & B */}
          <g className="transition-transform duration-700 ease-out hover:scale-[1.02]">
            {renderMedia(imageA, 100, 50, 'circleA')}
          </g>
          <g className="transition-transform duration-700 ease-out hover:scale-[1.02]">
            {renderMedia(imageB, 300, 50, 'circleB')}
          </g>

          {/* Intersection Generated Content */}
          {intersectionImage && (
            <g className="animate-in fade-in zoom-in duration-1000">
              <image 
                href={intersectionImage} 
                x="300" y="90" width="200" height="320" 
                clipPath="url(#intersectionClip)"
                preserveAspectRatio="xMidYMid slice"
                className="brightness-110 contrast-110"
              />
            </g>
          )}

          {/* Overlay Glow */}
          <path 
            d="M 400 90 A 200 200 0 0 1 400 410 A 200 200 0 0 1 400 90" 
            className={`venn-overlap transition-all duration-1000 ${showGlow ? 'animate-overlap-glow' : ''} stroke-white/10 stroke-1 pointer-events-none`}
            fill={intersectionImage ? 'transparent' : undefined}
          />

          {/* Label */}
          {label && (
            <foreignObject x="250" y="320" width="300" height="100">
              <div className="w-full h-full flex items-center justify-center text-center px-4">
                <div className="bg-brand-primary/95 backdrop-blur-xl text-white px-5 py-2.5 rounded-2xl text-sm font-heading font-bold shadow-2xl border border-white/30 animate-in slide-in-from-bottom-2 duration-500">
                  {label}
                </div>
              </div>
            </foreignObject>
          )}
        </svg>
      </div>

      <div className="grid grid-cols-2 gap-12 w-full px-4">
        <div className="text-center space-y-2">
          <h4 className="font-heading font-bold text-brand-coral text-lg uppercase tracking-widest">{imageA.title}</h4>
        </div>
        <div className="text-center space-y-2">
          <h4 className="font-heading font-bold text-brand-blue text-lg uppercase tracking-widest">{imageB.title}</h4>
        </div>
      </div>
    </div>
  );
};

export default VennDiagram;