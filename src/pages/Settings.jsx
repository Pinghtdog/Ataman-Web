import React, { useState, useEffect } from "react";
import { Save, UserCog, ShieldCheck, User } from "lucide-react";
import { supabase } from "../supabaseClient";

const Settings = () => {
  const [staff, setStaff] = useState([]);
  const [occupancyThreshold, setOccupancyThreshold] = useState(90);
  const [loading, setLoading] = useState(true);
  const [currentFacilityId, setCurrentFacilityId] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState("");

  useEffect(() => {
    const initializeSettings = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          console.error("No user logged in");
          setLoading(false);
          return;
        }

        const { data: staffRecord, error: staffError } = await supabase
          .from("facility_staff")
          .select("facility_id, role")
          .eq("user_id", user.id)
          .single();

        if (staffError || !staffRecord) {
          console.error(
            "User is not assigned to any facility in facility_staff table.",
          );
          setLoading(false);
          return;
        }

        setCurrentFacilityId(staffRecord.facility_id);
        setCurrentUserRole(staffRecord.role);

        await fetchSettingsData(staffRecord.facility_id);
      } catch (error) {
        console.error("Initialization Error:", error);
        setLoading(false);
      }
    };

    initializeSettings();
  }, []);

  const fetchSettingsData = async (facilityId) => {
    try {
      const { data: facilityData } = await supabase
        .from("facilities")
        .select("metadata")
        .eq("id", facilityId)
        .single();

      if (facilityData?.metadata?.diversion_threshold) {
        setOccupancyThreshold(facilityData.metadata.diversion_threshold);
      }

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

        const mergedStaff = staffData.map((staffMember) => {
          const userDetails = usersData?.find(
            (u) => u.id === staffMember.user_id,
          );
          return {
            ...staffMember,
            name: userDetails
              ? `${userDetails.first_name} ${userDetails.last_name}`
              : "Unknown User",
            email: userDetails?.email || "",
            access:
              staffMember.role === "ADMIN"
                ? "Full System Access"
                : "Tele-Ataman, Charts",
          };
        });
        setStaff(mergedStaff);
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveThreshold = async () => {
    if (!currentFacilityId) return;

    const { error } = await supabase
      .from("facilities")
      .update({
        metadata: { diversion_threshold: parseInt(occupancyThreshold) },
      })
      .eq("id", currentFacilityId);

    if (error) {
      alert("Error saving settings");
    } else {
      alert("Automation rules updated successfully!");
    }
  };

  if (loading)
    return (
      <div className="p-10 text-gray-500">
        Loading your facility settings...
      </div>
    );

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">System Settings</h2>
          <p className="text-gray-500">
            Manage staff access and automation rules.
          </p>
        </div>
        {currentUserRole === "ADMIN" && (
          <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-bold border border-green-200">
            YOU ARE ADMIN
          </span>
        )}
      </div>

      {/* SECTION 1: STAFF MANAGEMENT */}
      <div className="bg-white rounded-lg shadow mb-8 p-6 animate-fade-in">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <UserCog size={20} className="text-gray-600" /> Staff Management
        </h3>

        {staff.length === 0 ? (
          <div className="p-6 text-center border-2 border-dashed border-gray-200 rounded-lg">
            <p className="text-gray-400">
              No staff members found linked to this facility.
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Make sure you have added entries to the <b>facility_staff</b>{" "}
              table.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs text-gray-400 uppercase border-b bg-gray-50">
                  <th className="p-3 font-medium rounded-tl-lg">Name</th>
                  <th className="p-3 font-medium">Role</th>
                  <th className="p-3 font-medium">Access Level</th>
                  <th className="p-3 rounded-tr-lg"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {staff.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600">
                          <User size={16} />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{s.name}</p>
                          <p className="text-xs text-gray-500">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      {s.role === "ADMIN" ? (
                        <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs uppercase font-bold border border-purple-200">
                          <ShieldCheck size={12} /> ADMIN
                        </span>
                      ) : (
                        <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded text-xs uppercase font-bold border border-blue-100">
                          {s.role}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-gray-600 text-sm">{s.access}</td>
                    <td className="p-3 text-right">
                      <button className="text-gray-400 hover:text-blue-600 transition-colors">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 2: AUTOMATION THRESHOLDS */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">
          Automation Thresholds
        </h3>

        <div className="border border-gray-100 rounded p-6 bg-gray-50">
          <label className="block text-gray-700 font-medium mb-1">
            Diversion Protocol Trigger
          </label>
          <p className="text-sm text-gray-500 mb-6">
            Automatically suggest referring patients to BHCs when occupancy
            exceeds:
          </p>

          <div className="flex items-center gap-6">
            <input
              type="range"
              min="50"
              max="100"
              value={occupancyThreshold}
              onChange={(e) => setOccupancyThreshold(e.target.value)}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#00695C]"
            />
            <span className="text-[#00695C] font-bold text-3xl min-w-[4rem]">
              {occupancyThreshold}%
            </span>
          </div>

          <div className="flex justify-end mt-6">
            <button
              onClick={handleSaveThreshold}
              className="bg-[#00695C] text-white px-6 py-2 rounded font-medium hover:bg-[#004D40] flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
            >
              <Save size={18} /> Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
