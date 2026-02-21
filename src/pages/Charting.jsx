import React, { useState, useEffect } from "react";
import {
  Search,
  FileText,
  User,
  Activity,
  HeartPulse,
  AlertCircle,
  Calendar,
  Shield,
  ChevronRight,
  Loader2,
  History,
  X,
  Save,
  FolderOpen,
  QrCode,
  Plus,
  Users,
  MapPin,
  BrainCircuit,
  Thermometer,
  ChevronDown,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { Scanner } from "@yudiel/react-qr-scanner";
import { useLocation, useNavigate } from "react-router-dom";
import Groq from "groq-sdk";

// --- CONFIGURATION ---
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY_CHARTING;
const groq = new Groq({ apiKey: GROQ_API_KEY, dangerouslyAllowBrowser: true });

const Charting = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Navigation & Data States
  const [searchTerm, setSearchTerm] = useState("");
  const [patient, setPatient] = useState(null);
  const [patientBed, setPatientBed] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [recentPatients, setRecentPatients] = useState([]);
  const [history, setHistory] = useState([]);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(true);

  // Advanced Feature States
  const [aiSummary, setAiSummary] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState(null);

  // UI & Authorization States
  const [userRole, setUserRole] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Intake States
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newEntry, setNewEntry] = useState({
    pulse_rate: "",
    blood_pressure: "",
    temperature: "",
    height: "",
    weight: "",
    nature_of_visit: "New Consultation/Case",
    purpose_of_visit: "General Check-up",
    chief_complaint: "",
  });

  // 1. INITIALIZATION
  useEffect(() => {
    document.title = "Charting | ATAMAN Health";
    fetchRecent();
    checkUserRole();

    if (location.state?.patient) {
      selectPatient(location.state.patient);
      if (location.state?.intakeMode) setIsEntryModalOpen(true);
    }
  }, [location.state]);

  const checkUserRole = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("facility_staff")
        .select("role")
        .eq("user_id", user.id)
        .single();
      setUserRole(data?.role);
    }
  };

  const fetchRecent = async () => {
    setLoadingRecent(true);
    const { data } = await supabase
      .from("users")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(6);
    if (data) setRecentPatients(data);
    setLoadingRecent(false);
  };

  // 2. SEARCH LOGIC
  // 2. SEARCH LOGIC
  const handleSearch = async (e, directTerm = null) => {
    if (e) e.preventDefault();
    const termToUse = directTerm || searchTerm;
    const cleanTerm = termToUse?.trim();
    if (!cleanTerm) return;

    setLoading(true);
    setPatient(null);
    setSearchResults([]);

    let query = supabase.from("users").select("*");

    // Check if the term is a valid UUID format (e.g. c7b3d8e0-5e0b...)
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        cleanTerm
      );

    if (isUUID) {
      // If it looks like a UUID, search the primary 'id' column
      query = query.eq("id", cleanTerm);
    } else {
      // If it's NOT a UUID (e.g. "ATAM-123" or "Maria"), DO NOT search the 'id' column
      // Search only text-based columns to avoid Type Mismatch Error (400)
      const words = cleanTerm.split(" ");
      if (words.length > 1) {
        // Name search (First + Last)
        query = query
          .ilike("first_name", `%${words[0]}%`)
          .ilike("last_name", `%${words[words.length - 1]}%`);
      } else {
        // ID string or Single Name search
        query = query.or(
          `medical_id.eq.${cleanTerm},philhealth_id.eq.${cleanTerm},first_name.ilike.%${cleanTerm}%,last_name.ilike.%${cleanTerm}%`
        );
      }
    }

    const { data, error } = await query;

    if (!error && data && data.length > 0) {
      if (data.length === 1) selectPatient(data[0]);
      else setSearchResults(data);
    } else if (!directTerm) {
      alert("No medical records located for: " + cleanTerm);
    }

    setLoading(false);
    // Only hide scanner if we actually ran a search successfully or intentionally
    if (showScanner) setShowScanner(false);
  };

  // --- UPDATED SCANNER LOGIC ---
  const handleQrScan = (detectedCodes) => {
    if (detectedCodes && detectedCodes.length > 0) {
      const rawValue = detectedCodes[0].rawValue;
      if (rawValue) {
        // 1. Close scanner IMMEDIATELY to prevent multiple scans
        setShowScanner(false);
        
        // 2. Process Data
        try {
          const qrData = JSON.parse(rawValue);
          // Prioritize the extracted ID, fallback to raw string
          handleSearch(null, qrData.id || qrData.data || rawValue);
        } catch (e) {
          handleSearch(null, rawValue);
        }
      }
    }
  };

  const selectPatient = async (selectedPatient) => {
    setPatient(selectedPatient);
    setSearchResults([]);
    setAiSummary("");
    setExpandedLogId(null);

    const { data: bedInfo } = await supabase
      .from("beds")
      .select("bed_label, ward_type")
      .eq("patient_id", selectedPatient.id)
      .maybeSingle();
    setPatientBed(bedInfo);

    // Fetch History
    const { data: notes } = await supabase
      .from("clinical_notes")
      .select("*")
      .eq("patient_id", selectedPatient.id)
      .order("created_at", { ascending: false });
    setHistory(notes || []);

    if ((userRole === "DOCTOR" || userRole === "ADMIN") && notes?.length > 0) {
      handleAISummarize(notes);
    }

    const { data: family } = await supabase
      .from("family_members")
      .select("*")
      .eq("user_id", selectedPatient.id);
    setFamilyMembers(family || []);

    await supabase
      .from("users")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", selectedPatient.id);
  };

  const calculateAge = (dob) => {
    if (!dob) return "N/A";
    const ageDifMs = Date.now() - new Date(dob).getTime();
    const ageDate = new Date(ageDifMs);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  };

  const handleAISummarize = async (notes) => {
    setIsSummarizing(true);
    try {
      const allText = notes
        .slice(0, 3)
        .map((n) => n.chief_complaint || n.diagnosis)
        .join(". ");
      const chat = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "Summarize patient status in 2 sentences.",
          },
          { role: "user", content: allText },
        ],
        model: "llama-3.3-70b-versatile",
      });
      setAiSummary(chat.choices[0]?.message?.content || "");
    } catch (e) {
      console.error(e);
    }
    setIsSummarizing(false);
  };

  const handleSaveEntry = async () => {
    if (!newEntry.chief_complaint) return alert("Complaint required.");
    setIsSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("clinical_notes").insert({
      patient_id: patient.id,
      attending_staff_id: user.id,
      pulse_rate: newEntry.pulse_rate,
      blood_pressure: newEntry.blood_pressure,
      temperature: newEntry.temperature,
      height: newEntry.height,
      weight: newEntry.weight,
      nature_of_visit: newEntry.nature_of_visit,
      chief_complaint: newEntry.chief_complaint,
      created_at: new Date().toISOString(),
    });

    if (!error) {
      alert("Encounter records synchronized.");
      setIsEntryModalOpen(false);
      selectPatient(patient);
      if (location.state?.intakeMode) {
        navigate("/assisted-booking", {
          state: { intakeComplete: true, patient },
        });
      }
    }
    setIsSaving(false);
  };

  const fetchDocuments = async (patientId) => {
    setLoadingDocs(true);
    const { data } = await supabase
      .from("medical_documents")
      .select("*")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });
    setDocuments(data || []);
    setLoadingDocs(false);
  };

  const isStaffOnly = userRole !== "DOCTOR" && userRole !== "ADMIN";

  return (
    <div className="p-10 bg-[#F8FAFC] min-h-screen font-sans text-slate-800">
      {/* HEADER */}
      <div className="mb-10 flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-4xl font-black text-slate-800 uppercase tracking-tighter italic leading-none">
            {isStaffOnly ? "Intake Handshake" : "Digital Charting"}
          </h1>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.3em] mt-3">
            {isStaffOnly ? "Station Vitals Node" : "Integrated Clinical Node"}
          </p>
        </div>
        <button
          onClick={() => setShowScanner(true)}
          className="bg-slate-900 text-white px-8 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[#00695C] transition-all shadow-xl active:scale-95 flex items-center gap-3"
        >
          <QrCode size={18} /> Initiate Scan
        </button>
      </div>

      {/* 2. SEARCH BAR */}
      {!patient && (
        <div className="flex gap-4 items-center max-w-2xl mb-12">
          <form
            onSubmit={(e) => handleSearch(e)}
            className="flex-1 flex bg-white p-1 rounded-2xl shadow-sm border border-slate-200 items-center"
          >
            <div className="pl-4 text-slate-300 font-bold">
              <Search size={18} />
            </div>
            <input
              type="text"
              placeholder="Find by ID or Name..."
              className="w-full outline-none px-4 text-sm font-semibold text-slate-600 h-11 bg-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button className="bg-slate-800 text-white px-6 h-11 rounded-xl font-bold text-[10px] uppercase tracking-widest">
              Execute
            </button>
          </form>
        </div>
      )}

      {/* 3. MULTI-MATCH SELECTION */}
      {!patient && searchResults.length > 1 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 mb-12">
          <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest px-2 flex items-center gap-2 italic">
            <AlertCircle size={14} /> Multiple records found. Select record to
            open:
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {searchResults.map((p) => (
              <div
                key={p.id}
                onClick={() => selectPatient(p)}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-[#00695C] cursor-pointer flex justify-between items-center group transition-all"
              >
                <div className="flex items-center gap-4 uppercase font-bold text-slate-300">
                  <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 uppercase">
                    {p.first_name?.[0]}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-xs uppercase leading-tight">
                      {p.first_name} {p.last_name}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter italic">
                      DOB: {p.birth_date} • {p.barangay}
                    </p>
                  </div>
                </div>
                <ChevronRight
                  size={18}
                  className="text-slate-200 group-hover:text-[#00695C] transition-all"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. RECENT RECORDS */}
      {!patient && searchResults.length === 0 && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 flex items-center gap-2 italic">
            <History size={14} className="inline mr-2 text-primary" /> Recent
            clinical records
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {recentPatients.map((p) => (
              <div
                key={p.id}
                onClick={() => selectPatient(p)}
                className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:border-[#00695C] cursor-pointer flex justify-between items-center transition-all group"
              >
                <div className="flex items-center gap-4 text-slate-300 font-bold uppercase">
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 group-hover:text-[#00695C]">
                    {p.first_name?.[0]}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-xs uppercase leading-none">
                      {p.first_name} {p.last_name}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mt-1">
                      {p.barangay || "Naga City"}
                    </p>
                  </div>
                </div>
                <ChevronRight
                  size={16}
                  className="text-slate-200 group-hover:text-[#00695C] transition-all"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. PATIENT PROFILE VIEW */}
      {patient && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 leading-none">
          <div className="bg-white p-10 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-center relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#00695C]" />
            <div className="flex items-center gap-10">
              <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 text-primary shadow-inner font-black uppercase text-xl italic">
                {patient.first_name?.[0]}
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight leading-none uppercase">
                    {patient.first_name} {patient.last_name}
                  </h2>
                  {patientBed && (
                    <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-100 px-3 py-1 rounded-lg uppercase flex items-center gap-2 animate-pulse">
                      <MapPin size={10} /> admitted: {patientBed.ward_type}{" "}
                      {patientBed.bed_label}
                    </span>
                  )}
                </div>
                <div className="flex gap-6 items-center uppercase text-[10px] font-bold text-slate-400 tracking-widest">
                  <span>Medical ID: {patient.medical_id}</span>
                  <span className="text-emerald-600 border-l border-slate-100 pl-6 flex items-center gap-1.5">
                    <Shield size={12} /> YAKAP Verified
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setShowDocs(true);
                  fetchDocuments(patient.id);
                }}
                className="bg-blue-50 text-blue-600 px-6 py-4 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all border border-blue-100 flex items-center gap-2 shadow-sm"
              >
                <FolderOpen size={16} /> Clinical Docs
              </button>
              <button
                onClick={() => setIsEntryModalOpen(true)}
                className="bg-[#00695C] text-white px-8 py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-black transition-all flex items-center gap-3 shadow-lg"
              >
                <Plus size={16} />{" "}
                {isStaffOnly ? "Record Intake" : "New Encounter Entry"}
              </button>
              <button
                onClick={() => setPatient(null)}
                className="p-4 bg-slate-50 text-slate-300 rounded-2xl hover:text-red-500 transition-all"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* INFO TILES */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <InfoCard title="Profile" icon={<Calendar size={16} />}>
              <DataRow
                label="Age"
                value={`${calculateAge(patient.birth_date)} YRS`}
              />
              <DataRow label="Sex" value={patient.gender || "U"} />
              <DataRow label="Barangay" value={patient.barangay || "Naga"} />
            </InfoCard>
            <InfoCard title="Medical" icon={<HeartPulse size={16} />}>
              <DataRow
                label="Blood"
                value={patient.blood_type || "???"}
                color="text-red-600"
              />
              <p className="text-[9px] font-bold text-slate-400 uppercase mt-5 mb-1">
                Known Conditions
              </p>
              <p className="text-xs font-semibold text-slate-600 italic">
                "{patient.medical_conditions || "None listed."}"
              </p>
            </InfoCard>
            <InfoCard title="Emergency" icon={<AlertCircle size={16} />}>
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl mb-4 text-center font-bold text-xs text-rose-600 uppercase tracking-widest leading-none">
                {patient.allergies || "No Allergies"}
              </div>
              <DataRow
                label="Contact"
                value={patient.emergency_contact_phone || "---"}
              />
            </InfoCard>
            <InfoCard title="Household" icon={<Users size={16} />}>
              <div className="space-y-2">
                {familyMembers.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center group"
                  >
                    <div>
                      <p className="text-[10px] font-bold text-slate-800 uppercase mb-1">
                        {m.full_name}
                      </p>
                      <p className="text-[8px] font-bold text-[#00695C] uppercase tracking-tighter">
                        {m.relationship}
                      </p>
                    </div>
                    <span className="text-[9px] font-bold text-slate-300 group-hover:text-primary transition-colors cursor-pointer">
                      {m.phone_number || "---"}
                    </span>
                  </div>
                ))}
              </div>
            </InfoCard>
          </div>

          {/* AI SUMMARY (Doctor only) */}
          {!isStaffOnly && aiSummary && (
            <div className="bg-[#004D40] text-white p-10 rounded-[2.5rem] shadow-xl relative overflow-hidden group">
              <BrainCircuit
                className="absolute -right-4 -top-4 opacity-10 group-hover:rotate-12 transition-transform"
                size={150}
              />
              <h3 className="text-[10px] font-bold uppercase tracking-widest mb-6 flex items-center gap-2 text-teal-300">
                AI Clinical Snapshot
              </h3>
              <p className="text-[14px] font-medium leading-relaxed italic text-teal-50">
                "{aiSummary}"
              </p>
            </div>
          )}

          {/* HISTORY SECTION (RBAC Controlled) */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden mt-8">
            <div className="bg-slate-50 p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.4em]">
                Integrated Encounter Log
              </h3>
            </div>

            <div className="divide-y divide-slate-100">
              {isStaffOnly ? (
                // STAFF VIEW: ONLY SHOW CURRENT VITALS IF RECORDED TODAY
                history.length > 0 &&
                new Date(history[0].created_at).toDateString() ===
                  new Date().toDateString() ? (
                  <div className="p-10">
                    <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-6">
                      Current Encounter Snapshot (Today)
                    </h4>
                    <div className="grid grid-cols-5 gap-4 bg-emerald-50 p-6 rounded-[2rem] border border-emerald-100">
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">
                          BP
                        </p>
                        <p className="text-lg font-black text-slate-700">
                          {history[0].blood_pressure || "--"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">
                          Temp
                        </p>
                        <p className="text-lg font-black text-slate-700">
                          {history[0].temperature || "--"}°C
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">
                          HR
                        </p>
                        <p className="text-lg font-black text-slate-700">
                          {history[0].pulse_rate || "--"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">
                          Weight
                        </p>
                        <p className="text-lg font-black text-slate-700">
                          {history[0].weight || "--"}kg
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">
                          Height
                        </p>
                        <p className="text-lg font-black text-slate-700">
                          {history[0].height || "--"}cm
                        </p>
                      </div>
                    </div>
                    <p className="text-xs font-medium text-slate-500 italic mt-6 border-l-2 border-emerald-200 pl-4">
                      "{history[0].chief_complaint}"
                    </p>
                  </div>
                ) : (
                  <div className="py-24 text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full mx-auto flex items-center justify-center text-slate-200 mb-4">
                      <Shield size={32} />
                    </div>
                    <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest italic mb-2">
                      Historical Archive Restricted
                    </p>
                    <p className="text-[9px] text-slate-300 uppercase tracking-widest">
                      Clearance Level: Intake Officer. Vitals entry permitted.
                    </p>
                  </div>
                )
              ) : (
                // DOCTOR VIEW: EXPANDABLE HISTORICAL LOGS
                history.map((note) => (
                  <div
                    key={note.id}
                    onClick={() =>
                      setExpandedLogId(
                        expandedLogId === note.id ? null : note.id,
                      )
                    }
                    className="p-8 hover:bg-slate-50/50 transition-colors cursor-pointer group"
                  >
                    <div className="grid grid-cols-12 items-start">
                      <div className="col-span-2 text-[10px] font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
                        <ChevronRight
                          size={14}
                          className={`transition-transform ${expandedLogId === note.id ? "rotate-90 text-[#00695C]" : "text-slate-300"}`}
                        />
                        {new Date(note.created_at).toLocaleDateString()}
                      </div>
                      <div className="col-span-10 grid grid-cols-2 gap-12 text-sm leading-relaxed">
                        <div className="border-l-2 border-emerald-100 pl-6 text-slate-500 font-medium italic">
                          "{note.subjective_notes || note.chief_complaint}"
                        </div>
                        <div className="border-l-2 border-slate-100 pl-6">
                          <p className="font-bold text-slate-900 uppercase text-xs mb-1">
                            {note.diagnosis || "Medical Note"}
                          </p>
                          <p className="text-slate-400 text-xs truncate">
                            {note.medical_treatment || note.plan}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* EXPANDABLE VITALS DRAWER */}
                    {expandedLogId === note.id && (
                      <div className="mt-6 ml-24 mr-10 grid grid-cols-5 gap-4 bg-slate-50 p-5 rounded-[1.5rem] border border-slate-100 animate-in slide-in-from-top-2">
                        <div>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">
                            BP
                          </p>
                          <p className="text-sm font-black text-slate-700">
                            {note.blood_pressure || "--"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">
                            Temp
                          </p>
                          <p className="text-sm font-black text-slate-700">
                            {note.temperature || "--"}°C
                          </p>
                        </div>
                        <div>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">
                            HR
                          </p>
                          <p className="text-sm font-black text-slate-700">
                            {note.pulse_rate || "--"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">
                            Weight
                          </p>
                          <p className="text-sm font-black text-slate-700">
                            {note.weight || "--"}kg
                          </p>
                        </div>
                        <div>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">
                            Height
                          </p>
                          <p className="text-sm font-black text-slate-700">
                            {note.height || "--"}cm
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* INTAKE MODAL */}
      {isEntryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl p-12 overflow-y-auto max-h-[95vh] no-scrollbar border border-white/20 animate-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-10 border-b border-slate-100 pb-8">
              <div className="flex items-center gap-5 font-black text-slate-800 tracking-tighter uppercase italic">
                <div className="p-4 bg-emerald-600 rounded-2xl text-white shadow-lg shadow-emerald-900/20">
                  <Activity size={24} />
                </div>
                <div>
                  <h2 className="text-2xl leading-none">
                    Clinical Handover Node
                  </h2>
                  <p className="text-[10px] font-bold text-slate-400 mt-2 tracking-widest uppercase">
                    Recording Vitals & Intake for: {patient.first_name}{" "}
                    {patient.last_name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEntryModalOpen(false)}
                className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
              >
                <X size={32} />
              </button>
            </div>

            <div className="grid grid-cols-12 gap-12">
              <div className="col-span-5 space-y-8">
                <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 shadow-inner">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-6 flex items-center gap-2">
                    <Thermometer size={14} className="text-emerald-500" />{" "}
                    Physical Vitals Ledger
                  </h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <IntakeInput
                        label="Blood Pressure"
                        unit="mmHg"
                        placeholder="120/80"
                        val={newEntry.blood_pressure}
                        set={(v) =>
                          setNewEntry({ ...newEntry, blood_pressure: v })
                        }
                      />
                      <IntakeInput
                        label="Pulse"
                        unit="BPM"
                        placeholder="72"
                        val={newEntry.pulse_rate}
                        set={(v) => setNewEntry({ ...newEntry, pulse_rate: v })}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <IntakeInput
                        label="Temp"
                        unit="°C"
                        placeholder="36.5"
                        val={newEntry.temperature}
                        set={(v) =>
                          setNewEntry({ ...newEntry, temperature: v })
                        }
                      />
                      <IntakeInput
                        label="Height"
                        unit="cm"
                        placeholder="170"
                        val={newEntry.height}
                        set={(v) => setNewEntry({ ...newEntry, height: v })}
                      />
                      <IntakeInput
                        label="Weight"
                        unit="kg"
                        placeholder="65"
                        val={newEntry.weight}
                        set={(v) => setNewEntry({ ...newEntry, weight: v })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-span-7 space-y-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">
                      Nature of Visit
                    </label>
                    <select
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 appearance-none cursor-pointer"
                      value={newEntry.nature_of_visit}
                      onChange={(e) =>
                        setNewEntry({
                          ...newEntry,
                          nature_of_visit: e.target.value,
                        })
                      }
                    >
                      <option value="New Consultation/Case">
                        New Consultation/Case
                      </option>
                      <option value="New Admission">New Admission</option>
                      <option value="Follow-up Visit">Follow-up Visit</option>
                      <option value="Emergency Referral">
                        Outpatient Referral
                      </option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">
                      Attending Role
                    </label>
                    <div className="w-full bg-slate-100/50 border border-slate-100 rounded-2xl p-4 text-xs font-bold text-slate-400 uppercase italic">
                      BHS INTAKE OFFICER
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">
                    Primary Chief Complaint
                  </label>
                  <textarea
                    rows="6"
                    className="w-full bg-slate-50 border border-slate-200 rounded-[2rem] p-6 text-sm font-medium text-slate-700 outline-none focus:border-emerald-500 resize-none italic shadow-inner"
                    placeholder="Detailed description of symptoms reported by patient..."
                    value={newEntry.chief_complaint}
                    onChange={(e) =>
                      setNewEntry({
                        ...newEntry,
                        chief_complaint: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="mt-12 flex gap-4 pt-8 border-t border-slate-50">
              <button
                onClick={() => setIsEntryModalOpen(false)}
                className="flex-1 py-5 text-[10px] font-black text-slate-300 uppercase tracking-widest hover:text-slate-600 transition-all"
              >
                Discard Handshake
              </button>
              <button
                onClick={handleSaveEntry}
                disabled={isSaving}
                className="flex-[2] bg-slate-900 text-white py-5 rounded-[2rem] font-black text-[11px] uppercase tracking-[0.3em] shadow-2xl hover:bg-emerald-600 active:scale-95 transition-all flex items-center justify-center gap-4"
              >
                {isSaving ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Save size={18} />
                )}{" "}
                Commit to Regional EHR Registry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SCANNER MODAL */}
      {showScanner && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-2xl z-[300] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in border border-white/10">
            <div className="p-8 border-b flex justify-between items-center bg-gray-50 uppercase font-bold text-[10px] tracking-widest text-slate-400">
              Electronic Identification{" "}
              <button
                onClick={() => setShowScanner(false)}
                className="text-slate-300 hover:text-red-500"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-3 bg-black relative h-[400px]">
              <Scanner
                onScan={handleQrScan}
                components={{ audio: false, finder: true }}
              />
            </div>
          </div>
        </div>
      )}

      {/* DOCUMENTS MODAL */}
      {showDocs && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[100] flex items-center justify-center p-4"
          onClick={() => setShowDocs(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-xl p-12 overflow-hidden border border-white animate-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-10 border-b border-slate-100 pb-6 uppercase font-bold italic tracking-tighter text-slate-800 text-2xl leading-none">
              Record Archive{" "}
              <button onClick={() => setShowDocs(false)}>
                <X size={32} className="text-slate-300 hover:text-red-500" />
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto max-h-[450px] no-scrollbar">
              {loadingDocs ? (
                <Loader2 className="animate-spin mx-auto text-blue-500" />
              ) : documents.length > 0 ? (
                documents.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.file_path}
                    target="_blank"
                    rel="noreferrer"
                    className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center hover:bg-white transition-all shadow-sm group"
                  >
                    <div className="flex items-center gap-4 text-slate-400 font-bold text-xs uppercase">
                      <FileText size={18} /> {doc.document_name}
                    </div>
                  </a>
                ))
              ) : (
                <p className="text-center text-slate-300 font-bold uppercase text-xs py-20 border border-dashed rounded-3xl">
                  Storage Node Empty
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// HELPERS
const InfoCard = ({ title, icon, children }) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-full group hover:shadow-lg transition-all relative overflow-hidden leading-none">
    <div className="flex items-center gap-2.5 mb-5 border-b border-slate-50 pb-3 text-slate-300 group-hover:text-[#00695C] transition-colors leading-none">
      {icon}{" "}
      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
        {title}
      </h3>
    </div>
    <div className="space-y-4 flex-grow">{children}</div>
  </div>
);

const DataRow = ({ label, value, color = "text-slate-800" }) => (
  <div className="flex justify-between items-center text-xs leading-none">
    <span className="font-bold text-slate-300 uppercase tracking-tighter text-[9px]">
      {label}
    </span>
    <span className={`font-bold uppercase ${color} tracking-tighter`}>
      {value}
    </span>
  </div>
);

const IntakeInput = ({ label, unit, placeholder, val, set }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">
      {label}
    </label>
    <div className="relative">
      <input
        type="text"
        placeholder={placeholder}
        className="w-full bg-white border border-slate-200 rounded-xl p-4 text-sm font-black text-slate-800 outline-none focus:border-emerald-500 tabular-nums"
        value={val}
        onChange={(e) => set(e.target.value)}
      />
      <span className="absolute right-4 top-4 text-[9px] font-black text-slate-300 uppercase italic">
        {unit}
      </span>
    </div>
  </div>
);

export default Charting;