import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import './Sidebar.css'; 
import { 
  LayoutDashboard, 
  Bed, 
  PhoneIncoming, 
  Stethoscope, 
  Activity, 
  FileText, 
  Settings, 
  LogOut 
} from 'lucide-react'; 

const Sidebar = ({ userRole }) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1 className="brand-title">A.T.A.M.A.N.</h1>
        <p className="brand-subtitle">NCGH Command Center</p>
      </div>

      <nav className="nav-menu">
        
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <LayoutDashboard size={20} />
          <span>Overview</span>
        </NavLink>

        <NavLink to="/beds" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Bed size={20} />
          <span>Bed Management</span>
        </NavLink>

        <NavLink to="/referrals" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <PhoneIncoming size={20} />
          <span>Referral Center</span>
        </NavLink>

        <NavLink to="/services" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Stethoscope size={20} />
          <span>Service & Facilities</span>
        </NavLink>

        <NavLink to="/telemed" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Activity size={20} />
          <span>Telemedicine Hub</span>
        </NavLink>

        <NavLink to="/charting" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <FileText size={20} />
          <span>Digital Charting</span>
        </NavLink>

        {userRole === 'ADMIN' && (
          <div className="admin-section">
            <div className="divider"></div>
            <NavLink to="/admin" className={({ isActive }) => `nav-item admin-link ${isActive ? 'active' : ''}`}>
              <Settings size={20} />
              <span>Admin Dashboard</span>
            </NavLink>
          </div>
        )}
      </nav>

      <div className="sidebar-footer">
        <button onClick={handleLogout} className="nav-item logout-btn">
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;