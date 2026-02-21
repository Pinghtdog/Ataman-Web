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
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { Scanner } from "@yudiel/react-qr-scanner";

const MedicalRecord = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [activePatient, setActivePatient] = useState(null);
  const [triageInfo, setTriageInfo] = useState(null);
  const [history, setHistory] = useState([]);
  

  useEffect(() => {
    document.title = "Medical Record | ATAMAN";
  }, []);

  const handleSearch = async (e, directTerm = null) => {
    if (e) e?.preventDefault?.();
    const term = directTerm ?? searchTerm;
    const cleanTerm = term?.trim();
    if (!cleanTerm) return;

    setLoading(true);
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      cleanTerm,
    );
    let query = supabase.from("users").select("*");
    if (isUUID) query = query.eq("id", cleanTerm);
    else
      query = query.or(
        `first_name.ilike.%${cleanTerm}%,last_name.ilike.%${cleanTerm}%,philhealth_id.eq.${cleanTerm},medical_id.eq.${cleanTerm}`,
      );

    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      await loadPatientWorkspace(data[0]);
      setSearchTerm("");
    } else {
      alert("No medical record located.");
    }
    setLoading(false);
    setShowScanner(false);
  };

  const handleQrScan = (detectedCodes) => {
    if (!detectedCodes || detectedCodes.length === 0) return;
    const rawValue = detectedCodes[0]?.rawValue;
    if (!rawValue) return;
    try {
      const qrData = JSON.parse(rawValue);
      handleSearch(null, qrData.id || qrData.data || rawValue);
    } catch (e) {
      handleSearch(null, rawValue);
    }
  };

  const loadPatientWorkspace = async (patientData) => {
    setActivePatient(patientData);
    const { data: triage } = await supabase
      .from("triage_results")
      .select("*")
      .eq("user_id", patientData.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setTriageInfo(triage || null);

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
        <div>
          <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">Medical Record</h1>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.3em]">Patient Chart</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] font-bold uppercase text-slate-500">System Online</span>
          </div>
          <div className="w-10 h-10 bg-slate-200 rounded-full overflow-hidden border-2 border-white shadow-md">
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Patient" alt="avatar" />
          </div>
        </div>
      </div>

      {/* SEARCH */}
      {!activePatient && (
        <div className="space-y-6">
          <div className="flex gap-4 items-stretch max-w-4xl">
            <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100 flex items-center gap-4 flex-1">
              <div className="bg-slate-50 p-3 rounded-xl text-slate-400"><Search size={20} /></div>
              <form onSubmit={handleSearch} className="flex-1">
                <input
                  type="text"
                  placeholder="Search patient by name or ID..."
                  className="w-full bg-transparent outline-none text-sm font-bold text-slate-700 placeholder:text-slate-300 placeholder:font-medium"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </form>
              <button onClick={(e) => handleSearch(e)} className="bg-slate-900 text-white px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg active:scale-95">
                {loading ? <Loader2 className="animate-spin" size={16} /> : "Locate"}
              </button>
            </div>
            <button onClick={() => setShowScanner(true)} className="bg-white px-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-1 hover:border-emerald-500 hover:shadow-md transition-all">
              <QrCode size={24} className="text-slate-400" />
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-300">Scan</span>
            </button>
          </div>

          <div className="mt-6 text-sm text-slate-500">Recent patients or quick actions can appear here.</div>
        </div>
      )}

      {/* ACTIVE PATIENT */}
      {activePatient && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 font-bold text-xl">{(activePatient.first_name||" ")[0]}</div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">{activePatient.first_name} {activePatient.last_name}</h2>
                  <p className="text-sm text-slate-500">Patient ID: {activePatient.medical_id || activePatient.id}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => { setActivePatient(null); setHistory([]); }} className="bg-white border border-slate-200 px-4 py-2 rounded-lg">Close</button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl">
                <div className="text-[10px] text-slate-400 uppercase font-black">Blood Pressure</div>
                <div className="text-xl font-bold mt-2">{triageInfo?.blood_pressure || "120/80"}</div>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl">
                <div className="text-[10px] text-slate-400 uppercase font-black">Heart Rate</div>
                <div className="text-xl font-bold mt-2">{triageInfo?.heart_rate || "72 bpm"}</div>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl">
                <div className="text-[10px] text-slate-400 uppercase font-black">Weight</div>
                <div className="text-xl font-bold mt-2">{activePatient.weight || "65.2 kg"}</div>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl">
                <div className="text-[10px] text-slate-400 uppercase font-black">Height</div>
                <div className="text-xl font-bold mt-2">{activePatient.height || "168 cm"}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white p-6 rounded-[1.2rem] border border-slate-100 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-4">Medical History</h3>
                <div className="space-y-4">
                  {history.length === 0 && <div className="text-sm text-slate-400">No entries yet.</div>}
                  {history.map((h) => (
                    <div key={h.id} className="p-4 bg-slate-50 rounded-xl flex justify-between items-start">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-black mb-1">{new Date(h.created_at).toLocaleDateString()}</div>
                        <div className="font-bold text-slate-800">{h.assessment || h.subjective_notes || "Clinical Note"}</div>
                        <div className="text-sm text-slate-500 mt-1">{h.plan || h.objective_notes}</div>
                      </div>
                      <div className="text-slate-300"><ChevronRight /></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="bg-white p-6 rounded-[1.2rem] border border-slate-100 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-4">Triage</h3>
                {triageInfo ? (
                  <div className="text-sm text-slate-600">
                    <div><strong>Chief:</strong> {triageInfo.chief_complaint}</div>
                    <div><strong>Notes:</strong> {triageInfo.notes}</div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-400">No triage information.</div>
                )}
              </div>

              <div className="bg-white p-6 rounded-[1.2rem] border border-slate-100 shadow-sm flex flex-col gap-3">
                <h3 className="text-sm font-bold text-slate-700">PhilHealth</h3>
                <div className="text-sm text-slate-600">{activePatient?.philhealth_id ? `PhilHealth ID: ${activePatient.philhealth_id}` : 'No PhilHealth ID on file.'}</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigator.clipboard?.writeText(activePatient?.philhealth_id || '')}
                    className="bg-slate-900 text-white px-4 py-2 rounded-lg"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCANNER MODAL */}
      {showScanner && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 w-[520px]">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-bold">QR Scanner</h4>
              <button onClick={() => setShowScanner(false)}><X /></button>
            </div>
            <div className="w-full h-96">
              <Scanner
                onUpdate={(e) => handleQrScan(e)}
                constraints={{ video: { facingMode: "environment" } }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MedicalRecord;
