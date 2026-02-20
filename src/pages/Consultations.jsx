import React, { useState, useEffect } from "react";
import {
  User,
  Activity,
  Calendar,
  Clock,
  MapPin,
  ChevronRight,
  QrCode,
  Search,
  Thermometer,
  Stethoscope,
  Share2,
  Save,
  Loader2,
  X,
  Shield,
  Video,
  Phone
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { Scanner } from "@yudiel/react-qr-scanner";

const Consultations = () => {
  // --- STATES ---
  const [appointments, setAppointments] = useState([]);
  const [activePatient, setActivePatient] = useState(null);
  const [triageInfo, setTriageInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReferralModalOpen, setIsReferralModalOpen] = useState(false);

  // Doctor Input State
  const [consultationData, setConsultationData] = useState({
    diagnosis: "",
    treatment: "",
    lab_findings: "",
    notes: ""
  });

  useEffect(() => {
    document.title = "Doctor Console | ATAMAN";
    fetchAppointments();
  }, []);

  // --- 1. FETCH BOOKINGS (Mocked) ---
  const fetchAppointments = async () => {
    const mockData = [
      { id: 101, time: "09:00 AM", type: "Online Consult", patient_name: "Maria Santos", patient_id: "c7b3d8e0-5e0b-4b0f-8b3a-1b9d4b3d8e0b", status: "WAITING", reason: "Persistent Cough" },
      { id: 102, time: "09:30 AM", type: "Follow-up", patient_name: "Juan Dela Cruz", patient_id: "a1b2c3d4-e5f6-7890-1234-567890abcdef", status: "CONFIRMED", reason: "Hypertension Refill" },
      { id: 103, time: "10:15 AM", type: "Online Consult", patient_name: "Elena Govan", patient_id: "uuid-placeholder-3", status: "PENDING", reason: "Skin Rash" },
    ];
    setAppointments(mockData);
  };

  // --- 2. ROBUST SEARCH LOGIC (Matches Charting.jsx) ---
  const handleSearch = async (e, directTerm = null) => {
    if (e) e.preventDefault();
    
    // In Doctor console, we usually scan, so we prioritize directTerm
    const cleanTerm = directTerm?.trim();
    if (!cleanTerm) return;

    setLoading(true);

    // Regex to detect if the term is a UUID (like from the QR code)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanTerm);
    
    let query = supabase.from("users").select("*");

    if (isUUID) {
      query = query.eq("id", cleanTerm);
    } else {
      query = query.or(
        `first_name.ilike.%${cleanTerm}%,last_name.ilike.%${cleanTerm}%,philhealth_id.eq.${cleanTerm},medical_id.eq.${cleanTerm}`
      );
    }

    const { data, error } = await query;

    if (!error && data && data.length > 0) {
        // Found a patient! Load their workspace.
        loadPatientWorkspace(data[0]);
    } else {
        alert("No medical record located.");
    }
    
    setLoading(false);
    setShowScanner(false);
  };

  // --- 3. ROBUST QR SCANNER (Matches Charting.jsx) ---
  const handleQrScan = (detectedCodes) => {
    if (detectedCodes && detectedCodes.length > 0 && detectedCodes[0]?.rawValue) {
      const rawValue = detectedCodes[0].rawValue;
      try {
        // Attempt to parse the Secure JSON Format
        const qrData = JSON.parse(rawValue);
        
        // Pass the extracted ID to search
        handleSearch(null, qrData.id || qrData.data || rawValue);
      } catch (e) {
        // Fallback: If it's not JSON, treat it as a raw ID/Name
        handleSearch(null, rawValue);
      }
    }
  };

  // --- 4. LOAD WORKSPACE (BHW Handoff) ---
  const loadPatientWorkspace = async (patientData) => {
    setActivePatient(patientData);
    
    // Fetch BHW Triage Data
    const { data: triage } = await supabase
        .from('triage_results')
        .select('*')
        .eq('user_id', patientData.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    setTriageInfo(triage);
  };

  const handleSaveConsultation = async () => {
    if (!consultationData.diagnosis) return alert("Diagnosis is required.");
    setIsSaving(true);
    
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from("clinical_notes").insert({
        patient_id: activePatient.id,
        doctor_id: user.id,
        assessment: consultationData.diagnosis,
        plan: consultationData.treatment,
        objective_notes: `LABS: ${consultationData.lab_findings}`,
        subjective_notes: triageInfo?.chief_complaint || consultationData.notes || "Consultation Entry",
        created_at: new Date().toISOString()
    });

    if (!error) {
        alert("Consultation Saved Successfully");
        setConsultationData({ diagnosis: "", treatment: "", lab_findings: "", notes: "" });
        setActivePatient(null);
    }
    setIsSaving(false);
  };

  return (
    <div className="p-10 bg-[#F8FAFC] min-h-screen font-sans text-slate-800">
      
      {/* HEADER */}
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">Doctor Console</h1>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.3em]">
            Schedule & Clinical Workspace
          </p>
        </div>
        <div className="flex items-center gap-3">
             <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-[10px] font-bold uppercase text-slate-500">System Online</span>
             </div>
             <div className="w-10 h-10 bg-slate-200 rounded-full overflow-hidden border-2 border-white shadow-md">
                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Doctor" alt="Doc" />
             </div>
        </div>
      </div>

      {/* SCHEDULE SCROLL */}
      {!activePatient && (
        <div className="mb-12 animate-in slide-in-from-top-4 duration-500">
            <div className="flex justify-between items-center mb-4 px-2">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Calendar size={14}/> Today's Schedule ({appointments.length})
                </h3>
            </div>
            
            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                <div 
                    onClick={() => setShowScanner(true)}
                    className="min-w-[280px] bg-slate-900 text-white p-6 rounded-[2rem] shadow-xl shadow-slate-200 cursor-pointer hover:scale-[1.02] transition-transform group relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
                        <QrCode size={80} />
                    </div>
                    <div className="h-full flex flex-col justify-between relative z-10">
                        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center mb-4">
                            <QrCode size={20} />
                        </div>
                        <div>
                            <h4 className="text-lg font-black uppercase tracking-tight">Walk-In Patient</h4>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">Scan ID or QR</p>
                        </div>
                    </div>
                </div>

                {appointments.map(apt => (
                    <div 
                        key={apt.id}
                        onClick={() => handleSearch(null, apt.patient_id)}
                        className="min-w-[300px] bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-lg hover:border-emerald-100 cursor-pointer transition-all group"
                    >
                        <div className="flex justify-between items-start mb-4">
                            <span className="bg-slate-50 text-slate-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                                <Clock size={12}/> {apt.time}
                            </span>
                            {apt.type === "Online Consult" ? (
                                <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded-md"><Video size={14}/></span>
                            ) : (
                                <span className="bg-orange-50 text-orange-600 px-2 py-1 rounded-md"><User size={14}/></span>
                            )}
                        </div>
                        
                        <div className="mb-4">
                            <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight truncate">{apt.patient_name}</h4>
                            <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wide mt-1 truncate">{apt.reason}</p>
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400">
                                    {apt.patient_name[0]}
                                </div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase">
                                    {apt.status}
                                </span>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                                <ChevronRight size={16} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      )}

      {/* DOCTOR WORKSPACE */}
      {activePatient ? (
        <div className="animate-in slide-in-from-bottom-8 duration-700">
            <button 
                onClick={() => setActivePatient(null)}
                className="mb-6 flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-800 transition-colors"
            >
                <X size={14}/> Close Workspace
            </button>

            <div className="grid grid-cols-12 gap-8">
                
                {/* LEFT: BHW HANDOFF (VITALS) */}
                <div className="col-span-4 space-y-6">
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 text-center relative overflow-hidden">
                        <div className="w-24 h-24 bg-slate-50 rounded-3xl mx-auto flex items-center justify-center text-slate-300 mb-6 border border-slate-100">
                            <User size={48} />
                        </div>
                        <h2 className="text-2xl font-black text-slate-800 uppercase leading-none">{activePatient.first_name} {activePatient.last_name}</h2>
                        <div className="flex justify-center gap-2 mt-3 mb-6">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md">
                                {activePatient.gender || "N/A"}
                            </span>
                             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md">
                                {activePatient.birth_date || "N/A"}
                            </span>
                        </div>
                        {activePatient.is_philhealth_verified && (
                            <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                                <Shield size={14}/> Verified Coverage
                            </div>
                        )}
                    </div>

                    {/* TRIAGE DATA */}
                    <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden group">
                        <Thermometer className="absolute -right-6 -top-6 text-white/5 rotate-12 group-hover:rotate-45 transition-transform duration-700" size={150} />
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                             BHW Vitals Handoff
                        </h3>
                        
                        {triageInfo ? (
                            <div className="space-y-6 relative z-10">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm hover:bg-white/20 transition-colors">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">BP</p>
                                        <p className="text-2xl font-black text-white tracking-tighter">{triageInfo.systolic}/{triageInfo.diastolic}</p>
                                    </div>
                                    <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm hover:bg-white/20 transition-colors">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">Temp</p>
                                        <p className="text-2xl font-black text-white tracking-tighter">{triageInfo.temperature}°C</p>
                                    </div>
                                    <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm hover:bg-white/20 transition-colors">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">HR</p>
                                        <p className="text-2xl font-black text-white tracking-tighter">{triageInfo.heart_rate}</p>
                                    </div>
                                    <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm hover:bg-white/20 transition-colors">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">O2</p>
                                        <p className="text-2xl font-black text-white tracking-tighter">{triageInfo.oxygen_sat}%</p>
                                    </div>
                                </div>
                                <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">
                                        <Activity size={10} /> Chief Complaint
                                    </p>
                                    <p className="text-sm font-medium text-emerald-200 italic leading-relaxed">
                                        "{triageInfo.chief_complaint || "No specific complaint recorded."}"
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="py-12 text-center text-slate-600 text-[10px] font-bold uppercase tracking-widest border-2 border-dashed border-slate-800 rounded-2xl">
                                No Vitals Recorded Today
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT: DOCTOR INPUTS */}
                <div className="col-span-8">
                    <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200 h-full flex flex-col">
                        <div className="flex justify-between items-center mb-10 border-b border-slate-50 pb-8">
                            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3">
                                <Stethoscope className="text-primary"/> Clinical Decision
                            </h2>
                            <button 
                                onClick={() => setIsReferralModalOpen(true)}
                                className="bg-orange-50 text-orange-600 px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-orange-100 transition-all flex items-center gap-2"
                            >
                                <Share2 size={14} /> Refer Patient
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-8 flex-grow">
                            <div className="space-y-8">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block px-1">Diagnosis (Assessment)</label>
                                    <textarea 
                                        className="w-full bg-slate-50 rounded-[1.5rem] p-6 text-sm font-bold text-slate-800 outline-none h-40 resize-none focus:ring-2 focus:ring-emerald-100 transition-all border-none"
                                        placeholder="Enter final diagnosis..."
                                        value={consultationData.diagnosis}
                                        onChange={e => setConsultationData({...consultationData, diagnosis: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block px-1">Lab Findings / Impressions</label>
                                    <textarea 
                                        className="w-full bg-slate-50 rounded-[1.5rem] p-6 text-sm font-medium text-slate-600 outline-none h-40 resize-none focus:ring-2 focus:ring-emerald-100 transition-all border-none"
                                        placeholder="CBC results, X-Ray interpretation..."
                                        value={consultationData.lab_findings}
                                        onChange={e => setConsultationData({...consultationData, lab_findings: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="space-y-8 flex flex-col">
                                <div className="flex-grow flex flex-col">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block px-1">Medical Treatment (Plan)</label>
                                    <textarea 
                                        className="w-full bg-slate-50 rounded-[1.5rem] p-6 text-sm font-medium text-slate-600 outline-none flex-grow resize-none focus:ring-2 focus:ring-emerald-100 transition-all border-none"
                                        placeholder="Prescriptions, Medical Advice, Follow-up..."
                                        value={consultationData.treatment}
                                        onChange={e => setConsultationData({...consultationData, treatment: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="mt-10 flex justify-end gap-4 border-t border-slate-50 pt-8">
                             <button 
                                onClick={() => setActivePatient(null)}
                                className="px-8 py-4 rounded-2xl text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:bg-slate-50 hover:text-slate-600 transition-colors"
                            >
                                Cancel Session
                            </button>
                            <button 
                                onClick={handleSaveConsultation}
                                disabled={isSaving}
                                className="bg-slate-900 text-white px-12 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 shadow-xl shadow-emerald-900/10 transition-all flex items-center gap-3 active:scale-95"
                            >
                                {isSaving ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>}
                                Save & Close
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      ) : (
        /* EMPTY STATE (DEFAULT VIEW) */
        <div className="flex flex-col items-center justify-center h-[50vh] text-center space-y-8 animate-in fade-in duration-700">
            <div className="relative">
                <div className="w-32 h-32 bg-white rounded-[2.5rem] shadow-lg shadow-slate-200 border border-slate-100 flex items-center justify-center text-slate-300 relative z-10">
                    <QrCode size={48} />
                </div>
                <div className="absolute top-0 left-0 w-full h-full bg-emerald-500/10 rounded-[2.5rem] blur-2xl -z-0 animate-pulse"></div>
            </div>
            <div>
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Ready for Consultation</h3>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-3">Select a booked patient above or scan a walk-in</p>
            </div>
            <button 
                onClick={() => setShowScanner(true)}
                className="bg-primary text-white px-10 py-5 rounded-3xl font-bold text-xs uppercase tracking-widest hover:bg-emerald-700 shadow-2xl shadow-emerald-900/20 transition-all active:scale-95 flex items-center gap-3"
            >
                <QrCode size={18}/> Activate Scanner
            </button>
        </div>
      )}

      {/* --- SCANNERS & MODALS --- */}
      {showScanner && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-2xl z-[300] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in border border-white/10">
                <div className="p-8 border-b flex justify-between items-center bg-gray-50 uppercase font-bold text-[10px] tracking-widest text-slate-400">
                    Scan ID <button onClick={() => setShowScanner(false)}><X size={20}/></button>
                </div>
                <div className="p-2 bg-black h-[400px]">
                    {/* UPDATED: Connected to handleQrScan */}
                    <Scanner onScan={handleQrScan} components={{ audio: false, finder: true }} />
                </div>
            </div>
        </div>
      )}

      {isReferralModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg p-10 animate-in zoom-in border border-white">
                <h3 className="text-xl font-black text-slate-800 uppercase mb-6 flex items-center gap-2">
                    <Share2 size={24} className="text-orange-500"/> Refer Patient
                </h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Reason for Referral</p>
                <textarea 
                    className="w-full bg-slate-50 rounded-2xl p-6 text-sm font-medium outline-none h-40 mb-8 resize-none"
                    placeholder="Describe condition requiring external care..."
                    value={consultationData.referral_reason || ""}
                    onChange={(e) => setConsultationData({...consultationData, referral_reason: e.target.value})}
                ></textarea>
                <div className="flex gap-4">
                    <button 
                        onClick={() => setIsReferralModalOpen(false)} 
                        className="flex-1 py-4 text-xs font-bold uppercase text-slate-400 hover:text-slate-600"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={() => {
                            alert("Referral Generated");
                            setIsReferralModalOpen(false);
                        }} 
                        className="flex-1 py-4 bg-orange-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl hover:bg-orange-600 transition-all"
                    >
                        Confirm Transfer
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default Consultations;