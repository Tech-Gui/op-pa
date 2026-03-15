import React from 'react';

const WaterTank = ({ level = 65, title = "Main Water Tank" }) => {
  // Ensure level is between 0 and 100
  const normalizedLevel = Math.min(Math.max(level, 0), 100);
  
  return (
    <div className="glass-card tank-container">
      <h3 className="tank-title">{title}</h3>
      <div className="tank-visual">
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
          <div className="reflection"></div>
        </div>
        <div className="percentage-display">
          <span className="value">{normalizedLevel}%</span>
          <span className="label">Full</span>
        </div>
      </div>

      <style jsx>{`
        .tank-container {
          padding: 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
        }

        .tank-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .tank-visual {
          position: relative;
          width: 140px;
          height: 200px;
        }

        .tank-body {
          position: absolute;
          width: 100%;
          height: 100%;
          background: rgba(226, 232, 240, 0.4);
          border: 3px solid #e2e8f0;
          border-radius: 20px 20px 24px 24px;
          overflow: hidden;
          box-shadow: inset 0 4px 10px rgba(0,0,0,0.05);
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
          top: -20px;
          left: 0;
          width: 200%;
          height: 40px;
          background: repeat-x;
        }

        .wave-front {
          background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 100" preserveAspectRatio="none"><path d="M0,50 C250,100 750,0 1000,50 L1000,100 L0,100 Z" fill="%233b82f6" opacity="0.6"/></svg>');
          animation: wave 4s linear infinite;
          z-index: 10;
        }

        .wave-back {
          background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 100" preserveAspectRatio="none"><path d="M0,50 C250,0 750,100 1000,50 L1000,100 L0,100 Z" fill="%232563eb" opacity="0.4"/></svg>');
          animation: wave 6s linear infinite reverse;
          z-index: 5;
        }

        @keyframes wave {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        .reflection {
          position: absolute;
          top: 10%;
          left: 10%;
          width: 20%;
          height: 40%;
          background: linear-gradient(to bottom, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 100%);
          border-radius: 20px;
          pointer-events: none;
        }

        .percentage-display {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          z-index: 20;
          text-shadow: 0 2px 4px rgba(0,0,0,0.1);
          color: var(--text-primary);
        }

        .value {
          font-size: 32px;
          font-weight: 700;
        }

        .label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          opacity: 0.7;
        }
      `}</style>
    </div>
  );
};

export default WaterTank;
