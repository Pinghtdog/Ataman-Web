import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import {
  CheckCircle,
  AlertTriangle,
  Trash2,
  RefreshCw,
  PlusCircle,
  LayoutGrid,
} from "lucide-react";

const AdminDashboard = () => {
  const [newBedLabel, setNewBedLabel] = useState("");
  const [wardType, setWardType] = useState("General");
  const [facilityId, setFacilityId] = useState(2);

  const [beds, setBeds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [modal, setModal] = useState({ show: false, type: "", message: "" });

  const fetchBeds = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("beds")
      .select("*")
      .order("bed_label", { ascending: true });

    if (error) console.error("Error fetching beds:", error);
    else setBeds(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchBeds();
  }, []);

  const handleAddBed = async (e) => {
    e.preventDefault();

    const { error } = await supabase.from("beds").insert([
      {
        bed_label: newBedLabel,
        status: "available",
        ward_type: wardType,
        facility_id: facilityId,
      },
    ]);

    if (error) {
      setModal({
        show: true,
        type: "error",
        message: "Error adding bed: " + error.message,
      });
    } else {
      setModal({
        show: true,
        type: "success",
        message: `Bed ${newBedLabel} successfully registered.`,
      });
      setNewBedLabel("");
      fetchBeds();
    }
  };

  const handleDeleteBed = async (id, label) => {
    if (
      !window.confirm(
        `Are you sure you want to permanently delete bed ${label}?`,
      )
    )
      return;

    const { error } = await supabase.from("beds").delete().eq("id", id);
    if (error) {
      setModal({
        show: true,
        type: "error",
        message: "Failed to delete: " + error.message,
      });
    } else {
      fetchBeds();
    }
  };

  return (
    <div className="p-10 bg-[#F8FAFC] min-h-screen">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">
          Admin Dashboard
        </h1>
        <p className="text-gray-500 text-sm font-medium">
          System Configuration & Asset Management
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-10 items-start">
        {/* --- SECTION 1: ADD NEW BED --- */}
        <div className="w-full lg:w-1/3 bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-2 bg-[#00695C]" />

          <div className="flex items-center gap-3 mb-8">
            <PlusCircle size={20} className="text-[#00695C] opacity-50" />
            <h2 className="text-lg font-bold text-gray-800 uppercase tracking-tight">
              Register New Asset
            </h2>
          </div>

          <form onSubmit={handleAddBed} className="space-y-6">
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block mb-2">
                Bed Label / ID
              </label>
              <input
                type="text"
                placeholder="e.g. ER-05"
                value={newBedLabel}
                onChange={(e) => setNewBedLabel(e.target.value)}
                className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#00695C] text-sm font-medium transition-all"
                required
              />
            </div>

            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block mb-2">
                Ward Assignment
              </label>
              <select
                value={wardType}
                onChange={(e) => setWardType(e.target.value)}
                className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#00695C] text-sm font-medium transition-all appearance-none cursor-pointer"
              >
                <option value="ER">Emergency Room</option>
                <option value="General">General Ward</option>
                <option value="ICU">Intensive Care Unit</option>
                <option value="Pediatrics">Pediatrics</option>
                <option value="Maternity">Maternity</option>
                <option value="Surgery">Surgery</option>
              </select>
            </div>

            <button className="w-full py-4 bg-gray-900 text-white text-[10px] font-bold uppercase tracking-widest rounded-2xl hover:bg-black transition-all shadow-lg shadow-gray-200 mt-4 active:scale-95">
              + Add to Registry
            </button>
          </form>
        </div>

        {/* --- SECTION 2: MANAGE BEDS --- */}
        <div className="flex-1 w-full bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3">
              <LayoutGrid size={20} className="text-gray-300" />
              <h2 className="text-lg font-bold text-gray-800 uppercase tracking-tight">
                Active Bed Registry
              </h2>
            </div>
            <button
              onClick={fetchBeds}
              className="p-2 text-gray-400 hover:text-[#00695C] transition-colors"
              title="Refresh Registry"
            >
              <RefreshCw
                size={18}
                className={isLoading ? "animate-spin" : ""}
              />
            </button>
          </div>

          <div className="overflow-hidden border border-gray-50 rounded-[2rem]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                  <th className="p-5 font-medium">Identifier</th>
                  <th className="p-5 font-medium">Location</th>
                  <th className="p-5 font-medium text-center">Live Status</th>
                  <th className="p-5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {beds.length === 0 ? (
                  <tr>
                    <td
                      colSpan="4"
                      className="p-10 text-center text-gray-300 font-medium text-xs uppercase tracking-widest italic"
                    >
                      No assets found in registry.
                    </td>
                  </tr>
                ) : (
                  beds.map((bed) => (
                    <tr
                      key={bed.id}
                      className="hover:bg-gray-50/50 transition-colors group"
                    >
                      <td className="p-5 font-bold text-gray-800 text-sm uppercase">
                        {bed.bed_label}
                      </td>
                      <td className="p-5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                        {bed.ward_type}
                      </td>
                      <td className="p-5 text-center">
                        <span
                          className={`px-4 py-1 rounded-xl text-[9px] font-bold uppercase tracking-widest border ${
                            bed.status === "occupied"
                              ? "bg-red-50 text-red-600 border-red-100"
                              : "bg-emerald-50 text-emerald-600 border-emerald-100"
                          }`}
                        >
                          {bed.status}
                        </span>
                      </td>
                      <td className="p-5 text-right">
                        <button
                          onClick={() => handleDeleteBed(bed.id, bed.bed_label)}
                          className="p-2.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* --- NOTIFICATION MODAL --- */}
      {modal.show && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-10 w-full max-w-sm shadow-2xl text-center animate-in zoom-in duration-200">
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
                modal.type === "success"
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {modal.type === "success" ? (
                <CheckCircle size={32} />
              ) : (
                <AlertTriangle size={32} />
              )}
            </div>

            <h3 className="text-xl font-bold text-gray-800 mb-2 uppercase tracking-tight">
              {modal.type === "success" ? "Success" : "System Error"}
            </h3>

            <p className="text-gray-400 mb-8 text-xs font-medium leading-relaxed">
              {modal.message}
            </p>

            <button
              onClick={() => setModal({ ...modal, show: false })}
              className={`w-full py-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-white transition-all shadow-lg ${
                modal.type === "success"
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-900/10"
                  : "bg-red-600 hover:bg-red-700 shadow-red-900/10"
              }`}
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
