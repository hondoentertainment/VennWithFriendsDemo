
import React from 'react';

interface TimerProps {
  current: number;
  max: number;
}

const Timer: React.FC<TimerProps> = ({ current, max }) => {
  const percentage = (current / max) * 100;
  const isDanger = current <= 5;

  return (
    <div className="flex flex-col items-center gap-1 w-full max-w-xs mx-auto">
      <div className="flex justify-between w-full text-xs font-heading text-brand-dark/60">
        <span>TIME REMAINING</span>
        <span className={isDanger ? 'text-brand-coral font-bold animate-pulse' : ''}>{current}s</span>
      </div>
      <div className="h-3 w-full bg-brand-dark/10 rounded-full overflow-hidden border border-brand-dark/5">
        <div 
          className={`h-full transition-all duration-1000 ease-linear rounded-full ${
            isDanger ? 'bg-brand-coral' : 'bg-brand-accent'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export default Timer;
