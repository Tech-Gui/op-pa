import React from 'react';

export const AnimatedTemp = ({ value = 24.5 }) => {
  // Normalize temperature for visual height (range 0-50 C)
  const height = Math.min(Math.max((value / 50) * 100, 10), 90);
  
  return (
    <div className="anim-container temp">
      <div className="thermometer">
        <div className="tube">
          <div className="mercury" style={{ height: `${height}%` }}>
            <div className="bubble"></div>
          </div>
        </div>
        <div className="base"></div>
      </div>
      <style jsx>{`
        .anim-container {
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .thermometer {
          position: relative;
          width: 12px;
          height: 36px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .tube {
          width: 6px;
          height: 28px;
          background: #e5e7eb;
          border-radius: 3px;
          position: relative;
          overflow: hidden;
          border: 1px solid #d1d5db;
        }
        .mercury {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          background: #ef4444;
          transition: height 1s ease-in-out;
        }
        .bubble {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 4px;
          background: rgba(255,255,255,0.4);
          animation: pulse 2s infinite;
        }
        .base {
          width: 12px;
          height: 12px;
          background: #ef4444;
          border-radius: 50%;
          margin-top: -4px;
          border: 1px solid #dc2626;
        }
        @keyframes pulse {
          0% { opacity: 0.2; }
          50% { opacity: 0.8; }
          100% { opacity: 0.2; }
        }
      `}</style>
    </div>
  );
};

export const AnimatedHumidity = ({ value = 62 }) => {
  return (
    <div className="anim-container humidity">
      <div className="drop">
        <div className="wave"></div>
      </div>
      <style jsx>{`
        .anim-container {
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .drop {
          width: 24px;
          height: 24px;
          background: #3b82f6;
          border-radius: 50% 0 50% 50%;
          transform: rotate(-45deg);
          position: relative;
          animation: float 3s ease-in-out infinite;
          overflow: hidden;
        }
        .wave {
          position: absolute;
          bottom: -10px;
          left: -10px;
          width: 40px;
          height: 40px;
          background: rgba(255,255,255,0.2);
          border-radius: 40%;
          animation: rotate 4s linear infinite;
        }
        @keyframes float {
          0%, 100% { transform: rotate(-45deg) translateY(0); }
          50% { transform: rotate(-45deg) translateY(-5px); }
        }
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export const AnimatedUV = ({ value = 4.2 }) => {
  return (
    <div className="anim-container uv">
      <div className="sun">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="ray" style={{ transform: `rotate(${i * 45}deg)` }}></div>
        ))}
        <div className="core"></div>
      </div>
      <style jsx>{`
        .anim-container {
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .sun {
          position: relative;
          width: 20px;
          height: 20px;
          animation: sun-rotate 10s linear infinite;
        }
        .core {
          width: 100%;
          height: 100%;
          background: #f59e0b;
          border-radius: 50%;
          box-shadow: 0 0 10px #f59e0b;
          animation: sun-pulse 2s ease-in-out infinite;
        }
        .ray {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 2px;
          height: 30px;
          background: linear-gradient(to top, #f59e0b, transparent);
          transform-origin: top center;
          margin-left: -1px;
          margin-top: -15px;
        }
        @keyframes sun-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes sun-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
};
