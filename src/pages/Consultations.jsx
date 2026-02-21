import React, { useState, useEffect } from "react";
import {
  User,
  Activity,
  Calendar,
  Clock,
  ChevronRight,
  Search,
  Thermometer,
  Stethoscope,
  Save,
  Loader2,
  X,
  Shield,
  Scale,
  Ruler,
  CheckCircle,
  Video,
  MapPin,
  QrCode, // <--- Added this import
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import TelemedWindow from "./Telemed";
import { Scanner } from "@yudiel/react-qr-scanner"; // <--- Added this import

const Consultations = () => {
  const navigate = useNavigate();

  const [activeTelemedSession, setActiveTelemedSession] = useState(null);
  const [unifiedQueue, setUnifiedQueue] = useState([]);
  const [historyLog, setHistoryLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [myFacilityId, setMyFacilityId] = useState(null);

  // --- NEW: Scanner State ---
  const [showScanner, setShowScanner] = useState(false);

  const [activePatient, setActivePatient] = useState(null);
  const [activeBookingId, setActiveBookingId] = useState(null);
  const [triageInfo, setTriageInfo] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [consultationData, setConsultationData] = useState({
    diagnosis: "",
    medical_treatment: "",
    lab_findings: "",
    notes: "",
  });

  useEffect(() => {
    document.title = "Doctor Console | ATAMAN";
    initializeConsole();

    const bookingsChannel = supabase
      .channel("live-bookings-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => {
          console.log("Live update: Bookings changed, refreshing schedule...");
          initializeConsole();
        },
      )
      .subscribe();

    const telemedChannel = supabase
      .channel("live-telemed-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "telemed_sessions" },
        () => {
          console.log(
            "Live update: Telemed sessions changed, refreshing schedule...",
          );
          initializeConsole();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(telemedChannel);
    };
  }, []);

  const initializeConsole = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: staffData } = await supabase
        .from("facility_staff")
        .select("facility_id")
        .eq("user_id", user.id)
        .single();

      const { data: telemedData } = await supabase
        .from("telemed_doctors")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (staffData) {
        setMyFacilityId(staffData.facility_id);
        const doctorId = telemedData?.id;

        let bookingsQuery = supabase
          .from("bookings")
          .select(
            "id, appointment_time, nature_of_visit, status, chief_complaint, users(*)",
          )
          .eq("facility_id", staffData.facility_id)
          .eq("status", "pending");

        if (doctorId) {
          bookingsQuery = bookingsQuery.eq("assigned_doctor_id", doctorId);
        }

        const { data: bookingsData, error: bookingsError } =
          await bookingsQuery;
        if (bookingsError)
          console.error("Bookings Fetch Error:", bookingsError.message);

        let telemedsData = [];
        if (doctorId) {
          const { data: tData, error: telemedError } = await supabase
            .from("telemed_sessions")
            .select(
              "id, scheduled_time, status, started_at, meeting_link, metadata, users(*)",
            )
            .eq("doctor_id", doctorId)
            .in("status", ["scheduled", "active"]);

          if (telemedError)
            console.error("Telemed Fetch Error:", telemedError.message);
          if (tData) telemedsData = tData;
        }

        const combined = [];

        if (bookingsData) {
          combined.push(
            ...bookingsData.map((b) => {
              const patientObj = Array.isArray(b.users) ? b.users[0] : b.users;
              return {
                type: "IN-PERSON",
                unique_id: `book_${b.id}`,
                original_id: b.id,
                time: b.appointment_time,
                patient: patientObj,
                reason:
                  b.chief_complaint || b.nature_of_visit || "General Intake",
                status: b.status,
                raw: b,
              };
            }),
          );
        }

        if (telemedsData) {
          combined.push(
            ...telemedsData.map((t) => {
              const patientObj = Array.isArray(t.users) ? t.users[0] : t.users;
              return {
                type: "TELEMED",
                unique_id: `tele_${t.id}`,
                original_id: t.id,
                time:
                  t.scheduled_time || t.started_at || new Date().toISOString(),
                patient: patientObj,
                reason: t.metadata?.reason || "Online Consultation",
                status: t.status,
                raw: t,
              };
            }),
          );
        }

        combined.sort((a, b) => new Date(a.time) - new Date(b.time));
        setUnifiedQueue(combined);

        const { data: notesData } = await supabase
          .from("clinical_notes")
          .select(`id, created_at, diagnosis, users:patient_id(*)`)
          .eq("doctor_id", user.id)
          .order("created_at", { ascending: false });

        if (notesData) {
          const uniqueMap = new Map();
          notesData.forEach((note) => {
            const pObj = Array.isArray(note.users) ? note.users[0] : note.users;
            if (pObj && !uniqueMap.has(pObj.id)) {
              uniqueMap.set(pObj.id, { ...note, users: pObj });
            }
          });
          setHistoryLog(Array.from(uniqueMap.values()));
        }
      }
    } catch (err) {
      console.error("Initialization Error:", err);
    }
    setLoading(false);
  };

  // --- NEW: Scanner Handler ---
  const handleQrScan = (detectedCodes) => {
    if (detectedCodes && detectedCodes.length > 0) {
        const rawValue = detectedCodes[0].rawValue;
        // If it's a JSON QR, try to parse it, otherwise use raw text
        try {
            const parsed = JSON.parse(rawValue);
            setSearchTerm(parsed.id || rawValue);
        } catch (e) {
            setSearchTerm(rawValue);
        }
        setShowScanner(false);
    }
  };

  const handleCardClick = (item) => {
    if (!item.patient) {
      alert("Error: Patient data missing from this record.");
      return;
    }

    if (item.type === "TELEMED") {
      setActiveTelemedSession(item.raw);
    } else {
      setActiveBookingId(item.original_id);
      loadPatientWorkspace(item.patient);
    }
  };

  const loadPatientWorkspace = async (patientData) => {
    if (!patientData) return;
    setActivePatient(patientData);

    const { data: latestNote } = await supabase
      .from("clinical_notes")
      .select("*")
      .eq("patient_id", patientData.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setTriageInfo(latestNote);
  };

  const handleSaveConsultation = async () => {
    if (!consultationData.diagnosis) return alert("Diagnosis is required.");
    setIsSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const notePayload = {
      patient_id: activePatient.id,
      doctor_id: user.id,
      diagnosis: consultationData.diagnosis,
      medical_treatment: consultationData.medical_treatment,
      "lab_findings/impressions": consultationData.lab_findings,
      chief_complaint:
        triageInfo?.chief_complaint || consultationData.notes || "Follow-up",
      pulse_rate: triageInfo?.pulse_rate || "N/A",
      blood_pressure: triageInfo?.blood_pressure || "N/A",
      temperature: triageInfo?.temperature || "N/A",
      height: triageInfo?.height || "N/A",
      weight: triageInfo?.weight || "N/A",
      nature_of_visit: "Consultation",
      purpose_of_visit: "Medical Advice",
      attending_staff_id: user.id,
    };

    const { error } = await supabase.from("clinical_notes").insert(notePayload);

    if (!error) {
      if (activeBookingId) {
        await supabase
          .from("bookings")
          .update({ status: "completed" })
          .eq("id", activeBookingId);

        setUnifiedQueue((prevQueue) => 
          prevQueue.filter((item) => item.original_id !== activeBookingId)
        );
      }

      alert("Consultation Saved Successfully");
      
      setConsultationData({
        diagnosis: "",
        medical_treatment: "",
        lab_findings: "",
        notes: "",
      });
      
      setActivePatient(null);
      setActiveBookingId(null);
      
      initializeConsole(); 
    } else {
      alert("Failed to save consultation.");
    }
    setIsSaving(false);
  };

  const filteredQueue = unifiedQueue.filter((q) => {
    if (!q.patient) return false;
    return `${q.patient.first_name} ${q.patient.last_name}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
  });

  return (
    <div className="p-10 bg-[#F8FAFC] min-h-screen font-sans text-slate-800 flex flex-col">
      {/* HEADER */}
      <div className="mb-10 flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-4xl font-black text-slate-800 uppercase tracking-tighter italic leading-none">
            Doctor Console
          </h1>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.3em] mt-3">
            Unified Schedule & Clinical Workspace
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white px-5 py-2.5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#00695C] animate-pulse"></div>
            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
              System Online
            </span>
          </div>
        </div>
      </div>

      {!activePatient && (
        <div className="animate-in slide-in-from-top-4 duration-500 flex-1 flex flex-col min-h-0">
          
          {/* CONTROL BAR: SEARCH + SCANNER */}
          <div className="max-w-xl mb-8 flex gap-4">
            <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3 focus-within:ring-2 ring-emerald-500/20 transition-all flex-1">
              <Search size={18} className="text-slate-400 ml-3" />
              <input
                type="text"
                placeholder="Filter schedule by patient..."
                className="w-full bg-transparent outline-none text-xs font-bold text-slate-700 py-2 placeholder:text-slate-300 uppercase tracking-widest"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {/* SCANNER BUTTON */}
            <button 
                onClick={() => setShowScanner(true)}
                className="bg-white px-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-2 hover:border-[#00695C] group transition-all"
            >
                <QrCode size={18} className="text-slate-400 group-hover:text-[#00695C] transition-colors"/>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-[#00695C]">Scan ID</span>
            </button>
          </div>

          {/* UNIFIED QUEUE LIST */}
          <div className="flex-1 min-h-0 flex flex-col">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4 px-1">
              <Calendar size={14} className="text-[#00695C]" /> Upcoming
              Schedule ({filteredQueue.length})
            </h3>

            {loading ? (
              <div className="py-20 text-center flex flex-col items-center justify-center opacity-50">
                <Loader2
                  className="animate-spin text-[#00695C] mb-4"
                  size={32}
                />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Syncing Master Schedule...
                </span>
              </div>
            ) : filteredQueue.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto pb-10 custom-scrollbar pr-2">
                {filteredQueue.map((item) => (
                  <div
                    key={item.unique_id}
                    onClick={() => handleCardClick(item)}
                    className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-lg hover:border-[#00695C] cursor-pointer transition-all group flex flex-col relative overflow-hidden"
                  >
                    {/* Status Strip */}
                    <div
                      className={`absolute left-0 top-0 bottom-0 w-1.5 ${item.type === "TELEMED" ? "bg-blue-500" : "bg-[#00695C]"}`}
                    />

                    <div className="flex justify-between items-start mb-6">
                      <div
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${item.type === "TELEMED" ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-[#00695C]"}`}
                      >
                        {item.type === "TELEMED" ? (
                          <Video size={12} />
                        ) : (
                          <MapPin size={12} />
                        )}
                        {item.type === "TELEMED"
                          ? "Video Consult"
                          : "On-Site Intake"}
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-md flex items-center gap-1">
                        <Clock size={10} />
                        {new Date(item.time).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <div className="flex-1">
                      <h4 className="text-xl font-black text-slate-800 uppercase tracking-tighter leading-none mb-2 group-hover:text-[#00695C] transition-colors">
                        {item.patient?.first_name} {item.patient?.last_name}
                      </h4>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest line-clamp-2 italic">
                        "{item.reason}"
                      </p>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-50 flex justify-between items-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1">
                        ID:{" "}
                        <span className="text-slate-600">
                          {item.patient?.medical_id || "UNREGISTERED"}
                        </span>
                      </span>
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${item.type === "TELEMED" ? "bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white" : "bg-emerald-50 text-emerald-600 group-hover:bg-[#00695C] group-hover:text-white"}`}
                      >
                        <ChevronRight size={16} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-20 text-center text-slate-400 text-[10px] font-black uppercase tracking-widest border-2 border-dashed border-slate-200 rounded-[3rem]">
                No Appointments Scheduled
              </div>
            )}
          </div>
        </div>
      )}

      {/* DOCTOR WORKSPACE (ON-SITE INTAKES) */}
      {activePatient && (
        <div className="animate-in slide-in-from-bottom-8 duration-500 flex-1 flex flex-col min-h-0">
          <button
            onClick={() => {
              setActivePatient(null);
              setActiveBookingId(null);
            }}
            className="mb-6 flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-800 transition-colors w-max"
          >
            <X size={14} /> Close Workspace
          </button>

          <div className="grid grid-cols-12 gap-8 flex-1 min-h-0">
            {/* VITALS PANEL */}
            <div className="col-span-4 space-y-6 overflow-y-auto no-scrollbar pb-6">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 text-center">
                <div className="w-20 h-20 bg-slate-50 rounded-3xl mx-auto flex items-center justify-center text-slate-300 mb-6 border border-slate-100">
                  <User size={32} />
                </div>
                <h2 className="text-xl font-black text-slate-800 uppercase leading-none mb-3">
                  {activePatient.first_name} {activePatient.last_name}
                </h2>
                <div className="flex justify-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md">
                    {activePatient.gender || "U"}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md">
                    ID: {activePatient.medical_id}
                  </span>
                </div>
              </div>

              <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden">
                <Thermometer
                  className="absolute -right-6 -top-6 text-white/5 rotate-12"
                  size={120}
                />
                <h3 className="text-[10px] font-bold text-emerald-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                  <Activity size={14} /> Intake Vitals
                </h3>

                {triageInfo ? (
                  <div className="space-y-4 relative z-10">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/10 p-4 rounded-2xl">
                        <p className="text-[8px] font-bold text-slate-400 uppercase">
                          Blood Pressure
                        </p>
                        <p className="text-xl font-black">
                          {triageInfo.blood_pressure || "--"}
                        </p>
                      </div>
                      <div className="bg-white/10 p-4 rounded-2xl">
                        <p className="text-[8px] font-bold text-slate-400 uppercase">
                          Temperature
                        </p>
                        <p className="text-xl font-black">
                          {triageInfo.temperature || "--"}°C
                        </p>
                      </div>
                      <div className="bg-white/10 p-4 rounded-2xl">
                        <p className="text-[8px] font-bold text-slate-400 uppercase flex items-center gap-1">
                          <Scale size={10} /> Weight
                        </p>
                        <p className="text-xl font-black">
                          {triageInfo.weight || "--"}{" "}
                          <span className="text-[10px]">kg</span>
                        </p>
                      </div>
                      <div className="bg-white/10 p-4 rounded-2xl">
                        <p className="text-[8px] font-bold text-slate-400 uppercase flex items-center gap-1">
                          <Ruler size={10} /> Height
                        </p>
                        <p className="text-xl font-black">
                          {triageInfo.height || "--"}{" "}
                          <span className="text-[10px]">cm</span>
                        </p>
                      </div>
                    </div>
                    <div className="bg-white/5 p-5 rounded-2xl border border-white/5 mt-4">
                      <p className="text-[8px] font-bold text-slate-400 uppercase mb-2">
                        Chief Complaint
                      </p>
                      <p className="text-xs font-medium text-emerald-100 italic leading-relaxed">
                        "{triageInfo.chief_complaint || "No complaint recorded"}
                        "
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="py-10 text-center text-slate-500 text-[10px] font-bold uppercase tracking-widest border-2 border-dashed border-slate-700 rounded-2xl">
                    No Vitals Recorded
                  </div>
                )}
              </div>
            </div>

            {/* DOCTOR INPUTS */}
            <div className="col-span-8 flex flex-col h-full min-h-0">
              <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200 flex flex-col flex-1 min-h-0">
                <div className="flex justify-between items-center mb-8 border-b border-slate-50 pb-6 shrink-0">
                  <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3">
                    <Stethoscope className="text-[#00695C]" /> Clinical
                    Assessment
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-8 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  <div className="space-y-6 flex flex-col">
                    <div className="flex-1 flex flex-col min-h-[150px]">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">
                        Final Diagnosis
                      </label>
                      <textarea
                        className="w-full bg-slate-50 rounded-[1.5rem] p-5 text-sm font-bold text-slate-800 outline-none flex-1 resize-none focus:ring-2 ring-emerald-500/20 transition-all border border-transparent focus:border-emerald-200"
                        placeholder="Enter diagnosis here..."
                        value={consultationData.diagnosis}
                        onChange={(e) =>
                          setConsultationData({
                            ...consultationData,
                            diagnosis: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="flex-1 flex flex-col min-h-[150px]">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">
                        Lab Findings & Notes
                      </label>
                      <textarea
                        className="w-full bg-slate-50 rounded-[1.5rem] p-5 text-sm font-medium text-slate-600 outline-none flex-1 resize-none focus:ring-2 ring-emerald-500/20 transition-all border border-transparent focus:border-emerald-200"
                        placeholder="Interpretations, symptoms..."
                        value={consultationData.lab_findings}
                        onChange={(e) =>
                          setConsultationData({
                            ...consultationData,
                            lab_findings: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="flex flex-col h-full min-h-[300px]">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">
                      Medical Plan & Prescriptions
                    </label>
                    <textarea
                      className="w-full bg-slate-50 rounded-[1.5rem] p-5 text-sm font-medium text-slate-600 outline-none flex-1 resize-none focus:ring-2 ring-emerald-500/20 transition-all border border-transparent focus:border-emerald-200"
                      placeholder="Treatment instructions..."
                      value={consultationData.medical_treatment}
                      onChange={(e) =>
                        setConsultationData({
                          ...consultationData,
                          medical_treatment: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="mt-8 flex justify-end gap-4 border-t border-slate-50 pt-6 shrink-0">
                  <button
                    onClick={() => {
                      setActivePatient(null);
                      setActiveBookingId(null);
                    }}
                    className="px-8 py-4 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-slate-50 transition-colors"
                  >
                    Cancel Session
                  </button>
                  <button
                    onClick={handleSaveConsultation}
                    disabled={isSaving}
                    className="bg-slate-900 text-white px-12 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[#00695C] shadow-xl active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <Save size={16} />
                    )}{" "}
                    Save & Complete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RENDER THE TELEMED MODULE OVERLAY WHEN ACTIVE */}
      {activeTelemedSession && (
        <TelemedWindow
          session={activeTelemedSession}
          onClose={() => setActiveTelemedSession(null)}
          onComplete={() => {
            // INSTANTLY remove the session from the list
            setUnifiedQueue((prev) =>
              prev.filter((q) => q.original_id !== activeTelemedSession.id),
            );
            setActiveTelemedSession(null);

            // Still re-fetch in the background to keep data fresh
            initializeConsole();
          }}
        />
      )}

        {/* --- NEW: SCANNER MODAL --- */}
        {showScanner && (
        <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in border border-white/20">
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Scan Patient ID</span>
                    <button onClick={() => setShowScanner(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={16}/></button>
                </div>
                <div className="p-4 bg-black h-[350px] relative">
                     {/* The Scanner component from the library */}
                    <Scanner 
                        onScan={handleQrScan} 
                        components={{ audio: false, finder: true }}
                    />
                </div>
            </div>
        </div>
        )}

    </div>
  );
};

export default Consultations;