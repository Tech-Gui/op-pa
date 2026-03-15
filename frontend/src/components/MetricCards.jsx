import React from 'react';
import { MiniWaterTank } from './MiniWaterTank';
import { AnimatedTemp, AnimatedHumidity, AnimatedUV } from './AnimatedMetrics';

const MetricCard = ({ visual: Visual, title, value, unit, trend, color, isStatic = false, icon: Icon }) => {
  return (
    <div className="glass-card metric-card">
      <div className={`icon-wrapper ${color}`}>
        {isStatic ? <Icon size={24} /> : <Visual value={parseFloat(value)} />}
      </div>
      <div className="metric-content">
        <p className="metric-title">{title}</p>
        <div className="metric-value-row">
          <h3 className="metric-value">{value}</h3>
          <span className="metric-unit">{unit}</span>
        </div>
      </div>

      <style jsx>{`
        .metric-card {
          display: flex;
          align-items: center;
          gap: 20px;
          padding: 20px;
          flex: 1;
          min-width: 200px;
        }

        .icon-wrapper {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .icon-wrapper.green { background: #ecfdf5; color: #10b981; }
        .icon-wrapper.blue { background: #eff6ff; color: #3b82f6; }
        .icon-wrapper.orange { background: #fff7ed; color: #f59e0b; }
        .icon-wrapper.purple { background: #f5f3ff; color: #8b5cf6; }

        .metric-content {
          display: flex;
          flex-direction: column;
        }

        .metric-title {
          font-size: 14px;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }

        .metric-value-row {
          display: flex;
          align-items: baseline;
          gap: 4px;
        }

        .metric-value {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .metric-unit {
          font-size: 14px;
          color: var(--text-secondary);
        }

      `}</style>
    </div>
  );
};

const MetricCards = ({ data }) => {
  return (
    <div className="metric-cards-container">
      <MetricCard 
        visual={MiniWaterTank} 
        title="Water Level" 
        value={data?.waterLevel || "85"} 
        unit="%" 
        color="blue"
      />
      <MetricCard 
        visual={AnimatedTemp} 
        title="Avg Temp" 
        value={data?.temperature || "24.5"} 
        unit="°C" 
        color="orange"
      />
      <MetricCard 
        visual={AnimatedHumidity} 
        title="Humidity" 
        value={data?.humidity || "62"} 
        unit="%" 
        color="blue"
      />
      <MetricCard 
        visual={AnimatedUV} 
        title="UV Index" 
        value={data?.uvIndex || "4.2"} 
        unit="Index" 
        color="purple"
      />

      <style jsx>{`
        .metric-cards-container {
          display: flex;
          gap: 24px;
          flex-wrap: wrap;
        }
      `}</style>
    </div>
  );
};

export default MetricCards;
