
import React from 'react';

interface AvatarDisplayProps {
  avatar: string;
  color: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const AvatarDisplay: React.FC<AvatarDisplayProps> = ({ avatar, color, size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'w-8 h-8 text-lg',
    md: 'w-12 h-12 text-2xl',
    lg: 'w-20 h-20 text-4xl',
    xl: 'w-32 h-32 text-6xl'
  };

  return (
    <div className={`rounded-full bg-gradient-to-br ${color} flex items-center justify-center shadow-lg border-2 border-white/20 transition-all ${sizeClasses[size]} ${className}`}>
      <span role="img" aria-label="avatar">{avatar}</span>
    </div>
  );
};

export default AvatarDisplay;
