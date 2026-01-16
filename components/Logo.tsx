
import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showText?: boolean;
}

const Logo: React.FC<LogoProps> = ({ size = 'md', className = '', showText = true }) => {
  const sizeMap = {
    sm: { icon: 32, text: 'text-lg' },
    md: { icon: 48, text: 'text-2xl' },
    lg: { icon: 80, text: 'text-4xl' },
    xl: { icon: 120, text: 'text-6xl' },
  };

  const { icon: iconSize, text: textSize } = sizeMap[size];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div style={{ width: iconSize, height: iconSize }} className="relative shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
          {/* Left Circle (Coral) */}
          <circle 
            cx="38" cy="50" r="30" 
            className="fill-brand-coral opacity-80"
          />
          {/* Right Circle (Blue) */}
          <circle 
            cx="62" cy="50" r="30" 
            className="fill-brand-blue opacity-80"
          />
          {/* Overlap Area (Primary) */}
          <clipPath id="logo-overlap">
            <circle cx="38" cy="50" r="30" />
          </clipPath>
          <circle 
            cx="62" cy="50" r="30" 
            clipPath="url(#logo-overlap)"
            className="fill-brand-primary"
          />
          {/* Highlight "Spark" in Center */}
          <path 
            d="M 50 35 L 53 47 L 65 50 L 53 53 L 50 65 L 47 53 L 35 50 L 47 47 Z"
            className="fill-white opacity-90 animate-pulse"
          />
        </svg>
      </div>
      
      {showText && (
        <div className={`font-heading font-bold tracking-tight ${textSize}`}>
          <span className="text-brand-primary">Venn</span>
          <span className="text-brand-dark/40 ml-1">with</span>
          <span className="text-brand-primary block sm:inline sm:ml-1">Friends</span>
        </div>
      )}
    </div>
  );
};

export default Logo;
