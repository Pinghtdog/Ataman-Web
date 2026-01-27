import React from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
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
  LogOut,
} from "lucide-react";
import "./DashboardLayout.css";

// dashboard
const DashboardLayout = ({ userRole }) => {
  const location = useLocation();
  const navigate = useNavigate();

  //logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  // nav items
  const navItems = [
    { name: "Overview", path: "/", icon: <LayoutDashboard size={18} /> },
    { name: "Bed Management", path: "/beds", icon: <BedDouble size={18} /> },
    {
      name: "Referral Center",
      path: "/referrals",
      icon: <PhoneIncoming size={18} />,
    },
    {
      name: "Service & Facilities",
      path: "/services",
      icon: <Stethoscope size={18} />,
    },
    { name: "Telemedicine Hub", path: "/telemed", icon: <MapIcon size={18} /> },
    {
      name: "Digital Charting",
      path: "/charting",
      icon: <FileText size={18} />,
    },
    { name: "Settings", path: "/settings", icon: <Settings size={18} /> },
  ];

  // Helper to get current page title (including Admin page)
  const getCurrentTitle = () => {
    if (location.pathname === "/admin") return "Admin Dashboard";
    return (
      navItems.find((i) => i.path === location.pathname)?.name ||
      "Dashboard Overview"
    );
  };

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
              className={`nav-link ${location.pathname === item.path ? "active" : ""}`}
            >
              <span>{item.icon}</span>
              <span className="link-text">{item.name}</span>
            </Link>
          ))}

          {/* 3. CONDITIONAL ADMIN LINK */}
          {userRole === "ADMIN" && (
            <>
              <div
                style={{
                  height: "1px",
                  background: "rgba(255,255,255,0.1)",
                  margin: "10px 15px",
                }}
              ></div>
              <Link
                to="/admin"
                className={`nav-link ${location.pathname === "/admin" ? "active" : ""}`}
                style={{ color: "#FFD54F" }}
              >
                <span>
                  <ShieldCheck size={18} />
                </span>
                <span className="link-text">Admin Dashboard</span>
              </Link>
            </>
          )}
        </nav>

        {/* log out button */}
        <div style={{ marginTop: "auto", padding: "0 15px 20px 15px" }}>
          <button
            onClick={handleLogout}
            className="nav-link"
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.2)",
              width: "100%",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <span>
              <LogOut size={18} />
            </span>
            <span className="link-text">Logout</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT WRAPPER */}
      <div className="main-wrapper">
        {/* header */}
        <header className="top-header">
          <div className="header-title">
            <h2>{getCurrentTitle()}</h2>
          </div>

          {/* <div className="search-box">
            <input type="text" placeholder="Search patients, doctors, records..." />
          </div> */}

          <div className="header-right">
            <div className="user-info">
              <span>Hi, Staff</span>
              {userRole === "ADMIN" && (
                <span
                  style={{
                    fontSize: "0.7rem",
                    background: "#FFD54F",
                    color: "black",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    marginLeft: "8px",
                    fontWeight: "bold",
                  }}
                >
                  ADMIN
                </span>
              )}
            </div>
            <div className="avatar"></div>
            <button className="icon-btn">
              <AlertCircle size={18} />
            </button>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
