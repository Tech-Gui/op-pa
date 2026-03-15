import React from 'react';
import { Search, Bell, ChevronDown } from 'lucide-react';

const TopBar = ({ userName = "Jack Grealish" }) => {
  return (
    <div className="top-bar">
      <div className="greeting-section">
        <p className="subtitle">Good Morning,</p>
        <h1 className="title">{userName}</h1>
      </div>

      <div className="search-section">
        <div className="search-wrapper">
          <Search size={20} className="search-icon" />
          <input type="text" placeholder="Search anything..." className="search-input" />
        </div>
        
        <button className="icon-button notification">
          <Bell size={20} />
          <span className="badge"></span>
        </button>

        <div className="user-profile">
          <img src="/assets/profile.png" alt="Profile" className="avatar" />
          <ChevronDown size={16} />
        </div>
      </div>

      <style jsx>{`
        .top-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
        }

        .subtitle {
          color: var(--text-secondary);
          font-size: 14px;
          margin-bottom: 4px;
        }

        .title {
          font-size: 28px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .search-section {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .search-wrapper {
          position: relative;
          width: 300px;
        }

        .search-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-secondary);
        }

        .search-input {
          width: 100%;
          padding: 12px 16px 12px 48px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          background: white;
          font-family: inherit;
          font-size: 14px;
          transition: border-color 0.2s;
        }

        .search-input:focus {
          outline: none;
          border-color: var(--accent-blue);
        }

        .icon-button {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          background: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          position: relative;
          color: var(--text-secondary);
        }

        .badge {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 8px;
          height: 8px;
          background: var(--accent-red);
          border-radius: 50%;
          border: 2px solid white;
        }

        .user-profile {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 8px;
          border-radius: 12px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .user-profile:hover {
          background: white;
        }

        .avatar {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          object-fit: cover;
        }
      `}</style>
    </div>
  );
};

export default TopBar;
