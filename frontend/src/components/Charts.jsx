import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from 'recharts';

const Charts = ({ waterData, weatherData }) => {
  const defaultWaterData = [
    { name: 'Mon', usage: 400 },
    { name: 'Tue', usage: 300 },
    { name: 'Wed', usage: 600 },
    { name: 'Thu', usage: 800 },
    { name: 'Fri', usage: 500 },
    { name: 'Sat', usage: 900 },
    { name: 'Sun', usage: 700 },
  ];

  const defaultWeatherData = [
    { time: '00:00', temp: 18, humid: 65 },
    { time: '04:00', temp: 16, humid: 70 },
    { time: '08:00', temp: 22, humid: 60 },
    { time: '12:00', temp: 28, humid: 45 },
    { time: '16:00', temp: 26, humid: 50 },
    { time: '20:00', temp: 21, humid: 55 },
  ];

  return (
    <div className="charts-grid">
      <div className="glass-card chart-card main-chart">
        <div className="chart-header">
          <h3 className="chart-title">Water Usage Statistics</h3>
          <select className="chart-select">
            <option>Last 7 days</option>
            <option>Last 30 days</option>
          </select>
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={waterData || defaultWaterData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} dx={-10} />
              <Tooltip 
                cursor={{fill: '#f3f4f6'}} 
                contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}}
              />
              <Bar dataKey="usage" fill="var(--bg-accent)" radius={[6, 6, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-sidebar-col">
        <div className="glass-card chart-card small-chart">
          <div className="chart-header">
            <h3 className="chart-title">Temperature Trend</h3>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={weatherData || defaultWeatherData}>
                <defs>
                  <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-orange)" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="var(--accent-orange)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Tooltip />
                <Area type="monotone" dataKey="temp" stroke="var(--accent-orange)" fillOpacity={1} fill="url(#colorTemp)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card chart-card small-chart">
          <div className="chart-header">
            <h3 className="chart-title">Humidity Level</h3>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={weatherData || defaultWeatherData}>
                <Tooltip />
                <Line type="monotone" dataKey="humid" stroke="var(--accent-blue)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <style jsx>{`
        .charts-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 24px;
        }

        .chart-card {
          padding: 24px;
        }

        .chart-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .chart-title {
          font-size: 18px;
          font-weight: 600;
        }

        .chart-select {
          padding: 6px 12px;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          font-size: 14px;
          background: white;
        }

        .chart-sidebar-col {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .chart-container {
          width: 100%;
        }

        @media (max-width: 1024px) {
          .charts-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default Charts;
