import React from 'react';
import { 
  LayoutDashboard, 
  BarChart3, 
  Settings, 
  PlusCircle, 
  Moon, 
  Sun, 
  LogOut,
  Droplet,
  Thermometer,
  Cloud,
  Zap,
  Home
} from 'lucide-react';

const Sidebar = ({ activePage, setActivePage }) => {
  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'analytics', icon: BarChart3, label: 'Analytics' },
    { id: 'sensors', icon: PlusCircle, label: 'Add Sensor' },
    { id: 'automation', icon: Settings, label: 'Automation' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-circle">
          <Zap size={28} color="white" fill="white" />
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-menu">
          {menuItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => setActivePage(item.id)}
              title={item.label}
            >
              <item.icon size={24} />
            </button>
          ))}
        </div>
        <button className="nav-item theme-toggle" title="Toggle Theme">
          <Sun size={24} />
        </button>
      </nav>

      <div className="sidebar-footer">
        <button className="nav-item logout" title="Logout">
          <LogOut size={24} />
        </button>
      </div>

      <style jsx>{`
        .sidebar {
          position: fixed;
          left: 0;
          top: 0;
          bottom: 0;
          width: var(--sidebar-width);
          background: var(--bg-sidebar);
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 32px 0;
          border-right: 1px solid #e5e7eb;
          z-index: 100;
        }

        .sidebar-logo {
          margin-bottom: 48px;
        }

        .logo-circle {
          width: 56px;
          height: 56px;
          background: var(--bg-accent);
          border-radius: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 16px rgba(17, 24, 39, 0.2);
        }

        .sidebar-nav {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
        }

        .nav-item {
          width: 48px;
          height: 48px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .nav-item:hover {
          background: #f3f4f6;
          color: var(--text-primary);
        }

        .nav-item.active {
          background: #f3f4f6;
          color: var(--text-primary);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }

        .nav-item.theme-toggle {
          margin-top: auto;
          color: var(--accent-orange);
        }

        .sidebar-footer {
          margin-top: auto;
        }

        .logout {
          color: var(--text-secondary);
        }

        .logout:hover {
          color: var(--accent-red);
          background: #fee2e2;
        }
      `}</style>
    </aside>
  );
};

export default Sidebar;
