import React, { useState } from "react";

const Settings = () => {
  const [occupancyThreshold, setOccupancyThreshold] = useState(90);

  const staff = [
    { name: "Maria Santos, MD", role: "Doctor", access: "Tele-Ataman, Charts" },
    {
      name: "Admin User 1",
      role: "Administrator",
      access: "Full System Access",
    },
  ];

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">System Settings</h2>
      <p className="text-gray-500 mb-8">
        Manage staff access and automation rules.
      </p>

      {/* Section 1: Staff Management */}
      <div className="bg-white rounded-lg shadow mb-8 p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">
          Staff Management
        </h3>
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs text-gray-400 uppercase border-b">
              <th className="pb-3 font-medium">Name</th>
              <th className="pb-3 font-medium">Role</th>
              <th className="pb-3 font-medium">Access Level</th>
              <th className="pb-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {staff.map((s, i) => (
              <tr key={i}>
                <td className="py-4 text-gray-700">{s.name}</td>
                <td className="py-4 text-gray-700">{s.role}</td>
                <td className="py-4 text-gray-700">{s.access}</td>
                <td className="py-4 text-right">
                  <button className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1 rounded text-xs font-medium">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section 2: Automation Thresholds */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">
          Automation Thresholds
        </h3>

        <div className="border border-gray-100 rounded p-6">
          <label className="block text-gray-700 font-medium mb-1">
            Diversion Protocol Trigger
          </label>
          <p className="text-sm text-gray-500 mb-6">
            Automatically suggest BHCs when occupancy exceeds:
          </p>

          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="100"
              value={occupancyThreshold}
              onChange={(e) => setOccupancyThreshold(e.target.value)}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-red-500"
            />
            <span className="text-red-600 font-bold text-xl min-w-[3rem]">
              {occupancyThreshold}%
            </span>
          </div>

          <div className="flex justify-end mt-6">
            <button className="bg-[#00695C] text-white px-6 py-2 rounded font-medium hover:bg-[#004D40]">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
