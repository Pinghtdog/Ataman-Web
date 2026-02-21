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
  BarChart3,
  PhoneIncoming,
  AlertCircle,
  ShieldCheck,
  LogOut,
  ChevronDown,
  Activity,
  UserPlus,
} from "lucide-react";

const DashboardLayout = () => {
  // Removed { userRole } prop (we fetch it internally now)
  const location = useLocation();
  const navigate = useNavigate();

  const [userName, setUserName] = useState("Staff");
  const [userRole, setUserRole] = useState(null); // <--- NEW: Local Role State
  const [hospitalCode, setHospitalCode] = useState("NCGH");
  const [myFacility, setMyFacility] = useState({
    id: null,
    name: "Loading...",
  });
  const [overallOccupancy, setOverallOccupancy] = useState(0);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  // --- LOGIC: Fetch Occupancy for THIS facility only ---
  const fetchOccupancy = async (fId) => {
    if (!fId) return;
    const { data } = await supabase
      .from("beds")
      .select("status")
      .eq("facility_id", fId);

    if (data && data.length > 0) {
      const occupied = data.filter((b) => b.status === "occupied").length;
      setOverallOccupancy(Math.round((occupied / data.length) * 100));
    } else {
      setOverallOccupancy(0);
    }
  };

  useEffect(() => {
    const fetchUserAndFacility = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        // A. Fetch Name
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

        // B. Fetch Facility Info AND Role
        const { data: staffData } = await supabase
          .from("facility_staff")
          .select(`role, facility_id, facilities ( name, short_code )`) // <--- Added 'role' to query
          .eq("user_id", user.id)
          .maybeSingle();

        if (staffData?.facilities) {
          const fId = staffData.facility_id;

          // Set Role & Facility
          setUserRole(staffData.role); // <--- Store Role
          setHospitalCode(staffData.facilities.short_code);
          setMyFacility({ id: fId, name: staffData.facilities.name });

          // C. Initial Load & Subscription
          fetchOccupancy(fId);

          const channel = supabase
            .channel(`global-status-${fId}`)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "beds",
                filter: `facility_id=eq.${fId}`,
              },
              () => fetchOccupancy(fId),
            )
            .subscribe();

          return () => supabase.removeChannel(channel);
        }
      }
    };

    fetchUserAndFacility();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  // --- DYNAMIC NAVIGATION MENU ---
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
    // { name: "Telemedicine Hub", path: "/telemed", icon: <MapIcon size={18} /> },
    {
      name: "Digital Charting",
      path: "/charting",
      icon: <FileText size={18} />,
    },

     {
      name: "Medical Records",
      path: "/medical-records",
      icon: <FileText size={18} />,
    },

    // --- CONDITIONALLY ADD DOCTOR CONSOLE ---
    ...(userRole === "DOCTOR"
      ? [
          {
            name: "Doctor Console",
            path: "/consultations",
            icon: <Stethoscope size={18} />, // Added color to distinguish
          },
        ]
      : []),

    {
      name: "Assisted Booking",
      path: "/assisted-booking",
      icon: <UserPlus size={18} />,
    },
    { name: "Analytics", path: "/analytics", icon: <BarChart3 size={18} /> },
    { name: "Settings", path: "/settings", icon: <Settings size={18} /> },
  ];

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
    <div className="flex h-screen w-screen bg-[#F8FAFC] overflow-hidden font-sans">
      {/* SIDEBAR */}
      <aside className="w-64 bg-[#00695C] text-white flex flex-col flex-shrink-0 shadow-2xl z-20">
        {/* SIDEBAR BRAND SECTION */}
        <div className="brand p-8 mb-2 group cursor-default relative">
          <div className="flex items-center gap-4">
            {/* LOGO CONTAINER */}
            <div className="bg-white/10 p-2 rounded-2xl border border-white/5 shrink-0 transition-all duration-500 group-hover:bg-emerald-500 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]">
              <img
                src="/AtamanLogo.png"
                alt="ATAMAN Logo"
                className="w-10 h-10 object-contain transition-transform duration-1000 group-hover:rotate-[360deg]"
              />
            </div>

            {/* TEXT SECTION */}
            <div className="relative flex flex-col justify-center">
              <div className="flex items-center relative">
                <h1 className="text-xl font-bold tracking-tighter text-white leading-none m-0 z-10">
                  ATAMAN
                </h1>

                {/* THE EASTER EGG: Floating Reveal */}
                <div className="absolute left-full ml-4 pointer-events-none">
                  <div className="whitespace-nowrap bg-slate-900/80 backdrop-blur-md border border-white/10 px-4 py-2 rounded-2xl transition-all duration-700 ease-out opacity-0 translate-x-[-20px] group-hover:opacity-100 group-hover:translate-x-0 shadow-2xl">
                    <span className="text-[10px] font-medium text-emerald-400 tracking-widest uppercase italic">
                      Automated Telehealth & Medical Assistance Network
                    </span>
                  </div>
                </div>
              </div>

              {/* Subtitle */}
              <p className="text-[9px] font-bold text-teal-200 uppercase tracking-[0.2em] mt-2 opacity-60">
                {hospitalCode} COMMAND CENTER
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto no-scrollbar">
          {navItems.map((item) => (
            <Link
              key={item.name}
              to={item.path}
              className={`flex items-center px-4 py-3 rounded-xl transition-all text-sm font-medium ${
                location.pathname === item.path
                  ? "bg-[#80CBC4] text-[#004D40] shadow-lg shadow-teal-900/20 font-bold"
                  : "text-teal-50 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="ml-3 uppercase text-[10px] tracking-widest">
                {item.name}
              </span>
            </Link>
          ))}

          {userRole === "ADMIN" && (
            <>
              <div className="h-px bg-white/10 mx-4 my-4" />
              <Link
                to="/admin"
                className={`flex items-center px-4 py-3 rounded-xl transition-all text-[#FFD54F] ${
                  location.pathname === "/admin"
                    ? "bg-white/10 shadow-inner"
                    : "hover:bg-white/5"
                }`}
              >
                <ShieldCheck size={18} />
                <span className="ml-3 uppercase text-[10px] font-black tracking-widest italic">
                  Admin Dashboard
                </span>
              </Link>
            </>
          )}
        </nav>

        <div className="p-4 pb-8">
          <button
            onClick={handleLogout}
            className="flex items-center justify-center w-full py-4 rounded-2xl border border-white/10 text-teal-100 text-[10px] font-bold uppercase tracking-widest hover:bg-white/5 hover:text-white transition-all active:scale-95"
          >
            <LogOut size={16} className="mr-2" /> Logout
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* HEADER */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-10 shrink-0">
          <div className="flex-1">
            <h2 className="uppercase tracking-tight font-black text-slate-800 text-lg italic">
              {myFacility.name}
            </h2>
          </div>

          <div className="flex items-center gap-8">
            {/* STATUS PILL */}
            <div
              className="relative"
              onMouseEnter={() => setIsStatusOpen(true)}
              onMouseLeave={() => !isPinned && setIsStatusOpen(false)}
            >
              <button
                onClick={() => setIsPinned(!isPinned)}
                className={`flex items-center gap-2.5 px-5 py-1.5 rounded-full transition-all border ${status.bg} ${status.border} ${status.color} shadow-sm`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${overallOccupancy >= 90 ? "bg-red-600 animate-pulse" : status.color.replace("text", "bg")}`}
                />
                <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                  {status.label}: {overallOccupancy}%
                </span>
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-300 ${isStatusOpen ? "rotate-180" : ""}`}
                />
              </button>

              {/* Status Pop-out Card */}
              {(isStatusOpen || isPinned) && (
                <div className="absolute top-12 right-0 w-72 bg-white rounded-[2rem] shadow-2xl border border-slate-100 p-8 z-[100] animate-in slide-in-from-top-2 duration-300">
                  <div className="flex justify-between items-center mb-6">
                    <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                      Operational Load
                    </h4>
                    <Activity size={16} className={status.color} />
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className={`text-4xl font-black ${status.color}`}>
                      {overallOccupancy}%
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">
                      Real-time
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-6">
                    <div
                      className={`h-full transition-all duration-1000 ${status.color.replace("text", "bg")}`}
                      style={{ width: `${overallOccupancy}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed italic">
                    {overallOccupancy >= 90
                      ? "System Critical: Divert incoming low-acuity cases to local BHC nodes."
                      : "Handshake stable: Resources within normal operating parameters."}
                  </p>
                  <button
                    onClick={() => setIsPinned(!isPinned)}
                    className="w-full mt-6 pt-4 border-t border-slate-50 text-[10px] font-bold text-slate-300 uppercase tracking-widest hover:text-primary transition-colors"
                  >
                    {isPinned ? "Click to Unpin" : "Pin Open"}
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="block text-xs font-black text-slate-800 uppercase leading-none">
                  {userName}
                </span>
                {userRole === "ADMIN" && (
                  <span className="text-[8px] text-[#D97706] font-bold uppercase tracking-tighter mt-1 block">
                    Root Administrator
                  </span>
                )}
                {/* NEW: SHOW DOCTOR BADGE */}
                {userRole === "DOCTOR" && (
                  <span className="text-[8px] text-emerald-600 font-bold uppercase tracking-tighter mt-1 block">
                    Attending Physician
                  </span>
                )}
              </div>
              <div className="w-10 h-10 bg-slate-100 rounded-2xl border-2 border-white shadow-sm flex items-center justify-center text-slate-400 font-black">
                {userName[0]}
              </div>
              <button className="p-2 border border-slate-200 rounded-xl text-slate-400 hover:text-slate-900 transition-colors">
                <AlertCircle size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <main className="flex-1 overflow-y-auto custom-scrollbar relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
