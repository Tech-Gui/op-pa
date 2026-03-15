import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import MetricCards from './components/MetricCards';
import Charts from './components/Charts';
import MonitoringTable from './components/MonitoringTable';
import WeatherWidget from './components/WeatherWidget';
import WaterTank from './components/WaterTank';
import './App.css';

const Analytics = React.lazy(() => import('./pages/Analytics'));

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

                  <div className="glass-card automation-card" style={{ marginTop: '24px' }}>
                    <h3 className="card-title">Quick Automation</h3>
                    <div className="toggle-item">
                      <span>Auto Irrigation</span>
                      <input type="checkbox" defaultChecked />
                    </div>
                    <div className="toggle-item">
                      <span>Pump Override</span>
                      <input type="checkbox" />
                    </div>
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

        .toggle-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid #f3f4f6;
        }

        .toggle-item:last-child {
          border-bottom: none;
        }

        .toggle-item span {
          font-size: 14px;
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}

export default App;
