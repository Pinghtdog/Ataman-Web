import React, { useState, useEffect } from "react";
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
  ChevronDown,
  Activity,
  UserPlus,
} from "lucide-react";
import "./DashboardLayout.css";

const DashboardLayout = ({ userRole }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const [userName, setUserName] = useState("Staff");
  const [hospitalCode, setHospitalCode] = useState("NCGH");

  const [overallOccupancy, setOverallOccupancy] = useState(0);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const fetchOccupancy = async () => {
    const { data } = await supabase.from("beds").select("status");
    if (data && data.length > 0) {
      const occupied = data.filter((b) => b.status === "occupied").length;
      setOverallOccupancy(Math.round((occupied / data.length) * 100));
    }
  };

  useEffect(() => {
    const fetchUserAndFacility = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: userData } = await supabase
          .from("users")
          .select("first_name, last_name")
          .eq("id", user.id)
          .single();

        if (userData?.first_name) {
          setUserName(`${userData.first_name} ${userData.last_name}`);
        } else {
          setUserName(user.email?.split("@")[0] || "Staff");
        }

        const { data: staffData } = await supabase
          .from("facility_staff")
          .select(`facility_id, facilities ( short_code )`)
          .eq("user_id", user.id)
          .maybeSingle();

        if (staffData?.facilities) {
          setHospitalCode(staffData.facilities.short_code);
        }
      }
    };

    fetchUserAndFacility();
    fetchOccupancy();

    const channel = supabase
      .channel("global-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "beds" },
        fetchOccupancy,
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

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
    {
      name: "Assisted Booking",
      path: "/assisted-booking",
      icon: <UserPlus size={18} />,
    },
    { name: "Settings", path: "/settings", icon: <Settings size={18} /> },
  ];

  const getCurrentTitle = () => {
    if (location.pathname === "/admin") return "Admin Dashboard";
    return (
      navItems.find((i) => i.path === location.pathname)?.name ||
      "Dashboard Overview"
    );
  };

  const getStatusConfig = () => {
    if (overallOccupancy >= 90)
      return {
        color: "text-red-600",
        bg: "bg-red-50",
        border: "border-red-100",
        label: "Critical",
      };
    if (overallOccupancy >= 70)
      return {
        color: "text-orange-500",
        bg: "bg-orange-50",
        border: "border-orange-100",
        label: "Warning",
      };
    return {
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      label: "Normal",
    };
  };

  const status = getStatusConfig();

  return (
    <div className="dashboard-container">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand">
          <h1>ATAMAN</h1>
          <small>{hospitalCode} Command Center</small>
        </div>

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

          {userRole === "ADMIN" && (
            <>
              <div
                style={{
                  height: "1px",
                  background: "rgba(255,255,255,0.1)",
                  margin: "10px 15px",
                }}
              />
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

        <div style={{ marginTop: "auto", padding: "0 15px 20px 15px" }}>
          <button
            onClick={handleLogout}
            className="nav-link logout-btn-sidebar"
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
        <header className="top-header">
          <div className="header-title">
            <h2>{getCurrentTitle()}</h2>
          </div>

          <div className="header-right flex items-center gap-6">
            <div
              className="relative"
              onMouseEnter={() => setIsStatusOpen(true)}
              onMouseLeave={() => !isPinned && setIsStatusOpen(false)}
            >
              <button
                onClick={() => setIsPinned(!isPinned)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full transition-all border ${status.bg} ${status.border} ${status.color}`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${overallOccupancy >= 90 ? "bg-red-600 animate-pulse" : status.color.replace("text", "bg")}`}
                />
                <span className="text-[10px] font-bold uppercase tracking-widest leading-none">
                  {status.label}: {overallOccupancy}%
                </span>
                <ChevronDown
                  size={12}
                  className={`transition-transform ${isStatusOpen ? "rotate-180" : ""}`}
                />
              </button>

              {/* Status Details Card */}
              {(isStatusOpen || isPinned) && (
                <div className="absolute top-12 right-0 w-64 bg-white rounded-3xl shadow-2xl border border-gray-100 p-6 z-[100] animate-in slide-in-from-top-2 duration-200">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em]">
                      Operational Load
                    </h4>
                    <Activity size={14} className={status.color} />
                  </div>

                  <div className="flex items-baseline gap-2 mb-1">
                    <span className={`text-3xl font-black ${status.color}`}>
                      {overallOccupancy}%
                    </span>
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                      Capacity
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mb-4">
                    <div
                      className={`h-full transition-all duration-1000 ${status.color.replace("text", "bg")}`}
                      style={{ width: `${overallOccupancy}%` }}
                    />
                  </div>

                  <p className="text-[10px] text-gray-500 font-medium leading-relaxed italic">
                    {overallOccupancy >= 90
                      ? "Critical: Hospital is near maximum capacity. Diversion logic enabled."
                      : "Operating within normal parameters. Resource availability is stable."}
                  </p>

                  <button
                    onClick={() => setIsPinned(!isPinned)}
                    className="w-full mt-4 pt-3 border-t border-gray-50 text-[9px] font-bold text-gray-300 uppercase tracking-widest hover:text-primary transition-colors"
                  >
                    {isPinned ? "Click to Unpin" : "Click to Pin Open"}
                  </button>
                </div>
              )}
            </div>

            <div className="user-info flex items-center">
              <span className="font-medium text-gray-700">Hi, {userName}</span>
              {userRole === "ADMIN" && (
                <span className="ml-2 bg-[#FFD54F] text-black text-[10px] px-2 py-0.5 rounded font-bold uppercase">
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
