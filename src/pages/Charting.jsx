import React, { useState } from "react";
import { Search, FileText, Pill, User, Activity } from "lucide-react";
import { supabase } from "../supabaseClient";

const Charting = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [patient, setPatient] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { data } = await supabase
      .from("users")
      .select("*")
      .or(`last_name.ilike.%${searchTerm}%,philhealth_id.eq.${searchTerm}`)
      .limit(1)
      .single();

    if (data) {
      setPatient(data);
      const { data: notes } = await supabase
        .from("clinical_notes")
        .select("*")
        .eq("patient_id", data.id);
      setHistory(notes || []);
    }
    setLoading(false);
  };

  return (
    <div className="p-10 bg-[#F8FAFC] min-h-screen">
      <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">
        Digital Charting
      </h1>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.2em] mb-10">
        Central Health Records
      </p>

      {/* SEARCH BAR - Command Center Style */}
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
        <button className="bg-gray-800 text-white px-8 h-12 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all">
          Search
        </button>
      </form>

      {patient && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* PATIENT HEADER CARD */}
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100 flex justify-between items-center relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-2 bg-[#00695C]" />
            <div className="flex items-center gap-8">
              <div className="w-20 h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center border border-gray-100 text-[#00695C]">
                <User size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-gray-800">
                  {patient.first_name} {patient.last_name}
                </h2>
                <div className="flex gap-4 mt-2">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    {patient.gender} • {patient.blood_type || "O+"}
                  </span>
                  <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">
                    Allergies: {patient.allergies || "None"}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right space-y-2">
              <span className="block bg-emerald-50 text-emerald-600 px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border border-emerald-100">
                Verified Indigent
              </span>
              <span className="block bg-blue-50 text-blue-600 px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border border-blue-100">
                PhilHealth Active
              </span>
            </div>
          </div>

          {/* INTERACTION HISTORY */}
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-8 border-b border-gray-50 pb-4 text-center">
              Ataman Interaction History
            </h3>
            <div className="space-y-4">
              {history.map((note) => (
                <div
                  key={note.id}
                  className="grid grid-cols-12 items-center p-6 bg-gray-50/50 rounded-[2rem] border border-gray-50 hover:border-primary transition-all"
                >
                  <div className="col-span-2 text-[10px] font-black text-gray-400 uppercase">
                    {new Date(note.created_at).toLocaleDateString()}
                  </div>
                  <div className="col-span-3 flex items-center gap-2">
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                      <Activity size={14} />
                    </div>
                    <span className="text-xs font-black uppercase text-emerald-600">
                      Consultation
                    </span>
                  </div>
                  <div className="col-span-7 text-xs font-bold text-gray-600 leading-relaxed italic">
                    "{note.subjective_notes}"
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Charting;
