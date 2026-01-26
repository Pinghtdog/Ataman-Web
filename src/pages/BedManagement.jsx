import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { User, AlertTriangle, BedDouble, Search, X } from "lucide-react";

const BedManagement = () => {
  const [beds, setBeds] = useState([]);

  // MODAL & SEARCH STATES
  const [selectedBed, setSelectedBed] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [chosenPatient, setChosenPatient] = useState(null);
  const [showDischargeConfirm, setShowDischargeConfirm] = useState(false);

  // 1. FETCH DATA (Real-time)
  const fetchBeds = async () => {
    const { data, error } = await supabase
      .from("beds")
      .select(`*, users ( id, first_name, last_name, birth_date )`)
      .order("id", { ascending: true });

    if (error) console.error("Error fetching beds:", error);
    else setBeds(data || []);
  };

  useEffect(() => {
    fetchBeds();
    const channel = supabase
      .channel("bed-management-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "beds" },
        fetchBeds,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 2. AUTO-SUGGEST LOGIC
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (searchTerm.length < 2 || chosenPatient) {
        setSuggestions([]);
        return;
      }
      const { data } = await supabase
        .from("users")
        .select("id, first_name, last_name, birth_date")
        .ilike("first_name", `%${searchTerm}%`)
        .limit(5);
      setSuggestions(data || []);
    };
    const timeoutId = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, chosenPatient]);

  // 3. HANDLERS
  const handleSelectPatient = (user) => {
    setChosenPatient(user);
    setSearchTerm(`${user.first_name} ${user.last_name}`);
    setSuggestions([]);
  };

  const executeAssignment = async () => {
    if (!chosenPatient || !selectedBed) return;
    const { error } = await supabase
      .from("beds")
      .update({ status: "occupied", patient_id: chosenPatient.id })
      .eq("id", selectedBed.id);

    if (!error) {
      await fetchBeds();
      setSelectedBed(null);
      setSearchTerm("");
      setChosenPatient(null);
    }
  };

  const openDischargeModal = (bed) => {
    setSelectedBed(bed);
    setShowDischargeConfirm(true);
  };

  const executeDischarge = async () => {
    if (!selectedBed) return;
    const { error } = await supabase
      .from("beds")
      .update({ status: "cleaning", patient_id: null })
      .eq("id", selectedBed.id);

    if (!error) {
      setShowDischargeConfirm(false);
      setSelectedBed(null);
      await fetchBeds();
    }
  };

  const handleMarkReady = async (id) => {
    const { error } = await supabase
      .from("beds")
      .update({ status: "available" })
      .eq("id", id);
    if (!error) await fetchBeds();
  };

  // Stats
  const stats = {
    total: beds.length,
    occupied: beds.filter((b) => b.status === "occupied").length,
    available: beds.filter((b) => b.status === "available").length,
    cleaning: beds.filter((b) => b.status === "cleaning").length,
  };

  const erBeds = beds.filter((b) => b.ward_type === "ER");
  const wardBeds = beds.filter((b) => b.ward_type === "General");

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight mb-6 flex items-center gap-3">
        Bed Management
      </h2>

      {/* STATS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        <StatCard label="Total Beds" value={stats.total} />
        <StatCard
          label="Occupied"
          value={stats.occupied}
          color="text-red-600"
        />
        <StatCard
          label="Available"
          value={stats.available}
          color="text-[#00695C]"
        />
        <StatCard
          label="To Be Cleaned"
          value={stats.cleaning}
          color="text-amber-500"
        />
      </div>

      {/* EMERGENCY ROOM SECTION */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-6 border-b border-gray-200 pb-3">
          <h3 className="text-lg font-bold text-gray-700">
            Emergency Room (ER)
          </h3>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            {erBeds.length} Units
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {erBeds.map((bed) => (
            <BedCard
              key={bed.id}
              bed={bed}
              onDischarge={openDischargeModal}
              onReady={handleMarkReady}
              onAssign={setSelectedBed}
            />
          ))}
        </div>
      </div>

      {/* GENERAL WARD SECTION */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-6 border-b border-gray-200 pb-3">
          <h3 className="text-lg font-bold text-gray-700">General Ward</h3>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            {wardBeds.length} Units
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {wardBeds.map((bed) => (
            <BedCard
              key={bed.id}
              bed={bed}
              onDischarge={openDischargeModal}
              onReady={handleMarkReady}
              onAssign={setSelectedBed}
            />
          ))}
        </div>
      </div>

      {/* MODAL: ASSIGN PATIENT */}
      {selectedBed && !showDischargeConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-800 tracking-tight">
                  Assign to {selectedBed.bed_label}
                </h3>
                <button
                  onClick={() => setSelectedBed(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="relative mb-8">
                <label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block tracking-widest">
                  Search Patient
                </label>
                <div className="relative">
                  <Search
                    className="absolute left-3 top-3.5 text-gray-400"
                    size={16}
                  />
                  <input
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00695C] focus:bg-white transition-all text-sm"
                    placeholder="Enter patient name..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setChosenPatient(null);
                    }}
                    autoFocus
                  />
                </div>

                {/* SUGGESTIONS LIST - High Z-Index to prevent clipping */}
                {suggestions.length > 0 && (
                  <ul className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-2xl z-[100] overflow-hidden">
                    {suggestions.map((user) => (
                      <li
                        key={user.id}
                        onClick={() => handleSelectPatient(user)}
                        className="p-4 hover:bg-teal-50 cursor-pointer flex items-center gap-3 border-b last:border-0 border-gray-50"
                      >
                        <div className="bg-teal-100 p-2 rounded-full text-teal-600 shrink-0">
                          <User size={14} />
                        </div>
                        <span className="font-bold text-gray-700 text-sm">
                          {user.first_name} {user.last_name}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedBed(null)}
                  className="flex-1 py-3 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  onClick={executeAssignment}
                  disabled={!chosenPatient}
                  className="flex-1 py-3 bg-[#00695C] text-white text-sm font-bold rounded-xl shadow-lg shadow-teal-900/20 hover:bg-[#004D40] disabled:opacity-50 transition-all uppercase tracking-wider"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DISCHARGE CONFIRM */}
      {showDischargeConfirm && selectedBed && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Confirm Discharge
            </h3>
            <p className="text-gray-500 mb-8 text-sm leading-relaxed">
              Are you sure you want to discharge{" "}
              <span className="font-bold text-gray-800">
                {selectedBed.users?.first_name} {selectedBed.users?.last_name}
              </span>
              ?
              <br />
              This bed will be moved to cleaning.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDischargeConfirm(false);
                  setSelectedBed(null);
                }}
                className="flex-1 py-3 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors uppercase"
              >
                Cancel
              </button>
              <button
                onClick={executeDischarge}
                className="flex-1 py-3 bg-red-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-900/20 hover:bg-red-700 transition-all uppercase"
              >
                Discharge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// HELPER COMPONENTS
const StatCard = ({ label, value, color = "text-gray-900" }) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
      {label}
    </p>
    <p className={`text-3xl font-black ${color}`}>{value}</p>
  </div>
);

const BedCard = ({ bed, onDischarge, onReady, onAssign }) => {
  const statusConfig = {
    occupied: { header: "bg-red-700", label: "Occupied" },
    cleaning: { header: "bg-amber-500", label: "Cleaning" },
    available: { header: "bg-[#004D40]", label: "Vacant" },
  };

  const config = statusConfig[bed.status] || statusConfig.available;

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-md border border-gray-100 flex flex-col h-full group transition-all hover:shadow-xl">
      {/* Header - Fixed Height */}
      <div
        className={`${config.header} h-10 flex items-center justify-center text-white font-black text-[10px] uppercase tracking-widest`}
      >
        {bed.bed_label}
      </div>

      {/* Body - Reduced min-h and uses flex-grow to push button down */}
      <div className="p-4 flex flex-col items-center flex-grow min-h-[150px]">
        {/* Content Section */}
        <div className="flex flex-col items-center justify-center flex-grow text-center w-full">
          {bed.status === "occupied" ? (
            <>
              <div className="bg-red-50 p-2 rounded-full text-red-600 mb-2">
                <User size={20} />
              </div>
              <p className="font-black text-gray-800 leading-tight text-sm line-clamp-2 px-1">
                {bed.users?.first_name} {bed.users?.last_name}
              </p>
              <p className="text-[9px] font-bold text-gray-400 uppercase mt-1 tracking-tighter">
                Patient Assigned
              </p>
            </>
          ) : bed.status === "cleaning" ? (
            <p className="font-black text-amber-500 text-[10px] tracking-[0.2em] uppercase italic animate-pulse">
              Sanitizing...
            </p>
          ) : (
            <p className="font-black text-gray-200 text-[10px] tracking-[0.2em] uppercase">
              Available
            </p>
          )}
        </div>

        {/* Action Button Section - Locked to Bottom */}
        <div className="mt-auto w-full pt-4">
          {bed.status === "occupied" ? (
            <button
              onClick={() => onDischarge(bed)}
              className="w-full py-2 bg-white border-2 border-red-50 text-red-600 font-bold rounded-lg text-[9px] hover:bg-red-600 hover:text-white transition-all shadow-sm"
            >
              DISCHARGE
            </button>
          ) : bed.status === "cleaning" ? (
            <button
              onClick={() => onReady(bed.id)}
              className="w-full py-2 bg-amber-500 text-white font-bold rounded-lg text-[9px] hover:bg-amber-600 shadow-md shadow-amber-200 transition-all"
            >
              MARK READY
            </button>
          ) : (
            <button
              onClick={() => onAssign(bed)}
              className="w-full py-2 bg-[#004D40] text-white font-bold rounded-lg text-[9px] hover:bg-[#005a4b] shadow-lg shadow-teal-900/10 transition-all"
            >
              ASSIGN PATIENT
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BedManagement;
