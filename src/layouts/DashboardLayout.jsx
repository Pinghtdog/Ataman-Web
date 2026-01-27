import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { 
  LayoutDashboard, 
  BedDouble, 
  Map as MapIcon, 
  FileText, 
  Settings,
  Stethoscope,
  PhoneIncoming,
  AlertCircle,
  ShieldCheck, 
  LogOut       
} from 'lucide-react';
import './DashboardLayout.css';

const DashboardLayout = ({ userRole }) => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // State for dynamic data
  const [userName, setUserName] = useState('Staff'); 
  const [hospitalCode, setHospitalCode] = useState('NCGH'); // Default fallback

  useEffect(() => {
    const fetchUserAndFacility = async () => {
      // 1. Get current authenticated user
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // --- A. FETCH USER NAME ---
        const { data: userData } = await supabase
          .from('users')
          .select('first_name, last_name')
          .eq('id', user.id)
          .single();

        if (userData && userData.first_name && userData.last_name) {
          setUserName(`${userData.first_name} ${userData.last_name}`);
        } else {
          const emailName = user.email ? user.email.split('@')[0] : 'Staff';
          setUserName(emailName);
        }

        // --- B. FETCH HOSPITAL SHORT CODE (NEW) ---
        const { data: staffData } = await supabase
          .from('facility_staff')
          .select(`
            facility_id,
            facilities ( short_code )  // <--- Changed 'name' to 'short_code'
          `)
          .eq('user_id', user.id)
          .maybeSingle();

        if (staffData && staffData.facilities) {
          setHospitalCode(staffData.facilities.short_code);
        }
      }
    };

    fetchUserAndFacility();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/'); 
  };

  const navItems = [
    { name: 'Overview', path: '/', icon: <LayoutDashboard size={18} /> },
    { name: 'Bed Management', path: '/beds', icon: <BedDouble size={18} /> },
    { name: 'Referral Center', path: '/referrals', icon: <PhoneIncoming size={18} /> },
    { name: 'Service & Facilities', path: '/services', icon: <Stethoscope size={18} /> },
    { name: 'Telemedicine Hub', path: '/telemed', icon: <MapIcon size={18} /> },
    { name: 'Digital Charting', path: '/charting', icon: <FileText size={18} /> },
    { name: 'Settings', path: '/settings', icon: <Settings size={18} /> },
  ];

  const getCurrentTitle = () => {
    if (location.pathname === '/admin') return 'Admin Dashboard';
    return navItems.find(i => i.path === location.pathname)?.name || 'Dashboard Overview';
  };

  return (
    <div className="dashboard-container">
      
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand">
          <h1>A.T.A.M.A.N.</h1>
          {/* --- UPDATED: Uses Short Code --- */}
          <small>{hospitalCode} Command Center</small>
        </div>

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

          {userRole === 'ADMIN' && (
             <>
               <div style={{height: '1px', background: 'rgba(255,255,255,0.1)', margin: '10px 15px'}}></div>
               <Link 
                 to="/admin"
                 className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`}
                 style={{ color: '#FFD54F' }} 
               >
                 <span><ShieldCheck size={18} /></span>
                 <span className="link-text">Admin Dashboard</span>
               </Link>
             </>
          )}
        </nav>

        <div style={{ marginTop: 'auto', padding: '0 15px 20px 15px' }}>
          <button 
            onClick={handleLogout} 
            className="nav-link" 
            style={{ 
              background: 'transparent', 
              border: '1px solid rgba(255,255,255,0.2)', 
              width: '100%', 
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <span><LogOut size={18} /></span>
            <span className="link-text">Logout</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT WRAPPER */}
      <div className="main-wrapper">
        
        {/* HEADER */}
        <header className="top-header">
          <div className="header-title">
            <h2>{getCurrentTitle()}</h2>
          </div>

          <div className="search-box">
            <input type="text" placeholder="Search patients, doctors, records..." />
          </div>

          <div className="header-right">
            <div className="user-info">
              <span>Hi, {userName}</span>
              
              {userRole === 'ADMIN' && (
                <span style={{
                  fontSize: '0.7rem', background: '#FFD54F', color: 'black', 
                  padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', fontWeight: 'bold'
                }}>ADMIN</span>
              )}
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