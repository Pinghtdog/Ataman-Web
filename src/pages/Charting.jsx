import React, { useState, useEffect } from "react";
import {
  Search,
  FileText,
  User,
  Activity,
  Phone,
  HeartPulse,
  AlertCircle,
  Calendar,
  Shield,
  ChevronRight,
  Loader2,
  Clock,
  History,
  X, // Added X icon for clearing
} from "lucide-react";
import { supabase } from "../supabaseClient";

const Charting = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [patient, setPatient] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [recentPatients, setRecentPatients] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(true);

  // 1. FETCH RECENTLY ACCESSED ON LOAD
  useEffect(() => {
    fetchRecent();
  }, []);

  const fetchRecent = async () => {
    setLoadingRecent(true);
    const { data } = await supabase
      .from("users")
      .select("id, first_name, last_name, birth_date, barangay, updated_at")
      .order("updated_at", { ascending: false })
      .limit(6);

    if (data) setRecentPatients(data);
    setLoadingRecent(false);
  };

  // --- NEW: CLEAR FUNCTION ---
  const handleClear = () => {
    setPatient(null);
    setHistory([]);
    setSearchTerm("");
    setSearchResults([]);
    fetchRecent(); // Refresh the list to show the most recent updates
  };

  const calculateAge = (dob) => {
    if (!dob) return "N/A";
    const ageDifMs = Date.now() - new Date(dob).getTime();
    return Math.abs(new Date(ageDifMs).getUTCFullYear() - 1970);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setPatient(null);
    setSearchResults([]);

    const terms = searchTerm.trim().split(" ");
    let query = supabase.from("users").select("*");

    if (terms.length === 1) {
      query = query.or(
        `first_name.ilike.%${terms[0]}%,last_name.ilike.%${terms[0]}%,philhealth_id.eq.${terms[0]}`,
      );
    } else {
      query = query
        .ilike("first_name", `%${terms[0]}%`)
        .ilike("last_name", `%${terms[terms.length - 1]}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);
    } else if (data && data.length > 0) {
      if (data.length === 1) {
        selectPatient(data[0]);
      } else {
        setSearchResults(data);
      }
    } else {
      alert("No records found matching that name or ID.");
    }
    setLoading(false);
  };

  const selectPatient = async (selectedPatient) => {
    setPatient(selectedPatient);
    setSearchResults([]);

    const { data: notes } = await supabase
      .from("clinical_notes")
      .select("*")
      .eq("patient_id", selectedPatient.id)
      .order("created_at", { ascending: false });
    setHistory(notes || []);

    await supabase
      .from("users")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", selectedPatient.id);
  };

  return (
    <div className="p-10 bg-[#F8FAFC] min-h-screen font-sans">
      <div className="mb-10">
        <h1 className="text-4xl font-black text-slate-800 tracking-tighter leading-none">
          Digital Charting
        </h1>
        <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-[0.2em] mt-2">
          Naga City Central Health Records • Secure Node
        </p>
      </div>

      {/* SEARCH BAR */}
      <div className="flex gap-4 items-center max-w-3xl mb-10">
        <form
          onSubmit={handleSearch}
          className="flex-1 flex bg-white p-2 rounded-3xl shadow-sm border border-gray-100 items-center transition-all focus-within:shadow-md"
        >
          <div className="pl-4 text-gray-400">
            <Search size={20} />
          </div>
          <input
            type="text"
            placeholder="Search first, last, or full name..."
            className="w-full outline-none px-4 text-sm font-medium text-gray-600 h-12 bg-transparent"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button className="bg-gray-900 text-white px-8 h-12 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-black transition-all">
            {loading ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              "Search"
            )}
          </button>
        </form>

        {/* Clear Button (Visible only when patient or results exist) */}
        {(patient || searchResults.length > 0) && (
          <button
            onClick={handleClear}
            className="bg-white border border-gray-200 text-gray-400 p-3.5 rounded-2xl hover:text-red-500 hover:border-red-100 transition-all shadow-sm"
            title="Clear and Return to Home"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* --- SECTION: RECENTLY ACCESSED --- */}
      {!patient && searchResults.length === 0 && (
        <div className="space-y-6 animate-in fade-in duration-700">
          <div className="flex items-center gap-2 px-4">
            <History size={14} className="text-[#00695C]" />
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Recently Modified Records
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loadingRecent
              ? [1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-24 bg-white border border-gray-50 rounded-[2rem] animate-pulse"
                  />
                ))
              : recentPatients.map((person) => (
                  <div
                    key={person.id}
                    onClick={() => selectPatient(person)}
                    className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:border-emerald-500 cursor-pointer flex justify-between items-center transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-300 group-hover:bg-[#00695C] group-hover:text-white transition-colors">
                        <User size={18} />
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 text-xs uppercase tracking-tight">
                          {person.first_name} {person.last_name}
                        </p>
                        <p className="text-[9px] font-medium text-gray-400 uppercase tracking-tighter">
                          {person.barangay || "Area Unset"}
                        </p>
                      </div>
                    </div>
                    <ChevronRight
                      size={14}
                      className="text-gray-200 group-hover:text-emerald-500"
                    />
                  </div>
                ))}
          </div>
        </div>
      )}

      {/* --- MULTIPLE RESULTS LIST --- */}
      {searchResults.length > 1 && (
        <div className="mb-10 space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest px-6 flex items-center gap-2">
            <AlertCircle size={12} /> Conflict Found: Select patient record
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {searchResults.map((person) => (
              <div
                key={person.id}
                onClick={() => selectPatient(person)}
                className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:border-primary cursor-pointer flex justify-between items-center transition-all group"
              >
                {/* ... existing card content ... */}
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-300 group-hover:bg-[#00695C] group-hover:text-white transition-colors">
                    <User size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 text-sm uppercase leading-none mb-1">
                      {person.first_name} {person.last_name}
                    </p>
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-tighter">
                      DOB: {person.birth_date} •{" "}
                      {person.barangay || "No Address"}
                    </p>
                  </div>
                </div>
                <ChevronRight
                  size={18}
                  className="text-gray-200 group-hover:text-primary transition-all"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- PATIENT CHART --- */}
      {patient && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Header Card with Close Button */}
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100 flex justify-between items-center relative overflow-hidden group">
            <div className="absolute left-0 top-0 bottom-0 w-2 bg-[#00695C]" />
            <div className="flex items-center gap-8">
              <div className="w-24 h-24 bg-gray-50 rounded-[2.5rem] flex items-center justify-center border border-gray-100 text-[#00695C]">
                <User size={40} />
              </div>
              <div>
                <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight leading-none">
                  {patient.first_name} {patient.last_name}
                </h2>
                <p className="text-[10px] font-bold text-[#00695C] uppercase tracking-widest mt-3 opacity-60 italic leading-none">
                  Central Medical ID: {patient.id.slice(0, 8)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-10">
              <div className="text-right space-y-2">
                <div className="flex items-center justify-end gap-2 text-emerald-600">
                  <Shield size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                    PhilHealth Active
                  </span>
                </div>
                <span className="inline-block bg-emerald-50 text-emerald-600 px-4 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-widest border border-emerald-100">
                  Verified Resident
                </span>
              </div>

              {/* Internal Close Button */}
              <button
                onClick={handleClear}
                className="p-3 bg-gray-50 text-gray-300 rounded-2xl hover:bg-red-50 hover:text-red-500 transition-all border border-transparent hover:border-red-100"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <InfoCard title="Profile Details" icon={<Calendar size={16} />}>
              <DataRow
                label="Age"
                value={`${calculateAge(patient.birth_date)} YRS`}
              />
              <DataRow label="Sex" value={patient.gender || "N/A"} />
              <DataRow
                label="Phone"
                value={patient.phone_number || "NO DATA"}
              />
              <DataRow label="Area" value={patient.barangay || "UNSET"} />
            </InfoCard>

            <InfoCard title="Medical Baseline" icon={<HeartPulse size={16} />}>
              <DataRow
                label="Blood Type"
                value={patient.blood_type || "???"}
                color="text-red-600"
              />
              <div className="mt-4 pt-4 border-t border-gray-50">
                <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">
                  Stated Conditions
                </p>
                <p className="text-xs font-medium text-gray-600 leading-relaxed italic">
                  {patient.medical_conditions || "None listed."}
                </p>
              </div>
            </InfoCard>

            <InfoCard title="Emergency Alert" icon={<AlertCircle size={16} />}>
              <div className="p-5 bg-red-50/50 rounded-[1.8rem] border border-red-50">
                <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest mb-1">
                  Critical Allergies
                </p>
                <p className="text-xs font-bold text-red-600 uppercase">
                  {patient.allergies || "None Reported"}
                </p>
              </div>
              <div className="mt-4 px-1">
                <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">
                  Emergency Contact
                </p>
                <p className="text-xs font-bold text-gray-700 uppercase tracking-tight">
                  {patient.emergency_contact_name || "N/A"}
                </p>
              </div>
            </InfoCard>
          </div>

          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em] mb-10 border-b border-gray-50 pb-4 text-center">
              Interaction Stream
            </h3>
            <div className="space-y-4">
              {history.length > 0 ? (
                history.map((note) => (
                  <div
                    key={note.id}
                    className="grid grid-cols-12 items-center p-6 bg-gray-50/40 rounded-[2rem] border border-gray-50 hover:bg-white transition-all group"
                  >
                    <div className="col-span-2 text-[10px] font-medium text-gray-400 uppercase tracking-widest">
                      {new Date(note.created_at).toLocaleDateString()}
                    </div>
                    <div className="col-span-3 flex items-center gap-2">
                      <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-[#00695C] group-hover:text-white transition-colors">
                        <Activity size={14} />
                      </div>
                      <span className="text-[10px] font-bold uppercase text-gray-700 tracking-widest">
                        Medical Record
                      </span>
                    </div>
                    <div className="col-span-7 text-sm font-medium text-gray-600 leading-relaxed italic">
                      "{note.subjective_notes}"
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-20 text-center text-gray-300 font-bold text-[10px] uppercase tracking-[0.2em]">
                  Clear History
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// HELPERS (Unchanged)
const InfoCard = ({ title, icon, children }) => (
  <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 h-full">
    <div className="flex items-center gap-3 mb-6 border-b border-gray-50 pb-4 text-primary">
      {icon}
      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
        {title}
      </h3>
    </div>
    <div className="space-y-3">{children}</div>
  </div>
);

const DataRow = ({ label, value, color = "text-gray-800" }) => (
  <div className="flex justify-between items-center text-sm">
    <span className="font-medium text-gray-400 uppercase tracking-tighter text-[9px]">
      {label}
    </span>
    <span className={`font-bold uppercase ${color}`}>{value}</span>
  </div>
);

export default Charting;
