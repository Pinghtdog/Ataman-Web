import React, { useState, useEffect, useRef } from "react";
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
  History,
  X,
  Save,
  FolderOpen,
  QrCode,
  Plus,
  ClipboardCheck,
  Users,
  ExternalLink,
  MapPin,
  BrainCircuit,
  TrendingUp,
  BarChart3,
  CheckCircle2,
  Stethoscope,
  PlusCircle,
  Pill,
  Check,
  ChevronDown,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { Scanner } from "@yudiel/react-qr-scanner";
import Groq from "groq-sdk";

// --- CONFIGURATION ---
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY_CHARTING;
const groq = new Groq({ apiKey: GROQ_API_KEY, dangerouslyAllowBrowser: true });

const Charting = () => {
  // Navigation & Data States
  const [searchTerm, setSearchTerm] = useState("");
  const [patient, setPatient] = useState(null);
  const [patientBed, setPatientBed] = useState(null);
  const [searchResults, setSearchResults] = useState([]); // <--- HANDLES MULTIPLE MATCHES
  const [recentPatients, setRecentPatients] = useState([]);
  const [history, setHistory] = useState([]);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(true);

  // Advanced States
  const [aiSummary, setAiSummary] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isAIExpanded, setIsAIExpanded] = useState(true);
  const [adherenceData, setAdherenceData] = useState([
    70, 85, 100, 45, 90, 100, 100,
  ]);

  // UI & Feature States
  const [userRole, setUserRole] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Modal States
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isMedModalOpen, setIsMedModalOpen] = useState(false);
  const [newMed, setNewMed] = useState({ name: "", dosage: "" });
  const [newEntry, setNewEntry] = useState({
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    document.title = "Charting | ATAMAN Health";
    fetchRecent();
    checkUserRole();
  }, []);

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

  // --- LOGIC: SELECT SPECIFIC PATIENT ---
  const selectPatient = async (selectedPatient) => {
    setPatient(selectedPatient);
    setSearchResults([]); // Clear selection list once chosen
    setAiSummary("");
    setIsAIExpanded(true);

    // 1. Ward Location
    const { data: bedInfo } = await supabase
      .from("beds")
      .select("bed_label, ward_type")
      .eq("patient_id", selectedPatient.id)
      .maybeSingle();
    setPatientBed(bedInfo);

    // 2. Clinical History
    const { data: notes } = await supabase
      .from("clinical_notes")
      .select("*")
      .eq("patient_id", selectedPatient.id)
      .order("created_at", { ascending: false });
    const clinicalHistory = notes || [];
    setHistory(clinicalHistory);

    // 3. AI Summary
    if (clinicalHistory.length > 0) {
      setIsSummarizing(true);
      try {
        const allText = clinicalHistory
          .slice(0, 5)
          .map((n) => n.subjective_notes)
          .join(". ");
        const chat = await groq.chat.completions.create({
          messages: [
            { role: "system", content: "Summarize status in 2 sentences." },
            { role: "user", content: allText },
          ],
          model: "llama-3.3-70b-versatile",
        });
        setAiSummary(chat.choices[0]?.message?.content || "");
      } catch (e) {
        console.error(e);
      }
      setIsSummarizing(false);
    }

    // 4. Household
    const { data: family } = await supabase
      .from("family_members")
      .select("*")
      .eq("user_id", selectedPatient.id);
    setFamilyMembers(family || []);

    // 5. Audit
    await supabase
      .from("users")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", selectedPatient.id);
  };

  // --- LOGIC: SEARCH (NAME OR ID) ---
  const handleSearch = async (e, directTerm = null) => {
    if (e) e.preventDefault();
    const term = directTerm || searchTerm;
    const cleanTerm = term?.trim();
    if (!cleanTerm) return;

    setLoading(true);
    setPatient(null);
    setSearchResults([]);

    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        cleanTerm,
      );
    let query = supabase.from("users").select("*");

    if (isUUID) {
      query = query.eq("id", cleanTerm);
    } else {
      query = query.or(
        `first_name.ilike.%${cleanTerm}%,last_name.ilike.%${cleanTerm}%,philhealth_id.eq.${cleanTerm},medical_id.eq.${cleanTerm}`,
      );
    }

    const { data, error } = await query;

    if (!error && data && data.length > 0) {
      if (data.length === 1) {
        selectPatient(data[0]); // ONLY ONE: Open immediately
      } else {
        setSearchResults(data); // MULTIPLE: Show selection view
      }
    } else if (!directTerm) {
      alert("No medical record located.");
    }
    setLoading(false);
    setShowScanner(false);
  };

  const handleQrScan = (detectedCodes) => {
    if (
      detectedCodes &&
      detectedCodes.length > 0 &&
      detectedCodes[0]?.rawValue
    ) {
      const rawValue = detectedCodes[0].rawValue;
      try {
        const qrData = JSON.parse(rawValue);
        handleSearch(null, qrData.id || qrData.data || rawValue);
      } catch (e) {
        handleSearch(null, rawValue);
      }
    }
  };

  const handleSaveMedLog = () => {
    if (!newMed.name) return;
    setAdherenceData((prev) => [...prev.slice(1), 100]);
    setIsMedModalOpen(false);
    setNewMed({ name: "", dosage: "" });
    alert("Dose administration logged.");
  };

  const handleSaveEntry = async () => {
    if (!newEntry.assessment) return alert("Diagnosis required.");
    setIsSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("clinical_notes").insert({
      patient_id: patient.id,
      doctor_id: user.id,
      subjective_notes: newEntry.subjective,
      objective_notes: newEntry.objective,
      assessment: newEntry.assessment,
      plan: newEntry.plan,
      created_at: new Date().toISOString(),
    });
    setIsEntryModalOpen(false);
    setNewEntry({ subjective: "", objective: "", assessment: "", plan: "" });
    selectPatient(patient);
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

  const calculateAge = (dob) => {
    if (!dob) return "N/A";
    const ageDifMs = Date.now() - new Date(dob).getTime();
    return Math.abs(new Date(ageDifMs).getUTCFullYear() - 1970);
  };

  return (
    <div className="p-12 bg-[#F8FAFC] min-h-screen font-sans text-slate-800">
      {/* HEADER */}
      <div className="mb-10 flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-4xl font-bold tracking-tight leading-none">
            Digital Charting
          </h1>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">
            Integrated Health Registry Node
          </p>
        </div>
        <button
          onClick={() => setShowScanner(true)}
          className="bg-slate-900 text-white px-8 py-3.5 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl active:scale-95 flex items-center gap-3"
        >
          <QrCode size={18} /> Initiate Scan
        </button>
      </div>

      {/* SEARCH INTERFACE */}
      <div className="flex gap-4 items-center max-w-2xl mb-12 shrink-0">
        <form
          onSubmit={(e) => handleSearch(e)}
          className="flex-1 flex bg-white p-1 rounded-2xl shadow-sm border border-slate-200 items-center transition-all focus-within:border-primary"
        >
          <div className="pl-4 text-slate-300 font-bold">
            <Search size={18} />
          </div>
          <input
            type="text"
            placeholder="Search first, last, or PhilHealth ID..."
            className="w-full outline-none px-4 text-sm font-semibold text-slate-600 h-11 bg-transparent"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button className="bg-slate-800 text-white px-6 h-11 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-black transition-all">
            Search
          </button>
        </form>
        {(patient || searchResults.length > 0) && (
          <button
            onClick={() => {
              setPatient(null);
              setSearchResults([]);
              setSearchTerm("");
            }}
            className="bg-white border border-slate-200 text-slate-400 p-3 rounded-xl hover:text-red-500 transition-all"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* --- MULTIPLE RESULTS SELECTION GRID --- */}
      {!patient && searchResults.length > 1 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 mb-12">
          <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest px-2 flex items-center gap-2 italic">
            <AlertCircle size={14} /> Multiple records found. Select patient to
            view chart:
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {searchResults.map((p) => (
              <div
                key={p.id}
                onClick={() => selectPatient(p)}
                className="bg-white p-6 rounded-[1.8rem] border border-slate-200 shadow-sm hover:border-[#00695C] cursor-pointer flex justify-between items-center group transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 border border-slate-100 font-bold group-hover:bg-[#00695C] group-hover:text-white transition-colors uppercase">
                    {p.first_name?.[0]}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm uppercase leading-none mb-1">
                      {p.first_name} {p.last_name}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter italic">
                      DOB: {p.birth_date} • {p.barangay}
                    </p>
                  </div>
                </div>
                <ChevronRight
                  size={18}
                  className="text-slate-200 group-hover:text-[#00695C] group-hover:translate-x-1 transition-all"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RECENT RECORDS (Visible only if no active search results/chart) */}
      {!patient && searchResults.length === 0 && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 flex items-center gap-2 italic">
            <History size={14} className="text-primary" /> Recent clinical
            modifications
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {recentPatients.map((p) => (
              <div
                key={p.id}
                onClick={() => selectPatient(p)}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-600 cursor-pointer flex justify-between items-center transition-all group"
              >
                <div className="flex items-center gap-4 text-slate-300 font-bold uppercase">
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 group-hover:text-emerald-500">
                    {p.first_name?.[0] || "?"}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-xs uppercase">
                      {p.first_name} {p.last_name}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">
                      {p.barangay || "Resident"}
                    </p>
                  </div>
                </div>
                <ChevronRight
                  size={14}
                  className="text-slate-300 group-hover:text-emerald-600"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PATIENT CHART VIEW */}
      {patient && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 flex justify-between items-center relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#00695C]" />
            <div className="flex items-center gap-8">
              <div className="w-24 h-24 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 text-[#00695C] font-bold">
                <User size={32} />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-3xl font-bold text-slate-800 tracking-tight leading-none uppercase">
                    {patient.first_name} {patient.last_name}
                  </h2>
                  {patientBed && (
                    <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-100 px-3 py-1 rounded-lg uppercase flex items-center gap-1.5 animate-pulse">
                      <MapPin size={10} /> {patientBed.ward_type} —{" "}
                      {patientBed.bed_label}
                    </span>
                  )}
                </div>
                <div className="flex gap-4 mt-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    ID: {patient.philhealth_id || "NOT LINKED"}
                  </p>
                  <span className="text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1.5">
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

              {(userRole === "DOCTOR" || userRole === "ADMIN") && (
                <button
                  onClick={() => setIsEntryModalOpen(true)}
                  className="bg-slate-900 text-white px-8 py-3.5 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg active:scale-95 flex items-center gap-2"
                >
                  <Plus size={16} /> New Entry
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <InfoCard title="Profile" icon={<Calendar size={16} />}>
              <DataRow
                label="Age"
                value={`${calculateAge(patient.birth_date)} YRS`}
              />
              <DataRow label="Sex" value={patient.gender || "N/A"} />
              <DataRow label="Area" value={patient.barangay || "Naga"} />
            </InfoCard>

            {/* COLLAPSIBLE AI SNAPSHOT */}
            <div
              onClick={() => setIsAIExpanded(!isAIExpanded)}
              className={`bg-[#004D40] text-white p-8 rounded-2xl shadow-xl relative overflow-hidden group cursor-pointer transition-all duration-500 ease-in-out ${isAIExpanded ? "h-full" : "h-24"}`}
            >
              <BrainCircuit
                className={`absolute -right-4 -top-4 opacity-10 transition-transform duration-500 ${isAIExpanded ? "rotate-12 scale-125" : "rotate-0 scale-90"}`}
                size={120}
              />
              <div className="flex justify-between items-center mb-6 relative z-10">
                <h3 className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 text-teal-300">
                  AI Clinical Snapshot
                </h3>
                <ChevronDown
                  size={16}
                  className={`text-teal-300 transition-transform ${isAIExpanded ? "rotate-180" : ""}`}
                />
              </div>
              {isAIExpanded && (
                <div className="animate-in fade-in duration-500">
                  {isSummarizing ? (
                    <Loader2 className="animate-spin text-teal-200" />
                  ) : (
                    <p className="text-[13px] font-medium leading-relaxed italic text-teal-50">
                      "{aiSummary || "Awaiting clinical data."}"
                    </p>
                  )}
                </div>
              )}
            </div>

            <InfoCard title="Emergency" icon={<AlertCircle size={16} />}>
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl mb-4 text-center font-bold text-xs text-rose-600 uppercase tracking-widest leading-none">
                {patient.allergies || "No Allergies"}
              </div>
              <DataRow
                label="Contact"
                value={patient.emergency_contact_name || "N/A"}
              />
            </InfoCard>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-full group">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp size={14} className="text-emerald-500" />{" "}
                  Adherence
                </h3>
                <button
                  onClick={() => setIsMedModalOpen(true)}
                  className="text-[8px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-600 hover:text-white transition-all uppercase"
                >
                  Log Intake
                </button>
              </div>
              <div className="flex-grow flex items-end gap-2 h-20 mb-4 px-2">
                {adherenceData.map((val, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-slate-50 rounded-t-lg relative group cursor-pointer"
                    style={{ height: `${val}%` }}
                  >
                    <div
                      className={`absolute bottom-0 w-full rounded-t-lg transition-all duration-700 ${val > 60 ? "bg-emerald-400 shadow-[0_-5px_10px_rgba(52,211,153,0.3)]" : "bg-rose-400"}`}
                      style={{ height: "100%" }}
                    />
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[8px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 font-bold whitespace-nowrap z-10">
                      {val}% Intake
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <InfoCard title="Household" icon={<Users size={16} />}>
              <div className="space-y-2">
                {familyMembers.map((m) => (
                  <div
                    key={m.id}
                    className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center group"
                  >
                    <div>
                      <p className="text-[11px] font-bold text-slate-800 uppercase leading-none mb-1.5">
                        {m.full_name}
                      </p>
                      <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-tighter">
                        {m.relationship}
                      </p>
                    </div>
                    <span className="text-[9px] font-bold text-slate-400 group-hover:text-primary transition-colors cursor-pointer">
                      {m.phone_number || "---"}
                    </span>
                  </div>
                ))}
                {familyMembers.length === 0 && (
                  <p className="text-center text-[10px] text-slate-200 font-bold py-10 border-2 border-dashed rounded-2xl">
                    No Kin Registry
                  </p>
                )}
              </div>
            </InfoCard>

            <div className="col-span-3 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 p-6 border-b border-slate-200 flex justify-between items-center uppercase italic font-bold text-slate-400 text-[10px] tracking-widest">
                <span>Clinical Chronological Stream</span>
                <span className="text-emerald-600 font-black tracking-tight leading-none italic uppercase">
                  / Node Encrypted /
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {history.map((note) => (
                  <div
                    key={note.id}
                    className="grid grid-cols-12 items-start p-10 hover:bg-slate-50/20 transition-colors"
                  >
                    <div className="col-span-2 text-[10px] font-black text-slate-300 uppercase tracking-widest italic leading-none">
                      {new Date(note.created_at).toLocaleDateString()}
                    </div>
                    <div className="col-span-10 flex gap-12 text-sm leading-relaxed">
                      <div className="flex-1 border-l-2 border-emerald-100 pl-10 text-slate-500 font-medium italic">
                        "{note.subjective_notes}"
                      </div>
                      <div className="flex-1 border-l-2 border-slate-50 pl-10">
                        <p className="font-bold text-slate-900 uppercase text-xs mb-3">
                          {note.assessment}
                        </p>
                        <p className="text-slate-400 text-xs">{note.plan}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {history.length === 0 && (
                  <div className="py-24 text-center text-slate-200 font-black uppercase text-xs tracking-widest italic">
                    Clinical history is currently dormant
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- DOSE MODAL --- */}
      {isMedModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[250] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-10 border border-white animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-10 text-emerald-600 uppercase font-black tracking-tight italic leading-none">
              <div className="flex gap-3">
                <Pill size={20} /> Dose Ledger
              </div>
              <button onClick={() => setIsMedModalOpen(false)}>
                <X />
              </button>
            </div>
            <div className="space-y-6 mb-12">
              <input
                type="text"
                className="w-full bg-slate-50 rounded-2xl p-5 text-sm font-bold outline-none"
                placeholder="Medication Name"
                value={newMed.name}
                onChange={(e) => setNewMed({ ...newMed, name: e.target.value })}
              />
              <input
                type="text"
                className="w-full bg-slate-50 rounded-2xl p-5 text-sm font-bold outline-none"
                placeholder="Dosage Specification"
                value={newMed.dosage}
                onChange={(e) =>
                  setNewMed({ ...newMed, dosage: e.target.value })
                }
              />
            </div>
            <button
              onClick={handleSaveMedLog}
              className="w-full py-5 bg-gray-900 text-white rounded-[2rem] font-bold text-[11px] uppercase tracking-widest shadow-2xl active:scale-95 transition-all"
            >
              Record Administration
            </button>
          </div>
        </div>
      )}

      {/* --- ENCOUNTER MODAL --- */}
      {isEntryModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-5xl p-14 overflow-y-auto max-h-[90vh] no-scrollbar border border-white/20 animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-12 border-b border-slate-50 pb-10 uppercase italic text-primary font-bold">
              Encounter Handshake: {patient.first_name}{" "}
              <button onClick={() => setIsEntryModalOpen(false)}>
                <X size={32} className="text-slate-300" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-16">
              <div className="space-y-12">
                <SOAPInput
                  label="Subjective (S)"
                  sub="Reported complaints"
                  val={newEntry.subjective}
                  set={(v) => setNewEntry({ ...newEntry, subjective: v })}
                />
                <SOAPInput
                  label="Objective (O)"
                  sub="Clinical vitals/findings"
                  val={newEntry.objective}
                  set={(v) => setNewEntry({ ...newEntry, objective: v })}
                />
              </div>
              <div className="space-y-12">
                <SOAPInput
                  label="Assessment (A)"
                  sub="Clinical diagnosis"
                  val={newEntry.assessment}
                  set={(v) => setNewEntry({ ...newEntry, assessment: v })}
                  isInput
                />
                <SOAPInput
                  label="Plan (P)"
                  sub="Treatment protocol"
                  val={newEntry.plan}
                  set={(v) => setNewEntry({ ...newEntry, plan: v })}
                />
              </div>
            </div>
            <div className="mt-16 flex gap-6">
              <button
                onClick={() => setIsEntryModalOpen(false)}
                className="flex-1 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest rounded-xl hover:bg-slate-50"
              >
                Discard
              </button>
              <button
                onClick={handleSaveEntry}
                disabled={isSaving}
                className="flex-[2] py-5 bg-slate-900 text-white text-[11px] font-black uppercase tracking-[0.4em] rounded-[2rem] shadow-2xl active:scale-95 flex justify-center items-center gap-4 italic"
              >
                {isSaving ? <Loader2 className="animate-spin" /> : <Save />}{" "}
                Commit Protocol to record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- QR SCANNER --- */}
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
              <div className="absolute inset-0 border-[60px] border-black/40 pointer-events-none flex items-center justify-center">
                <div className="w-full h-full border-2 border-emerald-500/40 animate-pulse rounded-2xl"></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- ATTACHMENTS MODAL --- */}
      {showDocs && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[100] flex items-center justify-center p-4"
          onClick={() => setShowDocs(false)}
        >
          <div
            className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl p-12 overflow-hidden animate-in zoom-in border border-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-10 border-b border-slate-50 pb-8 uppercase font-bold italic tracking-tighter text-slate-800 text-2xl leading-none">
              Record Archive{" "}
              <button onClick={() => setShowDocs(false)}>
                <X size={32} className="text-slate-300 hover:text-red-500" />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto max-h-[450px] no-scrollbar">
              {loadingDocs ? (
                <Loader2 className="animate-spin mx-auto text-blue-500" />
              ) : documents.length > 0 ? (
                documents.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.file_path}
                    target="_blank"
                    rel="noreferrer"
                    className="p-6 bg-slate-50 rounded-[2.2rem] border border-slate-100 flex justify-between items-center hover:bg-white transition-all shadow-sm group"
                  >
                    <div className="flex items-center gap-5 text-slate-400 font-bold text-xs uppercase">
                      <FileText /> {doc.document_name}
                    </div>
                    <ExternalLink
                      size={18}
                      className="text-slate-200 group-hover:text-blue-500 transition-all"
                    />
                  </a>
                ))
              ) : (
                <div className="py-24 text-center text-slate-200 font-black uppercase text-xs border-2 border-dashed rounded-[3rem]">
                  Registry Empty
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// HELPERS
const SOAPInput = ({ label, sub, val, set, isInput }) => (
  <div>
    <label className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-1 block leading-none">
      {label}
    </label>
    <p className="text-[9px] font-bold text-slate-300 uppercase mb-5 tracking-widest italic">
      {sub}
    </p>
    {isInput ? (
      <input
        className="w-full bg-slate-50 rounded-2xl p-6 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/10 border-none uppercase shadow-inner"
        value={val}
        onChange={(e) => set(e.target.value)}
      />
    ) : (
      <textarea
        className="w-full bg-slate-50 rounded-2xl p-8 text-[14px] font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary/10 border-none resize-none h-44 shadow-inner custom-scrollbar"
        value={val}
        onChange={(e) => set(e.target.value)}
      />
    )}
  </div>
);

const InfoCard = ({ title, icon, children }) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-full group hover:shadow-lg hover:border-primary/20 transition-all">
    <div className="flex items-center gap-2.5 mb-5 border-b border-slate-50 pb-3 text-slate-300 group-hover:text-primary transition-colors leading-none">
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

export default Charting;
