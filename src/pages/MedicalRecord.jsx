import React, { useState, useEffect } from "react";
import {
  User,
  Calendar,
  QrCode,
  Search,
  Clock,
  Loader2,
  X,
  ChevronRight,
  Shield,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { Scanner } from "@yudiel/react-qr-scanner";

const MedicalRecord = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // State for the loaded patient
  const [activePatient, setActivePatient] = useState(null);
  const [triageInfo, setTriageInfo] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    document.title = "Medical Record | ATAMAN";
  }, []);

  // --- SEARCH LOGIC ---
  const handleSearch = async (e, directTerm = null) => {
    if (e) e.preventDefault();
    const termToUse = directTerm || searchTerm;
    const cleanTerm = termToUse?.trim();
    if (!cleanTerm) return;

    setLoading(true);
    setActivePatient(null); // Fixed: was setPatient(null)

    let query = supabase.from("users").select("*");

    // 1. UUID Check (Strict Regex for Supabase UUIDs)
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        cleanTerm,
      );

    if (isUUID) {
      // ONLY search the 'id' column if it is a valid UUID
      query = query.eq("id", cleanTerm);
    } else {
      // 2. Text Search (Exclude 'id' column to prevent 400 Error)
      const words = cleanTerm.split(" ");
      if (words.length > 1) {
        // Name search (First + Last)
        query = query
          .ilike("first_name", `%${words[0]}%`)
          .ilike("last_name", `%${words[words.length - 1]}%`);
      } else {
        // ID strings or Single Name search
        query = query.or(
          `medical_id.eq.${cleanTerm},philhealth_id.eq.${cleanTerm},first_name.ilike.%${cleanTerm}%,last_name.ilike.%${cleanTerm}%`,
        );
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("Search Error:", error);
      alert("Search failed. Please try again.");
    } else if (data && data.length > 0) {
      // Load the first result
      loadPatientWorkspace(data[0]);
      // Optional: If you had a list view, you would set it here
    } else if (!directTerm) {
      alert("No medical records located for: " + cleanTerm);
    }

    setLoading(false);
    if (showScanner) setShowScanner(false);
  };

  // --- SCANNER HANDLER ---
  const handleQrScan = (detectedCodes) => {
    if (!detectedCodes || detectedCodes.length === 0) return;

    const rawValue = detectedCodes[0].rawValue;
    if (!rawValue) return;

    // Immediately stop scanning to prevent loop
    setShowScanner(false);

    try {
      // Try to parse JSON (e.g. {"id": "..."})
      const qrData = JSON.parse(rawValue);
      handleSearch(null, qrData.id || qrData.data || rawValue);
    } catch (e) {
      // Fallback to plain text
      handleSearch(null, rawValue);
    }
  };

  const handleScanError = (err) => {
    console.error("Scanner Error:", err);
    // alert("Camera access required."); // Optional feedback
  };

  // --- DATA LOADING ---
  const loadPatientWorkspace = async (patientData) => {
    setActivePatient(patientData);

    // Fetch Triage
    const { data: triage } = await supabase
      .from("triage_results")
      .select("*")
      .eq("user_id", patientData.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setTriageInfo(triage || null);

    // Fetch History
    const { data: notes } = await supabase
      .from("clinical_notes")
      .select("*")
      .eq("patient_id", patientData.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setHistory(notes || []);
  };

  return (
    <div className="p-10 bg-[#F8FAFC] min-h-screen font-sans text-slate-800">
      {/* HEADER */}
      <div className="mb-8 flex justify-between items-center">
        {/* HEADER */}
        <div className="mb-10 flex justify-between items-end shrink-0">
          <div>
            <h1 className="text-4xl font-black text-slate-800 uppercase tracking-tighter italic leading-none">
              Medical Records
            </h1>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.3em] mt-3">
              Patient Chart Archive
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] font-bold uppercase text-slate-500">
              System Online
            </span>
          </div>
        </div>
      </div>

      {/* SEARCH BAR (Visible when no patient is selected) */}
      {!activePatient && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4">
          <div className="flex gap-4 items-stretch max-w-4xl">
            <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100 flex items-center gap-4 flex-1">
              <div className="bg-slate-50 p-3 rounded-xl text-slate-400">
                <Search size={20} />
              </div>
              <form onSubmit={handleSearch} className="flex-1">
                <input
                  type="text"
                  placeholder="Search patient by Name, Medical ID, or PhilHealth ID..."
                  className="w-full bg-transparent outline-none text-sm font-bold text-slate-700 placeholder:text-slate-300 placeholder:font-medium"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </form>
              <button
                onClick={(e) => handleSearch(e)}
                className="bg-slate-900 text-white px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg active:scale-95"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  "Locate"
                )}
              </button>
            </div>
            <button
              onClick={() => setShowScanner(true)}
              className="bg-white px-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-1 hover:border-emerald-500 hover:shadow-md transition-all group"
            >
              <QrCode
                size={24}
                className="text-slate-400 group-hover:text-emerald-500 transition-colors"
              />
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-300 group-hover:text-emerald-600">
                Scan
              </span>
            </button>
          </div>
          <div className="mt-6 text-xs font-bold text-slate-400 uppercase tracking-widest pl-2">
            Enter a Patient ID or Name to retrieve records.
          </div>
        </div>
      )}

      {/* ACTIVE PATIENT WORKSPACE */}
      {activePatient && (
        <div className="space-y-6 animate-in slide-in-from-bottom-8 duration-500">
          {/* Patient Header Card */}
          <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 font-black text-2xl uppercase">
                  {(activePatient.first_name || "U")[0]}
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                    {activePatient.first_name} {activePatient.last_name}
                  </h2>
                  <div className="flex gap-3 mt-1">
                    <span className="text-[10px] font-bold bg-slate-50 px-2 py-1 rounded text-slate-500 uppercase">
                      ID: {activePatient.medical_id || activePatient.id}
                    </span>
                    {activePatient.is_philhealth_verified && (
                      <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-2 py-1 rounded uppercase flex items-center gap-1">
                        <Shield size={10} /> Verified
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setActivePatient(null);
                  setHistory([]);
                  setSearchTerm("");
                }}
                className="bg-white border border-slate-200 px-6 py-3 rounded-xl text-xs font-bold uppercase text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Close Record
              </button>
            </div>

            {/* Vitals Bar */}
            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-slate-50">
              <div className="bg-slate-50 p-4 rounded-2xl">
                <div className="text-[9px] text-slate-400 uppercase font-black tracking-widest">
                  Blood Pressure
                </div>
                <div className="text-xl font-black mt-1 text-slate-700">
                  {triageInfo?.blood_pressure || "--"}
                </div>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl">
                <div className="text-[9px] text-slate-400 uppercase font-black tracking-widest">
                  Heart Rate
                </div>
                <div className="text-xl font-black mt-1 text-slate-700">
                  {triageInfo?.heart_rate || triageInfo?.pulse_rate || "--"}
                </div>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl">
                <div className="text-[9px] text-slate-400 uppercase font-black tracking-widest">
                  Weight
                </div>
                <div className="text-xl font-black mt-1 text-slate-700">
                  {triageInfo?.weight || activePatient.weight || "--"}{" "}
                  <span className="text-xs text-slate-400">kg</span>
                </div>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl">
                <div className="text-[9px] text-slate-400 uppercase font-black tracking-widest">
                  Height
                </div>
                <div className="text-xl font-black mt-1 text-slate-700">
                  {triageInfo?.height || activePatient.height || "--"}{" "}
                  <span className="text-xs text-slate-400">cm</span>
                </div>
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Medical History */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                  <Clock size={14} /> Recent Encounters
                </h3>
                <div className="space-y-4">
                  {history.length === 0 && (
                    <div className="text-center py-10 border-2 border-dashed border-slate-100 rounded-xl text-xs text-slate-300 font-bold uppercase">
                      No history records found.
                    </div>
                  )}
                  {history.map((h) => (
                    <div
                      key={h.id}
                      className="p-5 bg-slate-50 rounded-2xl flex justify-between items-start group hover:bg-white hover:shadow-md hover:border-emerald-100 border border-transparent transition-all cursor-default"
                    >
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase font-black mb-1 flex items-center gap-2">
                          {new Date(h.created_at).toLocaleDateString()}
                          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                          {new Date(h.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        <div className="font-black text-slate-800 text-sm uppercase">
                          {h.diagnosis || h.assessment || "Clinical Note"}
                        </div>
                        <div className="text-xs font-medium text-slate-500 mt-2 italic">
                          "
                          {h.subjective_notes ||
                            h.chief_complaint ||
                            "No notes recorded."}
                          "
                        </div>
                      </div>
                      <div className="text-slate-300 group-hover:text-emerald-500 transition-colors">
                        <ChevronRight size={18} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Triage & Info */}
            <div className="space-y-6">
              <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">
                  Latest Triage
                </h3>
                {triageInfo ? (
                  <div className="space-y-4">
                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                      <div className="text-[9px] font-bold text-emerald-600 uppercase mb-1">
                        Chief Complaint
                      </div>
                      <div className="text-sm font-bold text-slate-700 leading-tight">
                        "{triageInfo.chief_complaint}"
                      </div>
                    </div>
                    {triageInfo.notes && (
                      <div className="text-xs text-slate-500 font-medium leading-relaxed">
                        <span className="font-bold text-slate-700">Notes:</span>{" "}
                        {triageInfo.notes}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 font-bold italic">
                    No active triage session.
                  </div>
                )}
              </div>

              <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                  Coverage
                </h3>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">
                    PhilHealth ID
                  </div>
                  <div className="text-sm font-black text-slate-700 tracking-wide font-mono">
                    {activePatient?.philhealth_id || "NOT REGISTERED"}
                  </div>
                </div>
                {activePatient?.philhealth_id && (
                  <button
                    onClick={() =>
                      navigator.clipboard?.writeText(
                        activePatient.philhealth_id,
                      )
                    }
                    className="mt-3 w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-600 transition-all"
                  >
                    Copy ID
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCANNER MODAL */}
      {showScanner && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in border border-white/10">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50">
              <h4 className="font-black text-slate-400 text-[10px] uppercase tracking-widest">
                Scan Patient QR
              </h4>
              <button
                onClick={() => setShowScanner(false)}
                className="text-slate-300 hover:text-red-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 bg-black h-[400px] relative">
              <Scanner
                onScan={handleQrScan}
                onError={handleScanError}
                components={{ audio: false, finder: true }}
                constraints={{ facingMode: "environment" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MedicalRecord;
