import React, { useState } from "react";
import {
  Search,
  FileText,
  User,
  Activity,
  Phone,
  Home,
  HeartPulse,
  AlertCircle,
  Calendar,
  Shield,
} from "lucide-react";
import { supabase } from "../supabaseClient";

const Charting = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [patient, setPatient] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const calculateAge = (birthDateString) => {
    if (!birthDateString) return "N/A";
    const today = new Date();
    const birthDate = new Date(birthDateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setPatient(null);

    const { data } = await supabase
      .from("users")
      .select("*")
      .or(
        `first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,philhealth_id.eq.${searchTerm}`,
      )
      .limit(1)
      .single();

    if (data) {
      setPatient(data);
      const { data: notes } = await supabase
        .from("clinical_notes")
        .select("*")
        .eq("patient_id", data.id)
        .order("created_at", { ascending: false });
      setHistory(notes || []);
    }
    setLoading(false);
  };

  return (
    <div className="p-10 bg-[#F8FAFC] min-h-screen">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">
          Digital Charting
        </h1>
        <p className="text-gray-500 text-sm font-medium">
          Naga City Central Health Records
        </p>
      </div>

      {/* SEARCH BAR */}
      <form
        onSubmit={handleSearch}
        className="mb-10 flex bg-white p-2 rounded-3xl shadow-sm border border-gray-100 items-center max-w-2xl"
      >
        <div className="pl-4 text-gray-400">
          <Search size={20} />
        </div>
        <input
          type="text"
          placeholder="Search by PhilHealth ID or Name..."
          className="w-full outline-none px-4 text-sm font-bold text-gray-600 h-12 bg-transparent"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button className="bg-gray-800 text-white px-8 h-12 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-black transition-all">
          Search
        </button>
      </form>

      {patient ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* 1. PATIENT PRIMARY HEADER */}
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100 flex justify-between items-center relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-2 bg-[#00695C]" />
            <div className="flex items-center gap-8">
              <div className="w-24 h-24 bg-gray-50 rounded-[2.5rem] flex items-center justify-center border border-gray-100 text-[#00695C]">
                <User size={40} />
              </div>
              <div>
                <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">
                  {patient.first_name} {patient.last_name}
                </h2>
                <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-1 italic">
                  Medical ID: {patient.id.slice(0, 8)}...
                </p>
              </div>
            </div>
            <div className="text-right space-y-2">
              <div className="flex items-center justify-end gap-2 text-emerald-600">
                <Shield size={14} />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  PhilHealth: {patient.philhealth_id || "Not Linked"}
                </span>
              </div>
              <span className="inline-block bg-emerald-50 text-emerald-600 px-4 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-widest border border-emerald-100">
                Verified Resident
              </span>
            </div>
          </div>

          {/* 2. INFORMATION GRID */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Personal Details */}
            <InfoCard title="Personal Profile" icon={<Calendar size={16} />}>
              <DataRow
                label="Age"
                value={`${calculateAge(patient.birth_date)} Years Old`}
              />
              <DataRow label="Sex" value={patient.gender || "Not Specified"} />
              <DataRow
                label="Phone"
                value={patient.phone_number || "No Data"}
              />
              <DataRow
                label="Barangay"
                value={patient.barangay || "Unspecified"}
              />
            </InfoCard>

            {/* Medical Baseline */}
            <InfoCard title="Medical Baseline" icon={<HeartPulse size={16} />}>
              <DataRow
                label="Blood Type"
                value={patient.blood_type || "Unknown"}
                color="text-red-600"
              />
              <div className="mt-4">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                  Pre-existing Conditions
                </p>
                <p className="text-xs font-semibold text-gray-700">
                  {patient.medical_conditions ||
                    "No chronic conditions listed."}
                </p>
              </div>
              <div className="mt-4">
                <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                  <AlertCircle size={10} /> Critical Allergies
                </p>
                <p className="text-xs font-bold text-red-600">
                  {patient.allergies || "None Reported"}
                </p>
              </div>
            </InfoCard>

            {/* Emergency Contact */}
            <InfoCard title="Emergency Contact" icon={<Phone size={16} />}>
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                  Contact Person
                </p>
                <p className="text-sm font-bold text-gray-800">
                  {patient.emergency_contact_name || "None Set"}
                </p>
                <p className="text-xs font-medium text-gray-500 mt-2 flex items-center gap-2">
                  <Phone size={12} /> {patient.emergency_contact_phone || "N/A"}
                </p>
              </div>
            </InfoCard>
          </div>

          {/* 3. INTERACTION HISTORY */}
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100 mt-10">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em] mb-8 border-b border-gray-50 pb-4 text-center">
              Interaction Stream
            </h3>
            <div className="space-y-4">
              {history.length > 0 ? (
                history.map((note) => (
                  <div
                    key={note.id}
                    className="grid grid-cols-12 items-center p-6 bg-gray-50/40 rounded-[2rem] border border-gray-50 hover:bg-white hover:border-primary transition-all group"
                  >
                    <div className="col-span-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                      {new Date(note.created_at).toLocaleDateString()}
                    </div>
                    <div className="col-span-3 flex items-center gap-2">
                      <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-primary group-hover:text-white transition-colors">
                        <Activity size={14} />
                      </div>
                      <span className="text-[10px] font-bold uppercase text-gray-700 tracking-widest">
                        Medical Note
                      </span>
                    </div>
                    <div className="col-span-7 text-xs font-medium text-gray-600 leading-relaxed italic">
                      "{note.subjective_notes}"
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-20 text-center text-gray-300 font-bold text-[10px] uppercase tracking-[0.2em]">
                  No prior interactions recorded in this system.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="py-20 text-center text-gray-400 font-bold animate-pulse text-[10px] uppercase tracking-widest">
          Querying Naga City Medical Database...
        </div>
      ) : (
        <div className="py-20 text-center text-gray-300 font-bold text-[10px] uppercase tracking-widest border-2 border-dashed border-gray-100 rounded-[3rem]">
          Enter a patient name or ID to begin charting
        </div>
      )}
    </div>
  );
};

// HELPER COMPONENTS FOR CLEANER CODE
const InfoCard = ({ title, icon, children }) => (
  <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col h-full">
    <div className="flex items-center gap-3 mb-6 border-b border-gray-50 pb-4">
      <div className="text-primary opacity-50">{icon}</div>
      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
        {title}
      </h3>
    </div>
    <div className="space-y-3 flex-grow">{children}</div>
  </div>
);

const DataRow = ({ label, value, color = "text-gray-800" }) => (
  <div className="flex justify-between items-center text-xs">
    <span className="font-semibold text-gray-400 uppercase tracking-tighter text-[9px]">
      {label}
    </span>
    <span className={`font-bold ${color}`}>{value}</span>
  </div>
);

export default Charting;
