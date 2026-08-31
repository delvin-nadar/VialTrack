import React, { useState } from 'react';

interface BrandLogoProps {
  className?: string;
  variant?: 'color' | 'white';
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = 'h-8 w-auto',
  variant = 'color',
  showText = true,
  size = 'md'
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  // If image loaded successfully or not yet errored, render img tag with SVG/vector fallback
  if (!imgFailed) {
    return (
      <img
        src={variant === 'white' ? '/logo-white.svg' : '/logo.svg'}
        alt="SecondMedic VialTrack"
        className={`${className} object-contain shrink-0`}
        onError={() => setImgFailed(true)}
      />
    );
  }

  // Fallback Inline SecondMedic Vector Logo (Guaranteed to NEVER fail or show broken placeholder)
  return (
    <div className="flex items-center gap-2 shrink-0 select-none">
      <svg
        viewBox="0 0 100 100"
        className={size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8'}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="smGradFallback" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00A3E0" />
            <stop offset="60%" stopColor="#0084D1" />
            <stop offset="100%" stopColor="#026AA7" />
          </linearGradient>
        </defs>
        {/* Speech Bubble Base */}
        <path
          d="M 54 9 C 79 9 99 29 99 54 C 99 79 79 99 54 99 C 44.5 99 35.8 96.1 28.5 91.2 L 13.5 95.4 L 18.2 80.8 C 12.4 73.2 9 64 9 54 C 9 29 29 9 54 9 Z"
          fill="url(#smGradFallback)"
        />
        {/* ECG Heartbeat Wave */}
        <path
          d="M 22 54 L 38 54 L 43 43 L 49 67 L 56 27 L 63 77 L 70 48 L 75 58 L 80 54 L 86 54"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="56" cy="27" r="3" fill="#38BDF8" />
      </svg>

      {showText && (
        <div className="flex flex-col">
          <span className="text-sm font-black tracking-tight leading-none text-slate-900">
            Second<span className="text-sky-600">Medic</span>
          </span>
          <span className="text-[9px] font-bold tracking-widest text-slate-500 uppercase leading-tight">
            VialTrack
          </span>
        </div>
      )}
    </div>
  );
};
