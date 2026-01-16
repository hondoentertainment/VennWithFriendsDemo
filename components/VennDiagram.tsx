
import React from 'react';
import { ImageItem } from '../types';

interface VennDiagramProps {
  imageA: ImageItem | null;
  imageB: ImageItem | null;
  label?: string;
  showGlow?: boolean;
}

const VennDiagram: React.FC<VennDiagramProps> = ({ imageA, imageB, label, showGlow }) => {
  if (!imageA || !imageB) return null;

  return (
    <div className="relative w-full max-w-2xl aspect-[1.6/1] mx-auto p-4 overflow-visible">
      <svg viewBox="0 0 800 500" className="w-full h-full drop-shadow-2xl">
        <defs>
          <clipPath id="circleA">
            <circle cx="300" cy="250" r="200" />
          </clipPath>
          <clipPath id="circleB">
            <circle cx="500" cy="250" r="200" />
          </clipPath>
          <clipPath id="overlap">
            <circle cx="300" cy="250" r="200" />
            <circle cx="500" cy="250" r="200" />
          </clipPath>
          {/* Overlap clipping is tricky, usually intersect circles */}
        </defs>

        {/* Outer Circles Backgrounds for fallback */}
        <circle cx="300" cy="250" r="200" className="venn-circle-a" />
        <circle cx="500" cy="250" r="200" className="venn-circle-b" />

        {/* Images with Masks */}
        <image 
          href={imageA.url} 
          x="100" y="50" width="400" height="400" 
          clipPath="url(#circleA)" 
          preserveAspectRatio="xMidYMid slice"
        />
        <image 
          href={imageB.url} 
          x="300" y="50" width="400" height="400" 
          clipPath="url(#circleB)" 
          preserveAspectRatio="xMidYMid slice"
        />

        {/* Overlap Layer for Visual Depth */}
        <path 
          d="M 400 90 A 200 200 0 0 1 400 410 A 200 200 0 0 1 400 90" 
          className={`venn-overlap transition-all duration-1000 ${showGlow ? 'animate-overlap-glow' : ''}`}
        />

        {/* Intersection Label Placeholder in Center */}
        {label && (
          <foreignObject x="325" y="150" width="150" height="200">
            <div className="w-full h-full flex items-center justify-center text-center">
              <span className="bg-brand-primary/90 text-white px-3 py-1.5 rounded-full text-sm font-bold shadow-xl border border-white/20 animate-bounce">
                {label}
              </span>
            </div>
          </foreignObject>
        )}
      </svg>
      
      {/* Absolute Titles */}
      <div className="absolute top-0 left-0 p-4 w-full flex justify-between pointer-events-none">
        <div className="bg-brand-dark/80 backdrop-blur text-white px-3 py-1 rounded-lg text-xs font-heading">
          {imageA.title}
        </div>
        <div className="bg-brand-dark/80 backdrop-blur text-white px-3 py-1 rounded-lg text-xs font-heading">
          {imageB.title}
        </div>
      </div>
    </div>
  );
};

export default VennDiagram;
