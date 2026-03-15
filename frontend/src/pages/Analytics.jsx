import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { 
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { Download, Calendar, Filter, FileSpreadsheet } from 'lucide-react';

const Analytics = () => {
  const [timeRange, setTimeRange] = useState('Week');
  
  // Mock detailed history data
  const historyData = [
    { name: 'Mon', soil: 45, water: 80, temp: 22 },
    { name: 'Tue', soil: 42, water: 75, temp: 24 },
    { name: 'Wed', soil: 55, water: 70, temp: 21 },
    { name: 'Thu', soil: 50, water: 90, temp: 23 },
    { name: 'Fri', soil: 48, water: 85, temp: 25 },
    { name: 'Sat', soil: 60, water: 65, temp: 22 },
    { name: 'Sun', soil: 58, water: 60, temp: 20 },
  ];

  const exportToExcel = () => {
    try {
      // Prepare data for export
      const exportData = historyData.map(item => ({
        'Day': item.name,
        'Soil Moisture (%)': item.soil,
        'Water Level (%)': item.water,
        'Temperature (°C)': item.temp
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Sensor Data");
      
      // Generate buffer
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
      
      saveAs(data, `SmartFarm_Analytics_${new Date().toLocaleDateString()}.xlsx`);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export data to Excel.");
    }
  };

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <div className="header-text">
          <h1>Analytics Insights</h1>
          <p>Deep dive into your farm's performance data</p>
        </div>
        <div className="header-actions">
          <div className="time-filter">
            <Calendar size={18} />
            <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
              <option>Day</option>
              <option>Week</option>
              <option>Month</option>
            </select>
          </div>
          <button className="export-btn" onClick={exportToExcel}>
            <FileSpreadsheet size={18} />
            Export to Excel
          </button>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="glass-card chart-large">
          <div className="chart-header">
            <h3>Soil Moisture vs Water Level</h3>
            <p>Correlation between irrigation and reservoir capacity</p>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={historyData}>
                <defs>
                  <linearGradient id="colorSoil" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorWater" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip 
                  contentStyle={{ background: 'rgba(26, 31, 43, 0.9)', border: 'none', borderRadius: '12px', color: '#fff' }}
                />
                <Legend />
                <Area type="monotone" dataKey="soil" name="Soil Moisture" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorSoil)" />
                <Area type="monotone" dataKey="water" name="Water Level" stroke="#3b82f6" fillOpacity={1} fill="url(#colorWater)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card chart-medium">
          <div className="chart-header">
            <h3>Temperature Volatility</h3>
            <p>Thermal stability over the selected period</p>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={historyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip 
                  contentStyle={{ background: 'rgba(26, 31, 43, 0.9)', border: 'none', borderRadius: '12px', color: '#fff' }}
                />
                <Line type="monotone" dataKey="temp" name="Temp °C" stroke="#f59e0b" strokeWidth={3} dot={{ fill: '#f59e0b' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <style jsx>{`
        .analytics-page {
          display: flex;
          flex-direction: column;
          gap: 32px;
          animation: fadeIn 0.5s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .analytics-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .header-text h1 {
          font-size: 28px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .header-text p {
          color: var(--text-secondary);
        }

        .header-actions {
          display: flex;
          gap: 16px;
        }

        .time-filter {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 8px 16px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          color: white;
        }

        .time-filter select {
          background: transparent;
          border: none;
          color: white;
          outline: none;
          cursor: pointer;
          font-weight: 500;
        }

        .export-btn {
          background: var(--accent-blue);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .export-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .analytics-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 24px;
        }

        .chart-large, .chart-medium {
          padding: 24px;
          background: var(--glass-background);
          backdrop-filter: blur(12px);
          border: 1px solid var(--glass-border);
          border-radius: 24px;
        }

        .chart-header {
          margin-bottom: 24px;
        }

        .chart-header h3 {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .chart-header p {
          font-size: 14px;
          color: var(--text-secondary);
        }

        .chart-container {
          width: 100%;
        }

        @media (max-width: 1024px) {
          .analytics-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default Analytics;
