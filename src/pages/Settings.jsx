import React, { useState, useEffect } from "react";
import { Save, UserCog, ShieldCheck, User, X } from "lucide-react";
import { supabase } from "../supabaseClient";

const Settings = () => {
  const [staff, setStaff] = useState([]);
  const [occupancyThreshold, setOccupancyThreshold] = useState(90);
  const [loading, setLoading] = useState(true);

  const [currentFacilityId, setCurrentFacilityId] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [newRole, setNewRole] = useState("");

  useEffect(() => {
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
          await fetchSettingsData(staffRecord.facility_id);
        }
      } catch (error) {
        console.error("Init Error:", error);
      }
    };
    initializeSettings();
  }, []);

  const fetchSettingsData = async (facilityId) => {
    try {
      // 1. Fetch Threshold
      const { data: facilityData } = await supabase
        .from("facilities")
        .select("metadata")
        .eq("id", facilityId)
        .single();
      if (facilityData?.metadata?.diversion_threshold) {
        setOccupancyThreshold(facilityData.metadata.diversion_threshold);
      }

      // 2. Fetch Staff
      const { data: staffData } = await supabase
        .from("facility_staff")
        .select("id, role, user_id")
        .eq("facility_id", facilityId);

      if (staffData && staffData.length > 0) {
        const userIds = staffData.map((s) => s.user_id);
        const { data: usersData } = await supabase
          .from("users")
          .select("id, first_name, last_name, email")
          .in("id", userIds);

        const mergedStaff = staffData.map((s) => {
          const u = usersData?.find((user) => user.id === s.user_id);
          return {
            ...s,
            name: u?.first_name
              ? `${u.first_name} ${u.last_name}`
              : "Unknown (Update Profile)",
            email: u?.email || "No Email",
            access:
              s.role === "ADMIN" ? "Full System Access" : "Tele-Ataman, Charts",
          };
        });
        setStaff(mergedStaff);
      }
      setLoading(false);
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  };

  const openEditModal = (staffMember) => {
    setSelectedStaff(staffMember);
    setNewRole(staffMember.role);
    setIsModalOpen(true);
  };

  const handleUpdateRole = async () => {
    if (!selectedStaff) return;

    const { error } = await supabase
      .from("facility_staff")
      .update({ role: newRole })
      .eq("id", selectedStaff.id);

    if (error) {
      alert("Failed to update role");
    } else {
      setStaff(
        staff.map((s) =>
          s.id === selectedStaff.id ? { ...s, role: newRole } : s,
        ),
      );
      setIsModalOpen(false);
      alert("Role updated successfully!");
    }
  };

  const handleSaveThreshold = async () => {
    if (!currentFacilityId) return;
    await supabase
      .from("facilities")
      .update({
        metadata: { diversion_threshold: parseInt(occupancyThreshold) },
      })
      .eq("id", currentFacilityId);
    alert("Automation rules updated!");
  };

  if (loading)
    return (
      <div className="p-10 text-gray-400 font-bold animate-pulse text-center">
        Loading Settings...
      </div>
    );

  return (
    <div className="p-8 bg-gray-50 min-h-screen relative">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">
          System Settings
        </h2>
        {currentUserRole === "ADMIN" && (
          <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-bold border border-green-200">
            YOU ARE ADMIN
          </span>
        )}
      </div>

      {/* STAFF TABLE */}
      <div className="bg-white rounded-lg shadow mb-8 p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <UserCog size={20} /> Staff Management
        </h3>
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs text-gray-400 uppercase border-b bg-gray-50">
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Role</th>
              <th className="p-3 font-medium">Access Level</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {staff.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="p-3">
                  <div className="font-medium text-gray-900">{s.name}</div>
                  <div className="text-xs text-gray-500">{s.email}</div>
                </td>
                <td className="p-3">
                  <span
                    className={`px-2 py-1 rounded text-xs uppercase font-bold border ${s.role === "ADMIN" ? "bg-purple-100 text-purple-700 border-purple-200" : "bg-blue-50 text-blue-600 border-blue-100"}`}
                  >
                    {s.role}
                  </span>
                </td>
                <td className="p-3 text-gray-600 text-sm">{s.access}</td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => openEditModal(s)}
                    className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* SECTION 2: AUTOMATION THRESHOLDS */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">
          Automation Thresholds
        </h3>

        <div className="border border-gray-100 rounded-2xl p-8 bg-gray-50/50">
          <div className="mb-6">
            <label className="block text-gray-700 font-bold text-lg mb-1">
              Diversion Protocol Trigger
            </label>
            <p className="text-sm text-gray-400">
              Automatically suggest BHCs when occupancy exceeds:
            </p>
          </div>

          <div className="flex items-center gap-6">
            {/* CUSTOM STYLED SLIDER */}
            <input
              type="range"
              min="0"
              max="100"
              value={occupancyThreshold}
              onChange={(e) => setOccupancyThreshold(e.target.value)}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none 
                [&::-webkit-slider-thumb]:w-6 
                [&::-webkit-slider-thumb]:h-6 
                [&::-webkit-slider-thumb]:rounded-full 
                [&::-webkit-slider-thumb]:bg-red-600
                [&::-webkit-slider-thumb]:border-4
                [&::-webkit-slider-thumb]:border-white
                [&::-webkit-slider-thumb]:shadow-lg
                transition-all duration-150"
              style={{
                background: `linear-gradient(to right, #DC2626 0%, #DC2626 ${occupancyThreshold}%, #E5E7EB ${occupancyThreshold}%, #E5E7EB 100%)`,
              }}
            />

            {/* RED PERCENTAGE TEXT */}
            <span className="text-red-600 font-black text-3xl min-w-[4rem]">
              {occupancyThreshold}%
            </span>
          </div>

          <div className="flex justify-end mt-8">
            <button
              onClick={handleSaveThreshold}
              className="bg-[#00695C] text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-[#004D40] shadow-lg shadow-teal-900/20 transition-all active:scale-95"
            >
              <Save size={20} />
              Save Changes
            </button>
          </div>
        </div>
      </div>

      {/* --- EDIT MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-96 p-6 animate-fade-in">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Edit Staff Role</h3>
              <button onClick={() => setIsModalOpen(false)}>
                <X size={20} className="text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Change permissions for <b>{selectedStaff?.name}</b>.
            </p>

            <label className="block text-sm font-bold text-gray-700 mb-2">
              Select Role
            </label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 mb-6 focus:outline-none focus:border-[#00695C]"
            >
              <option value="DOCTOR">DOCTOR</option>
              <option value="NURSE">NURSE</option>
              <option value="DISPATCHER">DISPATCHER</option>
              <option value="ADMIN">ADMIN</option>
            </select>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateRole}
                className="px-4 py-2 bg-[#00695C] text-white rounded hover:bg-[#004D40]"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
