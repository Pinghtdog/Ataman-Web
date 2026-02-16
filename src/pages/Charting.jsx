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
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { Scanner } from "@yudiel/react-qr-scanner";
import { useRef } from "react";
import Groq from "groq-sdk";

const GROQ_API_KEY = "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";
const groq = new Groq({ apiKey: GROQ_API_KEY, dangerouslyAllowBrowser: true });

const Charting = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [patient, setPatient] = useState(null);
  const [patientBed, setPatientBed] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [recentPatients, setRecentPatients] = useState([]);
  const [history, setHistory] = useState([]);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const [aiSummary, setAiSummary] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [adherenceData, setAdherenceData] = useState([
    80, 95, 100, 30, 90, 100, 100,
  ]);

  const [userRole, setUserRole] = useState(null);
  const [myFacilityId, setMyFacilityId] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const searchCache = useRef(new Map());

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
    checkUserRoleAndFacility();
  }, []);

  const checkUserRoleAndFacility = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("facility_staff")
        .select("role, facility_id")
        .eq("user_id", user.id)
        .single();
      setUserRole(data?.role);
      setMyFacilityId(data?.facility_id);
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

  const handleSearch = async (e, directTerm = null) => {
    if (e) e.preventDefault();

    const termToUse = directTerm || searchTerm;
    const cleanTerm = termToUse.trim();

    if (!cleanTerm) return;

    // --- CACHE CHECK (Start) ---
    // If we have seen this ID/Name before, use the saved data
    if (searchCache.current.has(cleanTerm)) {
      console.log("⚡ Serving from Cache:", cleanTerm);
      const cachedData = searchCache.current.get(cleanTerm);

      setPatient(null);
      setSearchResults([]);

      if (cachedData.length === 1) {
        selectPatient(cachedData[0]);
      } else if (cachedData.length > 1) {
        setSearchResults(cachedData);
      } else {
        alert("No records found (Cached).");
      }

      if (directTerm) setSearchTerm(directTerm);
      return; // STOP HERE! Do not call Supabase.
    }
    // --- CACHE CHECK (End) ---

    setLoading(true);
    setPatient(null);
    setSearchResults([]);

    let query = supabase.from("users").select("*");

    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        cleanTerm,
      );

    if (isUUID) {
      query = query.eq("id", cleanTerm);
    } else {
      query = query.or(
        `first_name.ilike.%${cleanTerm}%,last_name.ilike.%${cleanTerm}%,philhealth_id.eq.${cleanTerm},medical_id.eq.${cleanTerm}`,
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error("Search Error:", error);
      alert("Error searching database");
    } else {
      // --- SAVE TO CACHE (Start) ---
      // Save the result so we don't have to fetch it next time
      if (data) {
        searchCache.current.set(cleanTerm, data);
      }
      // --- SAVE TO CACHE (End) ---

      if (data?.length === 1) {
        selectPatient(data[0]);
      } else if (data?.length > 1) {
        setSearchResults(data);
      } else {
        alert("No records found.");
      }
    }

    if (directTerm) setSearchTerm(directTerm);
    setLoading(false);
    setShowScanner(false);
  };

  const selectPatient = async (selectedPatient) => {
    setPatient(selectedPatient);
    setSearchResults([]);
    setAiSummary("");

    // 1. Fetch Ward/Bed Location
    const { data: bedInfo } = await supabase
      .from("beds")
      .select("bed_label, ward_type")
      .eq("patient_id", selectedPatient.id)
      .maybeSingle();
    setPatientBed(bedInfo);

    // 2. Fetch Interaction History
    const { data: notes } = await supabase
      .from("clinical_notes")
      .select("*")
      .eq("patient_id", selectedPatient.id)
      .order("created_at", { ascending: false });
    const clinicalHistory = notes || [];
    setHistory(clinicalHistory);

    // 3. AI Snapshot
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

    // 4. Fetch Household Linkage
    const { data: family } = await supabase
      .from("family_members")
      .select("*")
      .eq("user_id", selectedPatient.id);
    setFamilyMembers(family || []);

    // 5. Update modification timestamp
    await supabase
      .from("users")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", selectedPatient.id);
  };

  const handleSaveMedLog = async () => {
    if (!newMed.name) return alert("Specify medication.");
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("medication_logs").insert({
      patient_id: patient.id,
      nurse_id: user.id,
      medication_name: newMed.name,
      dosage: newMed.dosage,
    });

    if (!error) {
      setAdherenceData((prev) => [...prev.slice(1), 100]);
      setIsMedModalOpen(false);
      setNewMed({ name: "", dosage: "" });
      alert(`Log Successful: ${newMed.name} administered.`);
    }
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
    <div className="p-10 bg-[#F8FAFC] min-h-screen font-sans text-slate-800">
      {/* HEADER */}
      <div className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold tracking-tight uppercase leading-none">
            Digital Charting
          </h1>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] mt-3">
            NCGH Integrated Health Node • Secure Data Feed
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
      <div className="flex gap-4 items-center max-w-2xl mb-12">
        <form
          onSubmit={(e) => handleSearch(e)}
          className="flex-1 flex bg-white p-1 rounded-2xl shadow-sm border border-slate-200 items-center transition-all focus-within:border-primary"
        >
          <div className="pl-4 text-slate-300">
            <Search size={18} />
          </div>
          <input
            type="text"
            placeholder="Find by ID or Name..."
            className="w-full outline-none px-4 text-sm font-semibold text-slate-600 h-11 bg-transparent"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button className="bg-slate-900 text-white px-6 h-11 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-black">
            Execute
          </button>
        </form>
        {patient && (
          <button
            onClick={() => {
              setPatient(null);
              setPatientBed(null);
              setSearchTerm("");
            }}
            className="bg-white border border-slate-200 text-slate-400 p-3 rounded-xl hover:text-red-500 transition-all shadow-sm"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* RECENTLY ACCESSED */}
      {!patient && searchResults.length === 0 && (
        <div className="space-y-6 animate-in fade-in duration-700">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-4 flex items-center gap-2">
            <History size={14} /> Recent Records
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentPatients.map((person) => (
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
                    <p className="font-bold text-gray-800 text-xs uppercase">
                      {person.first_name} {person.last_name}
                    </p>
                    <p className="text-[9px] font-medium text-gray-400 uppercase">
                      {person.barangay || "Area Unset"}
                    </p>
                  </div>
                </div>
                <ChevronRight
                  size={16}
                  className="text-slate-200 group-hover:text-emerald-500 transition-all"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PATIENT CHART */}
      {patient && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
          <div className="bg-white p-10 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-center relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary" />
            <div className="flex items-center gap-10">
              <div className="w-24 h-24 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 text-primary shadow-inner">
                <User size={40} />
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight leading-none uppercase">
                    {patient.first_name} {patient.last_name}
                  </h2>
                  {patientBed && (
                    <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-100 px-3 py-1 rounded-lg uppercase flex items-center gap-2 animate-pulse">
                      <MapPin size={10} /> {patientBed.ward_type} —{" "}
                      {patientBed.bed_label}
                    </span>
                  )}
                </div>
                <div className="flex gap-6 items-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    PHILHEALTH ID: {patient.philhealth_id || "NOT LINKED"}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 uppercase">
                    <Shield size={12} /> YAKAP Verified
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                    <Stethoscope size={12} /> Primary Doctor: Dr. Santos
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setShowDocs(true);
                  fetchDocuments(patient.id);
                }}
                className="bg-blue-50 text-blue-600 px-6 py-4 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all border border-blue-100 flex items-center gap-2"
              >
                <FolderOpen size={16} /> View Docs
              </button>
              <button
                onClick={() => setIsEntryModalOpen(true)}
                className="bg-slate-900 text-white px-8 py-4 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95 flex items-center gap-2"
              >
                <PlusCircle size={16} /> New Encounter
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

            <div className="bg-[#004D40] text-white p-8 rounded-2xl shadow-xl relative overflow-hidden group">
              <BrainCircuit
                className="absolute -right-4 -top-4 opacity-10 group-hover:rotate-12 transition-transform"
                size={120}
              />
              <h3 className="text-[10px] font-bold uppercase tracking-widest mb-6 flex items-center gap-2 text-teal-300">
                AI Snapshot
              </h3>
              {isSummarizing ? (
                <Loader2 className="animate-spin text-teal-200" />
              ) : (
                <p className="text-[13px] font-medium leading-relaxed italic text-teal-50">
                  "{aiSummary || "Recording encounter handshakes required."}"
                </p>
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
                label="Point of Contact"
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
                      className={`absolute bottom-0 w-full rounded-t-lg transition-all duration-700 ${val > 60 ? "bg-emerald-400" : "bg-rose-400"}`}
                      style={{ height: "100%" }}
                    />
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[8px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 font-bold whitespace-nowrap z-10">
                      {val}% Adherence
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
                      className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center group hover:bg-white transition-all"
                    >
                      <div>
                        <p className="text-[11px] font-bold text-slate-800 uppercase leading-none mb-1.5">
                          {m.full_name}
                        </p>
                        <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-tighter">
                          {m.relationship}
                        </p>
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 italic">
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
                <span className="text-emerald-600 font-black tracking-tight">
                  Handshake Authenticated
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {history.map((note) => (
                  <div
                    key={note.id}
                    className="grid grid-cols-12 items-start p-10 hover:bg-slate-50/20 transition-colors"
                  >
                    <div className="col-span-2 text-[10px] font-black text-slate-300 uppercase tracking-widest italic">
                      {new Date(note.created_at).toLocaleDateString()}
                    </div>
                    <div className="col-span-10 flex gap-16 text-sm">
                      <div className="flex-1 border-l-2 border-emerald-100 pl-10 text-slate-500 font-medium italic leading-relaxed">
                        "{note.subjective_notes}"
                      </div>
                      <div className="flex-1 border-l-2 border-slate-50 pl-10">
                        <p className="font-bold text-slate-900 uppercase text-xs mb-3 tracking-tight">
                          {note.assessment}
                        </p>
                        <p className="text-slate-400 text-xs leading-relaxed">
                          {note.plan}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- DOSE MODAL --- */}
      {isMedModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[250] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-12 animate-in zoom-in duration-200 border border-white">
            <div className="flex justify-between items-center mb-10">
              <div className="flex items-center gap-4 text-emerald-600 uppercase font-bold tracking-tight">
                <Pill size={24} /> Dose Ledger
              </div>
              <button onClick={() => setIsMedModalOpen(false)}>
                <X size={28} className="text-slate-300 hover:text-rose-500" />
              </button>
            </div>
            <div className="space-y-6 mb-12">
              <input
                type="text"
                className="w-full bg-slate-50 rounded-2xl p-5 text-sm font-bold text-slate-800 outline-none border-2 border-transparent focus:border-emerald-100"
                placeholder="Medication Name"
                value={newMed.name}
                onChange={(e) => setNewMed({ ...newMed, name: e.target.value })}
              />
              <input
                type="text"
                className="w-full bg-slate-50 rounded-2xl p-5 text-sm font-bold text-slate-800 outline-none border-2 border-transparent focus:border-emerald-100"
                placeholder="Dosage (e.g. 500mg)"
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

      {/* --- ENTRY MODAL --- */}
      {isEntryModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-5xl p-14 animate-in zoom-in duration-200 overflow-y-auto max-h-[90vh] no-scrollbar border border-white/20">
            <div className="flex justify-between items-center mb-12 border-b border-slate-50 pb-10 uppercase italic text-primary font-bold">
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
                className="flex-1 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest rounded-xl hover:bg-slate-50"
              >
                Abort
              </button>
              <button
                onClick={handleSaveEntry}
                disabled={isSaving}
                className="flex-[2] py-5 bg-slate-900 text-white text-[11px] font-black uppercase tracking-[0.4em] rounded-[2rem] shadow-2xl active:scale-95 flex justify-center items-center gap-4 italic"
              >
                {isSaving ? <Loader2 className="animate-spin" /> : <Save />}{" "}
                Commit Handshake to Record
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
                onScan={(result) => {
                  // Fix for the crash: safety check for null result
                  if (result && result.length > 0 && result[0]?.rawValue) {
                    handleSearch(null, result[0].rawValue);
                  }
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

      {/* --- ATTACHMENTS MODAL --- */}
      {showDocs && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[100] flex items-center justify-center p-4"
          onClick={() => setShowDocs(false)}
        >
          <div
            className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl p-12 overflow-hidden animate-in zoom-in duration-200 border border-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-10 border-b border-slate-50 pb-8 uppercase font-bold italic tracking-tighter text-slate-800 text-2xl leading-none">
              Clinical Storage{" "}
              <button onClick={() => setShowDocs(false)}>
                <X size={32} className="text-slate-300 hover:text-red-500" />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto max-h-[450px] no-scrollbar pr-1 text-center">
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
        className="w-full bg-slate-50 rounded-2xl p-8 text-[14px] font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary/10 border-none resize-none h-44 shadow-inner"
        value={val}
        onChange={(e) => set(e.target.value)}
      />
    )}
  </div>
);

const InfoCard = ({ title, icon, children }) => (
  <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col h-full group hover:shadow-lg hover:border-primary/20 transition-all">
    <div className="flex items-center gap-3 mb-8 border-b border-slate-50 pb-4 text-slate-300 group-hover:text-primary transition-colors">
      {icon}{" "}
      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
        {title}
      </h3>
    </div>
    <div className="space-y-4 flex-grow">{children}</div>
  </div>
);

const DataRow = ({ label, value, color = "text-slate-800" }) => (
  <div className="flex justify-between items-center text-xs">
    <span className="font-bold text-slate-300 uppercase tracking-tighter text-[9px]">
      {label}
    </span>
    <span className={`font-bold uppercase ${color} tracking-tighter`}>
      {value}
    </span>
  </div>
);

export default Charting;
