import React, { useState, useEffect } from "react";
import {
  Save,
  UserCog,
  ShieldCheck,
  User,
  X,
  Activity,
  Loader2,
} from "lucide-react";
import { supabase } from "../supabaseClient";

const Settings = () => {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentFacilityId, setCurrentFacilityId] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState("");
  const [overallOccupancy, setOverallOccupancy] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [newRole, setNewRole] = useState("");

  const initializeSettings = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: staffRecord } = await supabase
        .from("facility_staff")
        .select("facility_id, role")
        .eq("user_id", user.id)
        .single();
      if (staffRecord) {
        setCurrentFacilityId(staffRecord.facility_id);
        setCurrentUserRole(staffRecord.role);
        fetchSettingsData(staffRecord.facility_id);
        fetchOverallOccupancy(staffRecord.facility_id);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const fetchSettingsData = async (fid) => {
    const { data: staffData } = await supabase
      .from("facility_staff")
      .select(`id, role, user_id`)
      .eq("facility_id", fid);
    if (staffData && staffData.length > 0) {
      const userIds = staffData.map((s) => s.user_id);
      const { data: usersData } = await supabase
        .from("users")
        .select("id, first_name, last_name, email")
        .in("id", userIds);
      const merged = staffData.map((s) => ({
        ...s,
        name: usersData?.find((u) => u.id === s.user_id)?.first_name
          ? `${usersData.find((u) => u.id === s.user_id).first_name} ${usersData.find((u) => u.id === s.user_id).last_name}`
          : "Profile Pending",
        email: usersData?.find((u) => u.id === s.user_id)?.email || "N/A",
      }));
      setStaff(merged);
    }
    setLoading(false);
  };

  const fetchOverallOccupancy = async (fid) => {
    const { data } = await supabase
      .from("beds")
      .select("status")
      .eq("facility_id", fid);
    if (data?.length > 0) {
      const occupied = data.filter((b) => b.status === "occupied").length;
      setOverallOccupancy(Math.round((occupied / data.length) * 100));
    }
  };

  useEffect(() => {
    document.title = "Settings | ATAMAN";
    initializeSettings();
  }, []);

  const handleUpdateRole = async () => {
    if (!selectedStaff) return;
    const { error } = await supabase
      .from("facility_staff")
      .update({ role: newRole })
      .eq("id", selectedStaff.id);
    if (!error) {
      setStaff(
        staff.map((s) =>
          s.id === selectedStaff.id ? { ...s, role: newRole } : s,
        ),
      );
      setIsModalOpen(false);
    }
  };

  if (loading)
    return (
      <div className="h-screen flex items-center justify-center text-gray-400 font-bold text-[10px] tracking-widest uppercase">
        Initializing settings...
      </div>
    );

  return (
    <div className="p-12 bg-[#F8FAFC] min-h-screen font-sans">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-800 tracking-tighter leading-none">
            System Settings
          </h1>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">
            Node Configuration & Staff Registry
          </p>
        </div>
        {currentUserRole === "ADMIN" && (
          <div className="bg-emerald-50 text-emerald-600 px-6 py-2 rounded-2xl border border-emerald-100 flex items-center gap-2">
            <ShieldCheck size={16} />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              Administrator Node
            </span>
          </div>
        )}
      </div>

      <div className="space-y-10">
        {/* STAFF MANAGEMENT - Unified 12-column Grid style */}
        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight mb-8 px-2">
            Staff Management
          </h2>
          <div className="space-y-4">
            {staff.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-12 items-center bg-gray-50/50 rounded-[2.2rem] p-6 border border-slate-50 hover:bg-white hover:border-primary transition-all group"
              >
                <div className="col-span-4 flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-primary border border-slate-100 font-bold uppercase">
                    {s.name[0]}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm uppercase tracking-tight leading-none mb-1">
                      {s.name}
                    </p>
                    <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">
                      {s.email}
                    </p>
                  </div>
                </div>
                <div className="col-span-3">
                  <span
                    className={`px-4 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-widest border ${s.role === "ADMIN" ? "bg-primary text-white border-primary" : "bg-white text-slate-400 border-slate-200"}`}
                  >
                    {s.role}
                  </span>
                </div>
                <div className="col-span-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                  Facility Handshake Node
                </div>
                <div className="col-span-2 text-right">
                  <button
                    onClick={() => {
                      setSelectedStaff(s);
                      setNewRole(s.role);
                      setIsModalOpen(true);
                    }}
                    className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] hover:text-black"
                  >
                    Edit protocol
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* OPERATIONAL STATUS - Figma Styled */}
        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight mb-8 px-2">
            Operational Vitality
          </h2>
          <div className="border-2 border-dashed border-slate-100 rounded-[2.5rem] p-12 bg-gray-50/30">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mb-4">
              Live Facility Occupancy (Real-time)
            </p>
            <div className="flex items-center gap-10">
              <div className="flex-1 h-3 bg-white rounded-full relative overflow-visible shadow-inner">
                <div
                  className={`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ${overallOccupancy >= 90 ? "bg-red-600" : overallOccupancy >= 70 ? "bg-orange-500" : "bg-primary"}`}
                  style={{ width: `${overallOccupancy}%` }}
                >
                  <div
                    className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-7 h-7 border-4 border-white rounded-full shadow-lg transition-colors ${overallOccupancy >= 90 ? "bg-red-600" : overallOccupancy >= 70 ? "bg-orange-500" : "bg-primary"}`}
                  />
                </div>
              </div>
              <span
                className={`text-6xl font-black italic tracking-tighter ${overallOccupancy >= 90 ? "text-red-600" : "text-primary"}`}
              >
                {overallOccupancy}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] p-10 w-full max-w-sm shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-8 uppercase font-bold text-slate-800 tracking-tight leading-none">
              Modify Permissions{" "}
              <button onClick={() => setIsModalOpen(false)}>
                <X />
              </button>
            </div>
            <p className="text-xs font-medium text-slate-500 mb-6 uppercase tracking-widest">
              Updating role for{" "}
              <b className="text-slate-800">{selectedStaff?.name}</b>
            </p>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full bg-slate-50 p-5 rounded-2xl outline-none focus:ring-2 focus:ring-primary/20 text-sm font-bold uppercase tracking-widest mb-10 border-none appearance-none cursor-pointer"
            >
              <option value="DOCTOR">DOCTOR</option>
              <option value="NURSE">NURSE</option>
              <option value="DISPATCHER">DISPATCHER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            <div className="flex gap-4">
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest rounded-xl hover:bg-slate-50"
              >
                Abort
              </button>
              <button
                onClick={handleUpdateRole}
                className="flex-1 py-4 bg-primary text-white text-[10px] font-bold uppercase tracking-widest rounded-xl shadow-lg active:scale-95 transition-all"
              >
                Confirm Role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
