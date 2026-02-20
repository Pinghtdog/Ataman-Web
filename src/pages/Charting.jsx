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
  List,
  LayoutGrid,
  Filter,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { Scanner } from "@yudiel/react-qr-scanner";
import Groq from "groq-sdk";

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY_CHARTING;
const groq = new Groq({ apiKey: GROQ_API_KEY, dangerouslyAllowBrowser: true });

const Charting = () => {
  // --- NEW DASHBOARD STATES ---
  const [viewMode, setViewMode] = useState("registry"); // 'registry' (table) or 'tactical' (search/recent)
  const [allPatients, setAllPatients] = useState([]);
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [barangayFilter, setBarangayFilter] = useState("All");

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

  // AI & Analytics States
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
    fetchAllPatients(); // <--- Load full list for table
    checkUserRole();
  }, []);

  // --- NEW: FETCH FULL REGISTRY ---
  const fetchAllPatients = async () => {
    setLoadingRecent(true);
    const { data } = await supabase
      .from("users")
      .select("*")
      .order("last_name", { ascending: true });
    if (data) {
      setAllPatients(data);
      setFilteredPatients(data);
    }
    setLoadingRecent(false);
  };

  // --- NEW: FILTER LOGIC ---
  useEffect(() => {
    let result = allPatients;
    if (barangayFilter !== "All") {
      result = result.filter((p) => p.barangay === barangayFilter);
    }
    setFilteredPatients(result);
  }, [barangayFilter, allPatients]);

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
    const { data } = await supabase
      .from("users")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(6);
    if (data) setRecentPatients(data);
  };

  const selectPatient = async (selectedPatient) => {
    setPatient(selectedPatient);
    setSearchResults([]);
    setAiSummary("");
    setIsAIExpanded(true);

    const { data: bedInfo } = await supabase
      .from("beds")
      .select("bed_label, ward_type")
      .eq("patient_id", selectedPatient.id)
      .maybeSingle();
    setPatientBed(bedInfo);

    const { data: notes } = await supabase
      .from("clinical_notes")
      .select("*")
      .eq("patient_id", selectedPatient.id)
      .order("created_at", { ascending: false });
    const clinicalHistory = notes || [];
    setHistory(clinicalHistory);

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

  const handleSearch = async (e, directTerm = null) => {
    if (e) e.preventDefault();
    const termToUse = directTerm || searchTerm;
    const cleanTerm = termToUse?.trim();
    if (!cleanTerm) return;

    setLoading(true);
    setPatient(null);
    setSearchResults([]);

    const { data } = await supabase
      .from("users")
      .select("*")
      .or(
        `first_name.ilike.%${cleanTerm}%,last_name.ilike.%${cleanTerm}%,philhealth_id.eq.${cleanTerm},medical_id.eq.${cleanTerm}`,
      );

    if (data && data.length > 0) {
      if (data.length === 1) selectPatient(data[0]);
      else setSearchResults(data);
    } else if (!directTerm) alert("No records located.");
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
  };

  const handleSaveEntry = async () => {
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
    if (data) setDocuments(data);
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
      <div className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter leading-none">
            Digital Charting
          </h1>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">
            NCGH Integrated Health Node • Secure Data Feed
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* VIEW TOGGLE SWITCH */}
          <div className="bg-white p-1 rounded-2xl shadow-sm border border-slate-100 flex gap-1">
            <button
              onClick={() => setViewMode("registry")}
              className={`p-2.5 rounded-xl transition-all ${viewMode === "registry" ? "bg-primary text-white shadow-lg shadow-emerald-900/10" : "text-slate-300 hover:text-primary"}`}
              title="Full Registry Table"
            >
              <List size={18} />
            </button>
            <button
              onClick={() => setViewMode("tactical")}
              className={`p-2.5 rounded-xl transition-all ${viewMode === "tactical" ? "bg-primary text-white shadow-lg shadow-emerald-900/10" : "text-slate-300 hover:text-primary"}`}
              title="Tactical Search & Recent"
            >
              <LayoutGrid size={18} />
            </button>
          </div>

          <button
            onClick={() => setShowScanner(true)}
            className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl active:scale-95 flex items-center gap-2"
          >
            <QrCode size={16} /> Scan Patient ID
          </button>
        </div>
      </div>

      {!patient ? (
        <div className="space-y-8 animate-in fade-in duration-500">
          {/* SEARCH AND FILTERS BAR */}
          <div className="flex flex-wrap gap-4 items-center justify-between bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
            <form
              onSubmit={handleSearch}
              className="flex items-center gap-3 bg-slate-50 px-6 py-3 rounded-2xl flex-1 max-w-md focus-within:ring-2 ring-primary/10"
            >
              <Search size={18} className="text-slate-300" />
              <input
                type="text"
                placeholder="Live search registry..."
                className="bg-transparent outline-none text-sm font-semibold text-slate-600 w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </form>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3 px-4 border-r border-slate-100">
                <Filter size={14} className="text-slate-300" />
                <select
                  className="bg-transparent outline-none text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer"
                  value={barangayFilter}
                  onChange={(e) => setBarangayFilter(e.target.value)}
                >
                  <option value="All">All Barangays</option>
                  {[...new Set(allPatients.map((p) => p.barangay))]
                    .filter(Boolean)
                    .map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                </select>
              </div>
              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
                {filteredPatients.length} Nodes Found
              </p>
            </div>
          </div>

          {/* TABULAR REGISTRY VIEW */}
          {viewMode === "registry" ? (
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="p-6">Patient Subject</th>
                    <th className="p-6">Electronic ID</th>
                    <th className="p-6">Age / Bio</th>
                    <th className="p-6">Location</th>
                    <th className="p-6">Registry Status</th>
                    <th className="p-6 text-right">Access</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredPatients.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => selectPatient(p)}
                      className="hover:bg-emerald-50/30 cursor-pointer transition-all group"
                    >
                      <td className="p-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 font-bold group-hover:text-primary transition-colors border border-slate-100 uppercase">
                            {p.first_name?.[0]}
                          </div>
                          <span className="font-bold text-slate-800 uppercase text-xs tracking-tight">
                            {p.first_name} {p.last_name}
                          </span>
                        </div>
                      </td>
                      <td className="p-6 text-[10px] font-mono font-bold text-slate-400">
                        {p.philhealth_id || "---"}
                      </td>
                      <td className="p-6 text-[10px] font-bold text-slate-500 uppercase">
                        {calculateAge(p.birth_date)} YRS •{" "}
                        {p.gender?.[0] || "U"}
                      </td>
                      <td className="p-6 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                        {p.barangay || "Naga City"}
                      </td>
                      <td className="p-6">
                        <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border border-emerald-100">
                          Synchronized
                        </span>
                      </td>
                      <td className="p-6 text-right text-slate-200 group-hover:text-primary transition-colors">
                        <ChevronRight size={18} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredPatients.length === 0 && (
                <div className="py-20 text-center text-slate-300 font-bold uppercase text-xs tracking-widest italic">
                  No clinical matches found in this sector
                </div>
              )}
            </div>
          ) : (
            /* EXISTING RECENT GRID VIEW (Tactical Mode) */

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recentPatients.map((p) => (
                <div
                  key={p.id}
                  onClick={() => selectPatient(p)}
                  className="bg-white p-6 rounded-[2.2rem] border border-slate-100 shadow-sm hover:border-primary cursor-pointer flex justify-between items-center transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 border border-slate-100 font-bold group-hover:text-primary">
                      {p.first_name?.[0]}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-xs uppercase leading-none">
                        {p.first_name} {p.last_name}
                      </p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-1.5">
                        {p.barangay || "Resident"}
                      </p>
                    </div>
                  </div>
                  <ChevronRight
                    size={16}
                    className="text-slate-200 group-hover:text-primary transition-all"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* PATIENT CHART VIEW (No Logic Changes) */
        <div className="space-y-8 animate-in slide-in-from-bottom-6 duration-700 pb-20">
          <div className="bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-200 flex justify-between items-center relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#00695C]" />
            <div className="flex items-center gap-10">
              <div className="w-24 h-24 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 text-primary shadow-inner font-bold">
                <User size={40} />
              </div>
              <div>
                <div className="flex items-center gap-3">
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
                <div className="flex gap-4 mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <p>PHILHEALTH: {patient.philhealth_id || "NOT LINKED"}</p>
                  <span className="text-emerald-600 flex items-center gap-1.5">
                    <Shield size={12} /> YAKAP Verified
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setShowDocs(true);
                  fetchDocuments(patient.id);
                }}
                className="bg-blue-50 text-blue-600 px-6 py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all border border-blue-100 flex items-center gap-2"
              >
                <FolderOpen size={16} /> Clinical Docs
              </button>
              {(userRole === "DOCTOR" || userRole === "ADMIN") && (
                <button
                  onClick={() => setIsEntryModalOpen(true)}
                  className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg active:scale-95 flex items-center gap-2"
                >
                  <PlusCircle size={16} /> New Encounter
                </button>
              )}
              <button
                onClick={() => {
                  setPatient(null);
                  setPatientBed(null);
                }}
                className="bg-white border border-slate-200 text-slate-300 p-4 rounded-2xl hover:text-red-500 transition-all"
              >
                <X />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <InfoCard title="Profile Node" icon={<Calendar size={16} />}>
              <DataRow
                label="Age"
                value={`${calculateAge(patient.birth_date)} YRS`}
              />
              <DataRow label="Sex" value={patient.gender || "N/A"} />
              <DataRow label="Area" value={patient.barangay || "Naga"} />
            </InfoCard>

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
                  AI Snapshot
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
                      "{aiSummary || "Awaiting clinical handshake summary."}"
                    </p>
                  )}
                </div>
              )}
            </div>

            <InfoCard
              title="Emergency Response"
              icon={<AlertCircle size={16} />}
            >
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl mb-4 text-center font-bold text-xs text-rose-600 uppercase tracking-widest">
                {patient.allergies || "No Known Allergies"}
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
            <div className="col-span-1">
              <InfoCard title="Household Linkage" icon={<Users size={16} />}>
                <div className="space-y-3">
                  {familyMembers.map((m) => (
                    <div
                      key={m.id}
                      className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center group"
                    >
                      <div>
                        <p className="text-[11px] font-bold text-slate-800 uppercase leading-none mb-1.5">
                          {m.full_name}
                        </p>
                        <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-tighter">
                          {m.relationship}
                        </p>
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 group-hover:text-primary transition-colors cursor-pointer leading-none tracking-tighter">
                        {m.phone_number || "---"}
                      </span>
                    </div>
                  ))}
                </div>
              </InfoCard>
            </div>

            <div className="col-span-3 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 p-6 border-b border-slate-200 flex justify-between items-center uppercase italic font-bold text-slate-400 text-[10px] tracking-widest">
                <span>Clinical Chronological Stream</span>
                <span className="text-emerald-600 font-black tracking-tight leading-none italic uppercase">
                  / Node Encrypted /
                </span>
              </div>
              <div className="divide-y divide-slate-50">
                {history.map((note) => (
                  <div
                    key={note.id}
                    className="grid grid-cols-12 items-start p-10 hover:bg-slate-50/20 transition-colors"
                  >
                    <div className="col-span-2 text-[10px] font-black text-slate-300 uppercase tracking-widest italic leading-none">
                      {new Date(note.created_at).toLocaleDateString()}
                    </div>
                    <div className="col-span-10 flex gap-16 text-sm leading-relaxed">
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
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODALS (Unchanged logic, formal style) --- */}
      {isMedModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[250] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-12 border border-white animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-10 text-emerald-600 uppercase font-black tracking-tight italic leading-none">
              <div className="flex gap-3">
                <Pill size={20} /> Dose Ledger
              </div>
              <button onClick={() => setIsMedModalOpen(false)}>
                <X />
              </button>
            </div>
            <div className="space-y-6 mb-8">
              <input
                type="text"
                className="w-full bg-slate-50 rounded-xl p-4 text-sm font-bold outline-none"
                placeholder="Medication Name"
                value={newMed.name}
                onChange={(e) => setNewMed({ ...newMed, name: e.target.value })}
              />
              <input
                type="text"
                className="w-full bg-slate-50 rounded-xl p-4 text-sm font-bold outline-none"
                placeholder="Dosage Specification"
                value={newMed.dosage}
                onChange={(e) =>
                  setNewMed({ ...newMed, dosage: e.target.value })
                }
              />
            </div>
            <button
              onClick={handleSaveMedLog}
              className="w-full py-5 bg-gray-900 text-white rounded-[2rem] font-bold text-[11px] uppercase tracking-widest shadow-2xl active:scale-95 transition-all leading-none"
            >
              Record Administration
            </button>
          </div>
        </div>
      )}

      {isEntryModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-5xl p-14 overflow-y-auto max-h-[90vh] no-scrollbar border border-white/20 animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-12 border-b border-slate-50 pb-10 uppercase italic text-primary font-bold leading-none tracking-tight overflow-hidden">
              Protocol for {patient.first_name}{" "}
              <button onClick={() => setIsEntryModalOpen(false)}>
                <X size={32} className="text-slate-300" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-16">
              <div className="space-y-12">
                <SOAPInput
                  label="Subjective (S)"
                  sub="Patient complaints"
                  val={newEntry.subjective}
                  set={(v) => setNewEntry({ ...newEntry, subjective: v })}
                />
                <SOAPInput
                  label="Objective (O)"
                  sub="Clinical vitals"
                  val={newEntry.objective}
                  set={(v) => setNewEntry({ ...newEntry, objective: v })}
                />
              </div>
              <div className="space-y-12">
                <SOAPInput
                  label="Assessment (A)"
                  sub="Final diagnosis"
                  val={newEntry.assessment}
                  set={(v) => setNewEntry({ ...newEntry, assessment: v })}
                  isInput
                />
                <SOAPInput
                  label="Plan (P)"
                  sub="Treatment workflow"
                  val={newEntry.plan}
                  set={(v) => setNewEntry({ ...newEntry, plan: v })}
                />
              </div>
            </div>
            <div className="mt-16 flex gap-6">
              <button
                onClick={() => setIsEntryModalOpen(false)}
                className="flex-1 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest rounded-xl hover:bg-slate-50 transition-all"
              >
                Discard
              </button>
              <button
                onClick={handleSaveEntry}
                disabled={isSaving}
                className="flex-[2] py-5 bg-gray-900 text-white text-[11px] font-black uppercase tracking-[0.4em] rounded-[2rem] shadow-2xl active:scale-95 flex justify-center items-center gap-4 italic leading-none"
              >
                {isSaving ? <Loader2 className="animate-spin" /> : <Save />}{" "}
                Commit Protocol to record
              </button>
            </div>
          </div>
        </div>
      )}

      {showScanner && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-2xl z-[300] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in border border-white/10">
            <div className="p-8 border-b flex justify-between items-center bg-gray-50 uppercase font-bold text-[10px] tracking-widest text-slate-400 leading-none italic">
              Electronic Identification{" "}
              <button
                onClick={() => setShowScanner(false)}
                className="text-slate-300 hover:text-red-500 transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-3 bg-black relative h-[400px]">
              <Scanner
                onScan={(result) => {
                  if (result && result.length > 0 && result[0]?.rawValue)
                    handleSearch(null, result[0].rawValue);
                }}
                components={{ audio: false, finder: true }}
              />
              <div className="absolute inset-0 border-[60px] border-black/40 pointer-events-none flex items-center justify-center">
                <div className="w-full h-full border-2 border-emerald-500/40 animate-pulse rounded-2xl"></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDocs && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[100] flex items-center justify-center p-4"
          onClick={() => setShowDocs(false)}
        >
          <div
            className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl p-12 overflow-hidden border border-white animate-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-10 border-b border-slate-50 pb-8 uppercase font-bold italic tracking-tighter text-slate-800 text-2xl leading-none">
              Clinical Archive{" "}
              <button onClick={() => setShowDocs(false)}>
                <X size={32} className="text-slate-300 hover:text-red-500" />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto max-h-[450px] no-scrollbar text-center pr-1">
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
                <div className="py-24 text-slate-200 font-black uppercase text-xs tracking-widest border-2 border-dashed rounded-[3rem]">
                  No encrypted files located
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
  <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col h-full group hover:shadow-lg hover:border-primary/20 transition-all">
    <div className="flex items-center gap-3 mb-8 border-b border-slate-50 pb-4 text-slate-300 group-hover:text-primary transition-colors leading-none">
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
