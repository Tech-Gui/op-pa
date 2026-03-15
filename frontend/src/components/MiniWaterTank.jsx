import React from 'react';

export const MiniWaterTank = ({ value = 85 }) => {
  const normalizedLevel = Math.min(Math.max(value, 0), 100);
  
  return (
    <div className="mini-tank">
      <div className="tank-body">
        <div 
          className="water" 
          style={{ 
            height: `${normalizedLevel}%`,
            transition: 'height 1s ease-in-out'
          }}
        >
          <div className="wave wave-back"></div>
          <div className="wave wave-front"></div>
        </div>
      </div>
      <style jsx>{`
        .mini-tank {
          width: 24px;
          height: 32px;
          position: relative;
        }
        .tank-body {
          width: 100%;
          height: 100%;
          background: rgba(226, 232, 240, 0.4);
          border: 1.5px solid #e2e8f0;
          border-radius: 4px;
          overflow: hidden;
          position: relative;
        }
        .water {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
        }
        .wave {
          position: absolute;
          top: -10px;
          left: 0;
          width: 200%;
          height: 20px;
          background: repeat-x;
        }
        .wave-front {
          background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 100" preserveAspectRatio="none"><path d="M0,50 C250,100 750,0 1000,50 L1000,100 L0,100 Z" fill="%233b82f6" opacity="0.6"/></svg>');
          animation: wave-mini 2s linear infinite;
        }
        .wave-back {
          background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 100" preserveAspectRatio="none"><path d="M0,50 C250,0 750,100 1000,50 L1000,100 L0,100 Z" fill="%232563eb" opacity="0.4"/></svg>');
          animation: wave-mini 3s linear infinite reverse;
        }
        @keyframes wave-mini {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
};
