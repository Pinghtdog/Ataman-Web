import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  BedDouble, 
  Map as MapIcon, 
  FileText, 
  Settings,
  Stethoscope,
  PhoneIncoming,
  AlertCircle
} from 'lucide-react';
import './DashboardLayout.css';

const DashboardLayout = () => {
  const location = useLocation();

  // Nav items to match  image references
  const navItems = [
    { name: 'Overview', path: '/', icon: <LayoutDashboard size={18} /> },
    { name: 'Bed Management', path: '/beds', icon: <BedDouble size={18} /> },
    { name: 'Referral Center', path: '/referrals', icon: <PhoneIncoming size={18} /> },
    { name: 'Service & Facilities', path: '/services', icon: <Stethoscope size={18} /> },
    { name: 'Telemedicine Hub', path: '/telemed', icon: <MapIcon size={18} /> },
    { name: 'Digital Charting', path: '/charting', icon: <FileText size={18} /> },
    { name: 'Settings', path: '/settings', icon: <Settings size={18} /> },
  ];

  return (
    <div className="dashboard-container">
      
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand">
          <h1>A.T.A.M.A.N.</h1>
          <small>NCGH Command Center</small>
        </div>

        {/* Nav Links */}
        <nav className="nav-menu">
          {navItems.map((item) => (
            <Link 
              key={item.name} 
              to={item.path}
              className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
            >
              <span>{item.icon}</span>
              <span className="link-text">{item.name}</span>
            </Link>
          ))}
        </nav>
      </aside>

      {/* MAIN CONTENT WRAPPER */}
      <div className="main-wrapper">
        
        {/* HEADER */}
        <header className="top-header">
          <div className="header-title">
            <h2>{navItems.find(i => i.path === location.pathname)?.name || 'Dashboard Overview'}</h2>
          </div>

          <div className="search-box">
            <input type="text" placeholder="Search patients, doctors, records..." />
          </div>

          <div className="header-right">
            <div className="user-info">
              <span>Hi, Name</span>
            </div>
            <div className="avatar"></div>
            <button className="icon-btn">
              <AlertCircle size={18} />
            </button>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="page-content">
          <Outlet /> 
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;