import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { User, Search, X, AlertTriangle } from "lucide-react";

// DEFINE THE ORDER AND DISPLAY NAMES FOR WARDS
const WARD_ORDER = [
  { type: 'ER', label: 'Emergency Room (ER)' },
  { type: 'ICU', label: 'Intensive Care Unit (ICU)' },
  { type: 'General', label: 'General Ward' },
  { type: 'Pediatric', label: 'Pediatric Ward' },
  { type: 'Isolation', label: 'Isolation Ward' },
];

const BedManagement = () => {
  const [beds, setBeds] = useState([]);

  // MODAL & SEARCH STATES
  const [selectedBed, setSelectedBed] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [chosenPatient, setChosenPatient] = useState(null);
  const [showDischargeConfirm, setShowDischargeConfirm] = useState(false);

  // 1. FETCH DATA
  const fetchBeds = async () => {
    const { data, error } = await supabase
      .from("beds")
      .select(`*, users ( id, first_name, last_name, birth_date )`)
      .order("bed_label", { ascending: true }); // Sort by label (A-Z)

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

  // 2. AUTO-SUGGEST
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

  return (
    <div className="p-8 bg-white min-h-screen font-sans">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Bed Management</h2>

      {/* STATS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
         <div className="p-4">
            <p className="text-gray-500 text-sm font-semibold">Total Beds</p>
            <p className="text-3xl font-bold text-gray-800">{stats.total}</p>
         </div>
         <div className="p-4">
            <p className="text-gray-500 text-sm font-semibold">Occupied</p>
            <p className="text-3xl font-bold text-red-600">{stats.occupied}</p>
         </div>
         <div className="p-4">
            <p className="text-gray-500 text-sm font-semibold">Available</p>
            <p className="text-3xl font-bold text-green-600">{stats.available}</p>
         </div>
         <div className="p-4">
            <p className="text-gray-500 text-sm font-semibold">To Be Cleaned</p>
            <p className="text-3xl font-bold text-amber-500">{stats.cleaning}</p>
         </div>
      </div>

      {/* --- DYNAMIC WARD SECTIONS --- */}
      {WARD_ORDER.map((ward) => {
        // Filter beds for this specific ward type
        const bedsInWard = beds.filter(b => b.ward_type === ward.type);

        // If no beds exist for this ward type, don't render the section
        if (bedsInWard.length === 0) return null;

        return (
          <div key={ward.type} className="mb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-6 border-b border-gray-200 pb-3">
              <h3 className="text-xl font-bold text-gray-800">{ward.label}</h3>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                {bedsInWard.length} Units
              </span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {bedsInWard.map((bed) => (
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
        );
      })}

      {/* IF NO BEDS AT ALL */}
      {beds.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <p>No beds found for this facility.</p>
          <p className="text-sm">Go to Admin Dashboard to add beds.</p>
        </div>
      )}

      {/* --- MODALS (Unchanged) --- */}
      
      {/* 1. ASSIGN MODAL */}
      {selectedBed && !showDischargeConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold">Assign to {selectedBed.bed_label}</h3>
              <button onClick={() => setSelectedBed(null)}><X size={20} className="text-gray-400" /></button>
            </div>
            
            <div className="relative mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-3 text-gray-400" size={18} />
                <input
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  placeholder="Search patient name..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setChosenPatient(null); }}
                  autoFocus
                />
              </div>
              {suggestions.length > 0 && (
                <ul className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                  {suggestions.map((user) => (
                    <li key={user.id} onClick={() => handleSelectPatient(user)} className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-0">
                      {user.first_name} {user.last_name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setSelectedBed(null)} className="flex-1 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={executeAssignment} disabled={!chosenPatient} className="flex-1 py-2 bg-teal-700 text-white font-bold rounded-lg disabled:opacity-50">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. DISCHARGE MODAL */}
      {showDischargeConfirm && selectedBed && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-lg font-bold mb-2">Confirm Discharge</h3>
            <p className="text-gray-600 mb-6 text-sm">
              Discharge <strong>{selectedBed.users?.first_name} {selectedBed.users?.last_name}</strong>?
            </p>
            <div className="flex gap-3">
              <button onClick={() => { setShowDischargeConfirm(false); setSelectedBed(null); }} className="flex-1 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={executeDischarge} className="flex-1 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700">Discharge</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- COMPACT CARD COMPONENT ---
const BedCard = ({ bed, onDischarge, onReady, onAssign }) => {
  const config = {
    occupied: {
      borderColor: "border-[#D32F2F]",
      headerBg: "bg-[#D32F2F]",
      iconBg: "bg-red-100",
      iconColor: "text-[#D32F2F]",
      btnBg: "bg-gray-100",
      btnText: "text-gray-600",
      btnHover: "hover:bg-gray-200",
      btnLabel: "Discharge",
      action: () => onDischarge(bed)
    },
    cleaning: {
      borderColor: "border-[#FFA000]",
      headerBg: "bg-[#FFA000]",
      iconBg: "bg-transparent",
      iconColor: "text-[#FFA000]",
      btnBg: "bg-[#FFF3E0]",
      btnText: "text-[#E65100]",
      btnHover: "hover:bg-[#FFE0B2]",
      btnLabel: "Mark Ready",
      action: () => onReady(bed.id)
    },
    available: {
      borderColor: "border-[#4CAF50]",
      headerBg: "bg-[#4CAF50]",
      iconBg: "bg-transparent",
      iconColor: "text-[#4CAF50]",
      btnBg: "bg-[#E8F5E9]",
      btnText: "text-[#2E7D32]",
      btnHover: "hover:bg-[#C8E6C9]",
      btnLabel: "Assign",
      action: () => onAssign(bed)
    }
  }[bed.status] || {};

  return (
    <div className={`rounded-2xl border-[3px] overflow-hidden flex flex-col h-32 bg-white shadow-sm transition-transform hover:-translate-y-1 ${config.borderColor}`}>
      {/* HEADER */}
      <div className={`${config.headerBg} h-9 shrink 0 flex items-center px-3`}>
        <span className="text-white font-bold text-xs tracking-wide uppercase truncate">
          {bed.bed_label}
        </span>
      </div>

      {/* BODY */}
      <div className="p-3 flex flex-col items-center justify-between flex-grow">
        <div className="flex flex-col items-center justify-center flex-grow w-full">
          {bed.status === "occupied" ? (
            <>
              <p className="font-bold text-red-600 text-center text-sm leading-tight line-clamp-2">
                {bed.users?.first_name} {bed.users?.last_name}
              </p>
            </>
          ) : (
             <div className="flex flex-col items-center">
               <h3 className={`text-lg font-bold ${config.iconColor} tracking-wide uppercase`}>
                 {bed.status === "cleaning" ? "CLEANING" : "VACANT"}
               </h3>
             </div>
          )}
        </div>

        <button
          onClick={config.action}
          className={`w-full py-1.5 mt-2 rounded-lg font-bold text-xs transition-colors ${config.btnBg} ${config.btnText} ${config.btnHover}`}
        >
          {config.btnLabel}
        </button>
      </div>
    </div>
  );
};

export default BedManagement;