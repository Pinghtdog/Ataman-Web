import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { useLocation } from "react-router-dom";
import {
  User,
  Search,
  X,
  AlertTriangle,
  BedDouble,
  Loader2,
  Clock,
  Filter,
  ChevronDown,
  UserSearch,
} from "lucide-react";

const BedManagement = () => {
  const [beds, setBeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [facilityId, setFacilityId] = useState(null);
  const [filterType, setFilterType] = useState("All");
  const [patientSearchQuery, setPatientSearchQuery] = useState("");
  const [selectedBed, setSelectedBed] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [chosenPatient, setChosenPatient] = useState(null);
  const [showDischargeConfirm, setShowDischargeConfirm] = useState(false);
  const location = useLocation();

  const fetchData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: staffRecord } = await supabase
        .from("facility_staff")
        .select("facility_id")
        .eq("user_id", user.id)
        .single();

      const fId = staffRecord?.facility_id || 2;
      setFacilityId(fId);

      const { data: bedData } = await supabase
        .from("beds")
        .select(`*, users ( id, first_name, last_name, birth_date )`)
        .eq("facility_id", fId)
        .order("bed_label", { ascending: true });

      if (bedData) setBeds(bedData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    document.title = "Bed Management | ATAMAN Health";
    const channel = supabase
      .channel("beds-mgmt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "beds" },
        fetchData,
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (searchTerm.trim().length < 2 || chosenPatient) {
        setSuggestions([]);
        return;
      }

      const words = searchTerm.trim().split(" ");
      let query = supabase.from("users").select("id, first_name, last_name");

      if (words.length === 1) {
        query = query.or(
          `first_name.ilike.%${words[0]}%,last_name.ilike.%${words[0]}%`,
        );
      } else {
        query = query
          .ilike("first_name", `%${words[0]}%`)
          .ilike("last_name", `%${words[words.length - 1]}%`);
      }

      const { data } = await query.limit(5);
      setSuggestions(data || []);
    };

    const timeoutId = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, chosenPatient]);

  const handleSelectPatient = (user) => {
    setChosenPatient(user);
    setSearchTerm(`${user.first_name} ${user.last_name}`);
    setSuggestions([]);
  };

  const executeAssignment = async () => {
    if (!chosenPatient || !selectedBed) return;
    await supabase
      .from("beds")
      .update({ status: "occupied", patient_id: chosenPatient.id })
      .eq("id", selectedBed.id);
    setSelectedBed(null);
    setSearchTerm("");
    setChosenPatient(null);
    fetchData();
  };

  const executeDischarge = async () => {
    if (!selectedBed) return;
    await supabase
      .from("beds")
      .update({ status: "cleaning", patient_id: null })
      .eq("id", selectedBed.id);
    setShowDischargeConfirm(false);
    setSelectedBed(null);
    fetchData();
  };

  const handleMarkReady = async (id) => {
    await supabase.from("beds").update({ status: "available" }).eq("id", id);
    fetchData();
  };

  const allWardTypesInDB = [
    ...new Set(beds.map((b) => b.ward_type || "General")),
  ];

  const wardGroups = beds.reduce((acc, bed) => {
    const type = bed.ward_type || "General";

    if (filterType !== "All" && type !== filterType) return acc;

    if (patientSearchQuery.trim() !== "") {
      const pName =
        `${bed.users?.first_name} ${bed.users?.last_name}`.toLowerCase();
      if (!pName.includes(patientSearchQuery.toLowerCase())) return acc;
    }

    if (!acc[type]) acc[type] = [];
    acc[type].push(bed);
    return acc;
  }, {});

  const stats = {
    total: beds.length,
    occupied: beds.filter((b) => b.status === "occupied").length,
    available: beds.filter((b) => b.status === "available").length,
    cleaning: beds.filter((b) => b.status === "cleaning").length,
  };

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-white font-sans text-emerald-600">
        <div className="relative mb-6 flex items-center justify-center">
          <div className="absolute h-16 w-16 animate-ping rounded-full bg-emerald-100 opacity-75"></div>

          <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600"></div>
        </div>

        <div className="space-y-2 text-center">
          <h2 className="text-lg font-bold tracking-tight">
            Syncing Bed Management...
          </h2>

          <div className="flex items-center justify-center gap-2">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400"></span>
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:0.2s]"></span>
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:0.4s]"></span>
          </div>

          <p className="pt-4 text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-800/40">
            Ataman Security Protocol Active
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-10 bg-[#F8FAFC] min-h-screen font-sans">
      <div className="flex justify-between items-start mb-10">
        <div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter">
            Bed Management
          </h1>
          <p className="text-gray-500 text-sm font-medium">
            Live Asset Control
          </p>
        </div>

        <div className="flex gap-4">
          {/* --- PATIENT LOCATOR SEARCH --- */}
          <div className="flex items-center gap-3 bg-white p-2 pl-4 rounded-2xl shadow-sm border border-gray-100 w-64 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <Search size={14} className="text-gray-300" />
            <input
              type="text"
              placeholder="Find patient in bed..."
              className="bg-transparent outline-none text-[11px] font-bold text-gray-700 w-full"
              value={patientSearchQuery}
              onChange={(e) => setPatientSearchQuery(e.target.value)}
            />
            {patientSearchQuery && (
              <X
                size={12}
                className="text-gray-300 cursor-pointer hover:text-red-500 mr-2"
                onClick={() => setPatientSearchQuery("")}
              />
            )}
          </div>

          {/* --- WARD FILTER DROPDOWN --- */}
          <div className="flex items-center gap-3 bg-white p-2 pl-4 rounded-2xl shadow-sm border border-gray-100">
            <Filter size={14} className="text-gray-400" />
            <div className="relative">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-transparent outline-none text-[11px] font-bold text-gray-700 pr-8 cursor-pointer appearance-none uppercase tracking-widest"
              >
                <option value="All">All Sections</option>
                {allWardTypesInDB.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="absolute right-0 top-1 text-gray-400 pointer-events-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* KPI STATS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-4">
        <StatCard label="Total Units" value={stats.total} />
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
          label="Sanitizing"
          value={stats.cleaning}
          color="text-orange-400"
        />
      </div>

      {/* DYNAMIC WARD SECTIONS */}
      {Object.keys(wardGroups).length > 0 ? (
        Object.keys(wardGroups).map((wardType) => (
          <div key={wardType} className="mb-12 animate-in fade-in duration-500">
            <div className="p-6 flex items-center justify-between mb-6 border-b border-gray-100 pb-2 px-2">
              <h3 className="text-lg font-bold text-gray-700 uppercase tracking-tight">
                {wardType} Section
              </h3>
              <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-widest">
                {wardGroups[wardType].length} Units
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8">
              {wardGroups[wardType].map((bed) => (
                <BedControlCard
                  key={bed.id}
                  bed={bed}
                  onDischarge={() => {
                    setSelectedBed(bed);
                    setShowDischargeConfirm(true);
                  }}
                  onReady={() => handleMarkReady(bed.id)}
                  onAssign={() => setSelectedBed(bed)}
                />
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="py-20 text-center border-2 border-dashed border-gray-100 rounded-[3rem]">
          <p className="text-gray-300 font-bold uppercase tracking-widest text-xs">
            No beds found matching this filter
          </p>
        </div>
      )}

      {/* MODALS */}
      {selectedBed && !showDischargeConfirm && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedBed(null)}
        >
          <div
            className="bg-white rounded-[2.5rem] p-10 w-full max-w-md shadow-2xl animate-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">
                Assign {selectedBed.bed_label}
              </h2>
              <button
                onClick={() => setSelectedBed(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="relative mb-10">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block mb-2">
                Search Patient
              </label>
              <div className="relative">
                <Search
                  className="absolute left-4 top-3.5 text-gray-300"
                  size={18}
                />
                <input
                  type="text"
                  className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#00695C] text-sm font-medium"
                  placeholder="Enter Name..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setChosenPatient(null);
                  }}
                />
              </div>
              {suggestions.length > 0 && (
                <ul className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-50 rounded-2xl shadow-xl z-[100] overflow-hidden">
                  {suggestions.map((user) => (
                    <li
                      key={user.id}
                      onClick={() => handleSelectPatient(user)}
                      className="p-4 hover:bg-emerald-50 cursor-pointer border-b last:border-0 text-sm font-bold text-gray-700"
                    >
                      {user.first_name} {user.last_name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setSelectedBed(null)}
                className="flex-1 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest rounded-xl hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={executeAssignment}
                disabled={!chosenPatient}
                className="flex-1 py-4 bg-[#00695C] text-white text-[10px] font-bold uppercase tracking-widest rounded-xl disabled:opacity-20 shadow-lg shadow-emerald-900/10 hover:bg-black transition-all"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {showDischargeConfirm && selectedBed && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowDischargeConfirm(false);
            setSelectedBed(null);
          }}
        >
          <div
            className="bg-white rounded-[2.5rem] p-10 w-full max-w-sm shadow-2xl text-center animate-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-100">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2 uppercase tracking-tight">
              Discharge
            </h3>
            <p className="text-gray-400 mb-10 text-xs font-medium">
              Remove {selectedBed.users?.first_name} from records?
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setShowDischargeConfirm(false);
                  setSelectedBed(null);
                }}
                className="flex-1 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest rounded-xl hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={executeDischarge}
                className="flex-1 py-4 bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl shadow-lg hover:bg-red-700 transition-all"
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

// HELPERS
const StatCard = ({ label, value, color = "text-gray-800" }) => (
  <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 transition-all hover:translate-y-[-2px] hover:shadow-md">
    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
      {label}
    </p>
    <p className={`text-4xl font-bold ${color}`}>{value}</p>
  </div>
);

// BIGGER, ANIMATED CARD
const BedControlCard = ({ bed, onDischarge, onReady, onAssign }) => {
  const isOccupied = bed.status === "occupied";
  const isCleaning = bed.status === "cleaning";

  return (
    <div
      className={`aspect-[4/4] rounded-[1rem] bg-white border border-gray-300 flex flex-col overflow-hidden shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-2 group`}
    >
      {/* Header Bar */}
      <div
        className={`h-8 flex items-center justify-center text-white text-[10px] font-bold uppercase tracking-widest transition-colors duration-300
        ${isOccupied ? "bg-red-700 group-hover:bg-red-600" : isCleaning ? "bg-orange-400 group-hover:bg-orange-300" : "bg-[#004D40] group-hover:bg-[#00695C]"}`}
      >
        {bed.bed_label}
      </div>

      <div className="p-6 flex flex-col items-center justify-between flex-grow min-h-[160px]">
        {/* Content Section */}
        <div className="text-center flex-grow flex flex-col justify-center w-full px-2">
          {isOccupied ? (
            <div className="animate-in fade-in duration-500">
              <p className="text-sm font-bold text-gray-800 leading-tight uppercase line-clamp-2 mb-2">
                {bed.users?.first_name} {bed.users?.last_name}
              </p>
              <div className="flex items-center justify-center gap-1.5 text-[9px] font-semibold text-red-400 uppercase tracking-tighter">
                <Clock size={10} className="animate-pulse" /> Stay: Active
              </div>
            </div>
          ) : (
            <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-[0.2em] group-hover:text-gray-400 transition-colors">
              {isCleaning ? "Sanitizing" : "Vacant"}
            </p>
          )}
        </div>

        {/* Action Button */}
        <button
          onClick={isOccupied ? onDischarge : isCleaning ? onReady : onAssign}
          className={`w-full py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all mt-4 transform active:scale-95
            ${
              isOccupied
                ? "border-2 border-red-50 text-red-600 hover:bg-red-600 hover:text-white"
                : isCleaning
                  ? "bg-orange-400 text-white shadow-lg shadow-orange-900/10 hover:bg-orange-500"
                  : "bg-[#004D40] text-white shadow-lg shadow-teal-900/10 hover:bg-[#00695C]"
            }`}
        >
          {isOccupied ? "Release" : isCleaning ? "Ready" : "Assign"}
        </button>
      </div>
    </div>
  );
};

export default BedManagement;
