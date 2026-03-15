import React from 'react';
import { ArrowUp, ArrowDown, MoreVertical } from 'lucide-react';

const MonitoringTable = ({ sensors = [] }) => {
  const defaultSensors = [
    { id: 'SN-001', name: 'Soil Zone A', type: 'Moisture', value: '65%', status: 'optimal', time: '06:50 AM' },
    { id: 'SN-002', name: 'Water Tank 1', type: 'Level', value: '420L', status: 'low', time: '10:20 PM' },
    { id: 'SN-003', name: 'Env Node 1', type: 'Humidity', value: '72%', status: 'optimal', time: '12:20 AM' },
    { id: 'SN-004', name: 'Pump Relay 1', type: 'Control', value: 'Active', status: 'running', time: '07:45 AM' },
  ];

  const displaySensors = sensors.length > 0 ? sensors : defaultSensors;

  return (
    <div className="glass-card monitoring-section">
      <div className="table-header">
        <h3 className="section-title">Sensor Monitoring</h3>
        <div className="location-tag">
          <span className="dot"></span>
          Station Meteo Ribicos
        </div>
      </div>

      <table className="monitoring-table">
        <thead>
          <tr>
            <th>Sensor ID</th>
            <th>Type</th>
            <th>Value</th>
            <th>Status</th>
            <th>Last Read</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {displaySensors.map((item, index) => (
            <tr key={index}>
              <td className="sensor-name">{item.name}</td>
              <td className="sensor-type">{item.type}</td>
              <td className="sensor-value">{item.value}</td>
              <td>
                <span className={`status-badge ${item.status}`}>
                  {item.status === 'optimal' || item.status === 'running' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                  {item.status}
                </span>
              </td>
              <td className="sensor-time">{item.time}</td>
              <td>
                <button className="action-button">
                  <MoreVertical size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <style jsx>{`
        .monitoring-section {
          padding: 24px;
        }

        .table-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .section-title {
          font-size: 18px;
          font-weight: 600;
        }

        .location-tag {
          font-size: 13px;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          gap: 6px;
          background: #f3f4f6;
          padding: 4px 12px;
          border-radius: 20px;
        }

        .dot {
          width: 6px;
          height: 6px;
          background: var(--accent-green);
          border-radius: 50%;
        }

        .monitoring-table {
          width: 100%;
          border-collapse: collapse;
        }

        .monitoring-table th {
          text-align: left;
          padding: 12px 16px;
          font-size: 12px;
          text-transform: uppercase;
          color: var(--text-secondary);
          letter-spacing: 0.05em;
          border-bottom: 1px solid #e5e7eb;
        }

        .monitoring-table td {
          padding: 16px;
          font-size: 14px;
          border-bottom: 1px solid #f3f4f6;
        }

        .sensor-name {
          font-weight: 500;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          text-transform: capitalize;
        }

        .status-badge.optimal, .status-badge.running {
          background: #ecfdf5;
          color: #10b981;
        }

        .status-badge.low, .status-badge.warning {
          background: #fef2f2;
          color: #ef4444;
        }

        .action-button {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
        }

        .action-button:hover {
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
};

export default MonitoringTable;
