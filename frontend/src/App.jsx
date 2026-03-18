import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import MetricCards from './components/MetricCards';
import Charts from './components/Charts';
import MonitoringTable from './components/MonitoringTable';
import WeatherWidget from './components/WeatherWidget';
import WaterTank from './components/WaterTank';
import { sensorsService } from './services/api';
import './App.css';

const Analytics = React.lazy(() => import('./pages/Analytics'));

// Your nRF9160 IMEI — update this to match your actual device
const SENSOR_ID = '350457794498948';

function SensorConfigPanel() {
  const [interval, setIntervalVal] = useState(60); // Seconds
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleIntervalChange = async (newValSec) => {
    setLoading(true);
    try {
      await sensorsService.setReportInterval(SENSOR_ID, newValSec);
      setIntervalVal(newValSec);
      showToast(`Reporting interval updated to ${newValSec / 60} min`);
    } catch {
      showToast('Failed to update interval', 'error');
    } finally {
      setLoading(prev => ({ ...prev, interval: false }));
      setLoading(false);
    }
  };

  return (
    <div className="glass-card sensor-config-card">
      <h3 className="card-title">⏲️ Data Interval</h3>
      
      {toast && (
        <div className={`toast-msg ${toast.type}`}>{toast.msg}</div>
      )}

      <div className="config-section">
        <p className="config-description">Customize how often the gateway reports new sensor data.</p>
        
        <div className="interval-display">
          <span className="current-interval">{interval / 60} min</span>
        </div>

        <input 
          type="range" 
          min="60" 
          max="3600" 
          step="60" 
          value={interval}
          className="interval-slider"
          onChange={(e) => setIntervalVal(parseInt(e.target.value))}
          disabled={loading}
        />

        <div className="slider-labels">
          <span>1 min</span>
          <span>60 min</span>
        </div>

        <button 
          className="apply-btn"
          onClick={() => handleIntervalChange(interval)}
          disabled={loading}
        >
          {loading ? 'Sending...' : 'Apply Interval'}
        </button>
      </div>
    </div>
  );
}

function PumpControlPanel() {
  const [waterPumpAuto, setWaterPumpAuto] = useState(true);
  const [irrigationAuto, setIrrigationAuto] = useState(true);
  const [waterPumpOn, setWaterPumpOn] = useState(false);
  const [irrigationOn, setIrrigationOn] = useState(false);
  const [loading, setLoading] = useState({});
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleAutomationToggle = async (target, currentVal) => {
    const newVal = !currentVal;
    const key = `auto_${target}`;
    setLoading(prev => ({ ...prev, [key]: true }));
    try {
      await sensorsService.setAutomation(SENSOR_ID, target, newVal);
      if (target === 'water_pump') setWaterPumpAuto(newVal);
      else setIrrigationAuto(newVal);
      showToast(`${target === 'water_pump' ? 'Water Tank' : 'Irrigation'} automation ${newVal ? 'enabled' : 'disabled'}`);
    } catch {
      showToast('Failed to update automation', 'error');
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handlePumpCommand = async (target, action) => {
    const key = `cmd_${target}`;
    setLoading(prev => ({ ...prev, [key]: true }));
    try {
      await sensorsService.sendPumpCommand(SENSOR_ID, action, target);
      if (target === 'water_pump') setWaterPumpOn(action === 'start');
      else setIrrigationOn(action === 'start');
      showToast(`${target === 'water_pump' ? 'Water Tank Pump' : 'Irrigation Pump'} ${action === 'start' ? 'ON' : 'OFF'}`);
    } catch {
      showToast('Failed to send command', 'error');
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div className="glass-card pump-control-card">
      <h3 className="card-title">⚙️ Pump Controls</h3>
      
      {toast && (
        <div className={`toast-msg ${toast.type}`}>{toast.msg}</div>
      )}

      {/* Water Tank Pump */}
      <div className="pump-section">
        <div className="pump-header">
          <div className="pump-label">
            <span className="pump-icon">💧</span>
            <span>Water Tank Pump</span>
          </div>
          <span className={`status-badge ${waterPumpOn ? 'on' : 'off'}`}>
            {waterPumpOn ? 'ON' : 'OFF'}
          </span>
        </div>

        <div className="toggle-row">
          <span className="toggle-label">Automation</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={waterPumpAuto}
              disabled={loading.auto_water_pump}
              onChange={() => handleAutomationToggle('water_pump', waterPumpAuto)}
            />
            <span className="slider"></span>
          </label>
        </div>

        {!waterPumpAuto && (
          <div className="manual-buttons">
            <button
              className={`pump-btn on ${waterPumpOn ? 'active' : ''}`}
              disabled={waterPumpOn || loading.cmd_water_pump}
              onClick={() => handlePumpCommand('water_pump', 'start')}
            >
              {loading.cmd_water_pump ? '...' : '▶ Turn ON'}
            </button>
            <button
              className={`pump-btn off ${!waterPumpOn ? 'active' : ''}`}
              disabled={!waterPumpOn || loading.cmd_water_pump}
              onClick={() => handlePumpCommand('water_pump', 'stop')}
            >
              {loading.cmd_water_pump ? '...' : '■ Turn OFF'}
            </button>
          </div>
        )}
      </div>

      <div className="pump-divider"></div>

      {/* Irrigation Pump */}
      <div className="pump-section">
        <div className="pump-header">
          <div className="pump-label">
            <span className="pump-icon">🌱</span>
            <span>Irrigation Pump</span>
          </div>
          <span className={`status-badge ${irrigationOn ? 'on' : 'off'}`}>
            {irrigationOn ? 'ON' : 'OFF'}
          </span>
        </div>

        <div className="toggle-row">
          <span className="toggle-label">Automation</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={irrigationAuto}
              disabled={loading.auto_irrigation}
              onChange={() => handleAutomationToggle('irrigation', irrigationAuto)}
            />
            <span className="slider"></span>
          </label>
        </div>

        {!irrigationAuto && (
          <div className="manual-buttons">
            <button
              className={`pump-btn on ${irrigationOn ? 'active' : ''}`}
              disabled={irrigationOn || loading.cmd_irrigation}
              onClick={() => handlePumpCommand('irrigation', 'start')}
            >
              {loading.cmd_irrigation ? '...' : '▶ Turn ON'}
            </button>
            <button
              className={`pump-btn off ${!irrigationOn ? 'active' : ''}`}
              disabled={!irrigationOn || loading.cmd_irrigation}
              onClick={() => handlePumpCommand('irrigation', 'stop')}
            >
              {loading.cmd_irrigation ? '...' : '■ Turn OFF'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [data, setData] = useState({
    metrics: null,
    waterUsage: null,
    weatherTrends: null,
    sensors: []
  });

  // Mock data fetching for initial render
  useEffect(() => {
    // In a real app, this would be sensorsService.getLatestReadings()
    console.log("Dashboard initialized");
  }, []);

  return (
    <div className="app-container">
      <Sidebar activePage={activePage} setActivePage={setActivePage} />
      
      <main className="main-content">
        <TopBar userName="Isaiah Chiraira" />
        
        <div className="content-area">
          {activePage === 'dashboard' ? (
            <div className="dashboard-container">
              <MetricCards data={data.metrics} />
              
              <div className="dashboard-grid">
                <div className="left-column">
                  <div className="charts-section">
                    <Charts 
                      waterData={data.waterUsage}
                      weatherData={data.weatherTrends}
                    />
                  </div>
                  
                  <div className="table-section" style={{ marginTop: '24px' }}>
                    <MonitoringTable sensors={data.sensors} />
                  </div>
                </div>
                
                <div className="right-column">
                  <WaterTank level={85} />
                  <div style={{ marginTop: '24px' }}>
                    <WeatherWidget />
                  </div>
                  
                  <div className="glass-card goal-card" style={{ marginTop: '24px' }}>
                    <div className="card-header">
                      <h3 className="card-title">Water Goal</h3>
                      <span className="goal-value">800L / 1000L</span>
                    </div>
                    <div className="progress-container">
                      <div className="progress-bar" style={{ width: '80%' }}></div>
                    </div>
                    <p className="goal-status">Good progress you're doing great!</p>
                  </div>

                  <div style={{ marginTop: '24px' }}>
                    <PumpControlPanel />
                  </div>

                  <div style={{ marginTop: '24px' }}>
                    <SensorConfigPanel />
                  </div>
                </div>
              </div>
            </div>
          ) : activePage === 'analytics' ? (
            <React.Suspense fallback={<div className="glass-card">Loading Analytics...</div>}>
              <Analytics />
            </React.Suspense>
          ) : (
            <div className="glass-card placeholder-page">
              <h2>{activePage.charAt(0).toUpperCase() + activePage.slice(1)} Coming Soon</h2>
              <p>This module is currently under development.</p>
            </div>
          )}
        </div>
      </main>

      <style jsx>{`
        .dashboard-container {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: 2.5fr 1fr;
          gap: 24px;
          align-items: start;
        }

        .left-column {
          display: flex;
          flex-direction: column;
        }

        .right-column {
          display: flex;
          flex-direction: column;
        }

        @media (max-width: 1200px) {
          .dashboard-grid {
            grid-template-columns: 1fr;
          }
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .card-title {
          font-size: 16px;
          font-weight: 600;
        }

        .goal-value {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .progress-container {
          width: 100%;
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 12px;
        }

        .progress-bar {
          height: 100%;
          background: linear-gradient(90deg, var(--accent-orange), #fcd34d);
          border-radius: 4px;
        }

        .goal-status {
          font-size: 13px;
          color: var(--accent-orange);
          background: #fff7ed;
          padding: 8px 12px;
          border-radius: 8px;
          text-align: center;
        }

        /* ── Pump Control Panel ── */
        .pump-control-card {
          padding: 20px;
        }

        .pump-section {
          padding: 8px 0;
        }

        .pump-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .pump-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 500;
          font-size: 14px;
        }

        .pump-icon {
          font-size: 18px;
        }

        .status-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .status-badge.on {
          background: #dcfce7;
          color: #15803d;
        }

        .status-badge.off {
          background: #f3f4f6;
          color: #6b7280;
        }

        .toggle-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 0;
        }

        .toggle-label {
          font-size: 13px;
          color: var(--text-secondary, #6b7280);
        }

        /* Toggle Switch */
        .switch {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
        }

        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .slider {
          position: absolute;
          cursor: pointer;
          inset: 0;
          background-color: #d1d5db;
          transition: 0.3s;
          border-radius: 24px;
        }

        .slider::before {
          content: "";
          position: absolute;
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: 0.3s;
          border-radius: 50%;
          box-shadow: 0 1px 3px rgba(0,0,0,0.15);
        }

        .switch input:checked + .slider {
          background: linear-gradient(135deg, #22c55e, #16a34a);
        }

        .switch input:checked + .slider::before {
          transform: translateX(20px);
        }

        .switch input:disabled + .slider {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Manual Buttons */
        .manual-buttons {
          display: flex;
          gap: 8px;
          margin-top: 10px;
          animation: slideDown 0.2s ease-out;
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .pump-btn {
          flex: 1;
          padding: 10px 0;
          border: none;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 0.3px;
        }

        .pump-btn.on {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: white;
        }

        .pump-btn.on:hover:not(:disabled) {
          box-shadow: 0 4px 12px rgba(34, 197, 94, 0.35);
          transform: translateY(-1px);
        }

        .pump-btn.off {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: white;
        }

        .pump-btn.off:hover:not(:disabled) {
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
          transform: translateY(-1px);
        }

        .pump-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .pump-btn.active {
          opacity: 0.45;
        }

        .pump-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, #e5e7eb, transparent);
          margin: 12px 0;
        }

        /* Toast */
        .toast-msg {
          font-size: 12px;
          padding: 8px 12px;
          border-radius: 8px;
          margin-bottom: 12px;
          text-align: center;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .toast-msg.success {
          background: #dcfce7;
          color: #15803d;
        }

        .toast-msg.error {
          background: #fee2e2;
          color: #dc2626;
        }

        /* ── Sensor Config Panel ── */
        .sensor-config-card {
          padding: 20px;
        }

        .config-description {
          font-size: 13px;
          color: var(--text-secondary, #6b7280);
          margin-bottom: 20px;
          line-height: 1.5;
        }

        .interval-display {
          text-align: center;
          margin-bottom: 12px;
        }

        .current-interval {
          font-size: 24px;
          font-weight: 700;
          color: var(--accent-blue);
        }

        .interval-slider {
          width: 100%;
          height: 6px;
          background: #e5e7eb;
          border-radius: 5px;
          outline: none;
          appearance: none;
          cursor: pointer;
        }

        .interval-slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          background: var(--accent-blue);
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .slider-labels {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: var(--text-secondary, #9ca3af);
          margin-top: 8px;
        }

        .apply-btn {
          width: 100%;
          margin-top: 24px;
          padding: 12px;
          background: var(--accent-blue);
          color: white;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .apply-btn:hover:not(:disabled) {
          filter: brightness(1.1);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .apply-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

export default App;
