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
  Baby,
  ExternalLink,
  Camera,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { Scanner } from "@yudiel/react-qr-scanner";
import { useRef } from "react";

const Charting = () => {
  // Navigation & Search States
  const [searchTerm, setSearchTerm] = useState("");
  const [patient, setPatient] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [recentPatients, setRecentPatients] = useState([]);
  const [history, setHistory] = useState([]);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(true);

  // Feature States
  const [userRole, setUserRole] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const searchCache = useRef(new Map());

  // Clinical Encounter States
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
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

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanTerm);

    if (isUUID) {
       query = query.eq('id', cleanTerm);
    } else {
       query = query.or(
         `first_name.ilike.%${cleanTerm}%,last_name.ilike.%${cleanTerm}%,philhealth_id.eq.${cleanTerm},medical_id.eq.${cleanTerm}`
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
  };

  // --- NEW: DEDICATED QR SCANNER HANDLER ---
  const handleQrScan = (detectedCodes) => {
    if (detectedCodes && detectedCodes.length > 0) {
      const rawValue = detectedCodes[0].rawValue;
      if (!rawValue) return;

      try {
        // 1. Attempt to parse JSON (Secure Mode)
        const qrData = JSON.parse(rawValue);

        // 2. Validate Format & Expiration
        if (qrData.type === "PATIENT_ID" && qrData.data && qrData.generated_at) {
            
            const generatedTime = new Date(qrData.generated_at).getTime();
            const currentTime = Date.now();
            const timeLimit = 10 * 60 * 1000; // 10 Minutes

            if (currentTime - generatedTime > timeLimit) {
                alert("⛔ SECURITY ALERT: This QR Code has expired.\nPlease ask the patient to refresh their screen.");
                return; // Block the scan
            }

            console.log("✅ Secure QR Verified. ID:", qrData.data);
            setShowScanner(false);
            handleSearch(null, qrData.data); // Search using the UUID
        } else {
            // It's JSON but not our format? Treat as raw text just in case.
             throw new Error("Unknown JSON format");
        }
      } catch (e) {
        // 3. Fallback for Legacy/Printed QR Codes (Non-JSON)
        console.log("⚠️ Scanned legacy/raw code:", rawValue);
        setShowScanner(false);
        handleSearch(null, rawValue);
      }
    }
  };

  const selectPatient = async (selectedPatient) => {
    setPatient(selectedPatient);
    setSearchResults([]);

    // Fetch Clinical History
    const { data: notes } = await supabase
      .from("clinical_notes")
      .select("*")
      .eq("patient_id", selectedPatient.id)
      .order("created_at", { ascending: false });
    setHistory(notes || []);

    // Fetch Family Members
    const { data: family } = await supabase
      .from("family_members")
      .select("*")
      .eq("user_id", selectedPatient.id);
    setFamilyMembers(family || []);

    // Update timestamp for "Recent" logic
    await supabase
      .from("users")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", selectedPatient.id);
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

  const handleSaveEntry = async () => {
    if (!newEntry.assessment) return alert("Please provide a diagnosis.");
    setIsSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("clinical_notes").insert({
      patient_id: patient.id,
      doctor_id: user.id,
      subjective_notes: newEntry.subjective,
      objective_notes: newEntry.objective,
      assessment: newEntry.assessment,
      plan: newEntry.plan,
      created_at: new Date().toISOString(),
    });

    if (!error) {
      setIsEntryModalOpen(false);
      setNewEntry({ subjective: "", objective: "", assessment: "", plan: "" });
      selectPatient(patient);
    }
    setIsSaving(false);
  };

  const calculateAge = (dob) => {
    if (!dob) return "N/A";
    const ageDifMs = Date.now() - new Date(dob).getTime();
    return Math.abs(new Date(ageDifMs).getUTCFullYear() - 1970);
  };

  return (
    <div className="p-10 bg-[#F8FAFC] min-h-screen font-sans">
      {/* HEADER */}
      <div className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter leading-none">
            Digital Charting
          </h1>
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-[0.2em] mt-2 italic">
            Naga City Central Health Registry
          </p>
        </div>
        <button
          onClick={() => setShowScanner(true)}
          className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all flex items-center gap-2 shadow-xl shadow-slate-200"
        >
          <QrCode size={16} /> Scan Patient ID
        </button>
      </div>

      {/* SEARCH BAR */}
      <div className="flex gap-4 items-center max-w-3xl mb-10">
        <form
          onSubmit={(e) => handleSearch(e)}
          className="flex-1 flex bg-white p-2 rounded-3xl shadow-sm border border-gray-100 items-center transition-all focus-within:shadow-md"
        >
          <div className="pl-4 text-gray-400">
            <Search size={20} />
          </div>
          <input
            type="text"
            placeholder="Search first, last, or full name..."
            className="w-full outline-none px-4 text-sm font-medium text-gray-600 h-12 bg-transparent"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button className="bg-gray-900 text-white px-8 h-12 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-black">
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
            className="bg-white border border-gray-200 text-gray-400 p-3.5 rounded-2xl hover:text-red-500 transition-all shadow-sm"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* --- SEARCH RESULTS (SUGGESTION BOX) --- */}
      {!patient && searchResults.length > 0 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-4 flex items-center gap-2">
            <Search size={14} /> Found {searchResults.length} Match{searchResults.length > 1 ? "es" : ""}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {searchResults.map((person) => (
              <div
                key={person.id}
                onClick={() => selectPatient(person)}
                className="bg-white p-6 rounded-[2rem] border border-emerald-100 shadow-md shadow-emerald-500/10 hover:border-emerald-500 hover:shadow-xl cursor-pointer flex justify-between items-center transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 group-hover:bg-[#00695C] group-hover:text-white transition-colors">
                    <User size={20} />
                  </div>
                  <div>
                    <p className="font-black text-slate-800 text-sm uppercase tracking-tight">
                      {person.first_name} {person.last_name}
                    </p>
                    <div className="flex gap-2 mt-1">
                      <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md uppercase">
                        {person.philhealth_id || "No ID"}
                      </span>
                      <span className="text-[9px] font-bold text-gray-400 uppercase">
                        {person.barangay || "Unknown"}
                      </span>
                    </div>
                  </div>
                </div>
                <ChevronRight
                  size={16}
                  className="text-emerald-300 group-hover:text-emerald-600 group-hover:translate-x-1 transition-transform"
                />
              </div>
            ))}
          </div>
        </div>
      )}

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
                  size={14}
                  className="text-gray-200 group-hover:text-emerald-500"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      

      {/* PATIENT CHART */}
      {patient && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100 flex justify-between items-center relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-2 bg-[#00695C]" />
            <div className="flex items-center gap-8">
              <div className="w-24 h-24 bg-gray-50 rounded-[2.5rem] flex items-center justify-center border border-gray-100 text-[#00695C] shadow-inner">
                <User size={40} />
              </div>
              <div>
                <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight leading-none uppercase">
                  {patient.first_name} {patient.last_name}
                </h2>
                <div className="flex gap-4 mt-3">
                  <p className="text-[10px] font-bold text-[#00695C] uppercase tracking-widest opacity-60">
                    ID: {patient.philhealth_id || "NOT LINKED"}
                  </p>
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                    <Shield size={12} /> PhilHealth YAKAP Verified
                  </span>
                  <button
                    onClick={() => {
                      setShowDocs(true);
                      fetchDocuments(patient.id);
                    }}
                    className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5 hover:underline"
                  >
                    <FolderOpen size={12} /> View Documents
                  </button>
                </div>
              </div>
            </div>
            {(userRole === "DOCTOR" || userRole === "ADMIN") && (
              <button
                onClick={() => setIsEntryModalOpen(true)}
                className="flex items-center gap-3 bg-primary text-white px-8 py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95"
              >
                <Plus size={16} /> New Clinical Entry
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <InfoCard title="Profile" icon={<Calendar size={16} />}>
              <DataRow
                label="Age"
                value={`${calculateAge(patient.birth_date)} YRS`}
              />
              <DataRow label="Sex" value={patient.gender || "N/A"} />
              <DataRow label="Barangay" value={patient.barangay || "UNSET"} />
            </InfoCard>
            <InfoCard title="Medical" icon={<HeartPulse size={16} />}>
              <DataRow
                label="Blood"
                value={patient.blood_type || "???"}
                color="text-red-600"
              />
              <p className="text-[9px] font-bold text-gray-400 uppercase mt-4 mb-1">
                Known Conditions
              </p>
              <p className="text-xs font-medium text-gray-600 italic leading-relaxed">
                "{patient.medical_conditions || "None listed."}"
              </p>
            </InfoCard>
            <InfoCard title="Emergency" icon={<AlertCircle size={16} />}>
              <div className="p-4 bg-red-50/50 rounded-2xl border border-red-50 mb-3">
                <p className="text-[9px] font-bold text-red-400 uppercase">
                  Allergies
                </p>
                <p className="text-xs font-bold text-red-600 uppercase">
                  {patient.allergies || "None"}
                </p>
              </div>
              <DataRow
                label="Contact"
                value={patient.emergency_contact_name || "N/A"}
              />
            </InfoCard>

            {/* HOUSEHOLD / FAMILY SECTION */}
            <InfoCard title="Household" icon={<Users size={16} />}>
              <div className="space-y-3">
                {familyMembers.length > 0 ? (
                  familyMembers.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 bg-gray-50 rounded-xl border border-gray-100"
                    >
                      <p className="text-[10px] font-bold text-gray-800 leading-none mb-1 uppercase tracking-tight">
                        {m.full_name}
                      </p>
                      <div className="flex justify-between items-center">
                        <span className="text-[8px] font-medium text-emerald-600 uppercase tracking-widest">
                          {m.relationship}
                        </span>
                        <span className="text-[8px] text-gray-400 font-bold flex items-center gap-1">
                          <Phone size={8} />
                          {/* UPDATE THIS LINE BELOW */}
                          {m.phone_number || "No Phone"}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-[10px] text-gray-300 py-4 italic">
                    No linked family members
                  </p>
                )}
              </div>
            </InfoCard>
          </div>

          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em] mb-10 border-b border-gray-50 pb-4 text-center">
              Encounter History
            </h3>
            <div className="space-y-4">
              {history.map((note) => (
                <div
                  key={note.id}
                  className="grid grid-cols-12 items-start p-8 bg-gray-50/40 rounded-[2.5rem] border border-gray-50 hover:bg-white transition-all group"
                >
                  <div className="col-span-2 text-[10px] font-medium text-gray-400 uppercase">
                    {new Date(note.created_at).toLocaleDateString()}
                  </div>
                  <div className="col-span-3 flex items-center gap-2">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                      <ClipboardCheck size={14} />
                    </div>
                    <span className="text-[10px] font-bold uppercase text-slate-800 tracking-widest italic">
                      Encrypted Record
                    </span>
                  </div>
                  <div className="col-span-7 space-y-4">
                    <div>
                      <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">
                        Observations
                      </span>
                      <p className="text-xs font-medium text-slate-600 leading-relaxed mt-1 italic">
                        "{note.subjective_notes || note.objective_notes}"
                      </p>
                    </div>
                    <div>
                      <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">
                        Clinical Disposition
                      </span>
                      <p className="text-xs font-bold text-slate-800 mt-1 uppercase leading-tight">
                        {note.assessment}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {note.plan}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- ENTRY MODAL --- */}
      {isEntryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-4xl p-12 animate-in zoom-in duration-200 overflow-y-auto max-h-[90vh] no-scrollbar">
            <div className="flex justify-between items-center mb-10 border-b border-gray-50 pb-8">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-primary rounded-3xl text-white shadow-lg">
                  <FileText size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter italic">
                    New Clinical Entry
                  </h2>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    Doctor: {userRole} • Recording for {patient.first_name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEntryModalOpen(false)}
                className="p-2 text-slate-300 hover:text-rose-500"
              >
                <X size={28} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-10">
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block px-2">
                    Subjective (Symptoms)
                  </label>
                  <textarea
                    className="w-full bg-gray-50 rounded-2xl p-5 text-sm font-medium text-slate-700 outline-none min-h-[120px] resize-none"
                    value={newEntry.subjective}
                    onChange={(e) =>
                      setNewEntry({ ...newEntry, subjective: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block px-2">
                    Objective (Clinical Vitals)
                  </label>
                  <textarea
                    className="w-full bg-gray-50 rounded-2xl p-5 text-sm font-medium text-slate-700 outline-none min-h-[120px] resize-none"
                    placeholder="BP, Temp, HR..."
                    value={newEntry.objective}
                    onChange={(e) =>
                      setNewEntry({ ...newEntry, objective: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block px-2">
                    Assessment (Diagnosis)
                  </label>
                  <input
                    className="w-full bg-gray-50 rounded-2xl p-5 text-sm font-bold text-slate-800 uppercase"
                    value={newEntry.assessment}
                    onChange={(e) =>
                      setNewEntry({ ...newEntry, assessment: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block px-2">
                    Plan (Treatment)
                  </label>
                  <textarea
                    className="w-full bg-gray-50 rounded-2xl p-5 text-sm font-medium text-slate-700 outline-none min-h-[120px] resize-none"
                    value={newEntry.plan}
                    onChange={(e) =>
                      setNewEntry({ ...newEntry, plan: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
            <div className="mt-12 flex gap-4">
              <button
                onClick={() => setIsEntryModalOpen(false)}
                className="flex-1 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest rounded-2xl hover:bg-gray-50 transition-all"
              >
                Discard
              </button>
              <button
                onClick={handleSaveEntry}
                disabled={isSaving}
                className="flex-[2] py-5 bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-xl hover:bg-black transition-all flex items-center justify-center gap-3"
              >
                {isSaving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}{" "}
                Commit Encounter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- ATTACHMENTS MODAL --- */}
      {showDocs && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4"
          onClick={() => setShowDocs(false)}
        >
          <div
            className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl p-12 overflow-hidden animate-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-10 border-b border-slate-50 pb-8">
              <h2 className="text-2xl font-black italic uppercase">
                Medical Archive
              </h2>
              <button onClick={() => setShowDocs(false)}>
                <X size={28} />
              </button>
            </div>
            <div className="space-y-4 max-h-[400px] overflow-y-auto no-scrollbar pr-2">
              {documents.map((doc) => (
                <a
                  key={doc.id}
                  href={doc.file_path}
                  target="_blank"
                  rel="noreferrer"
                  className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 flex justify-between items-center hover:bg-white hover:border-blue-400 transition-all shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-slate-400">
                      <FileText size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-800 uppercase">
                        {doc.document_name}
                      </p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">
                        {doc.document_type} •{" "}
                        {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <ExternalLink size={16} className="text-slate-300" />
                </a>
              ))}
              {documents.length === 0 && (
                <p className="text-center text-gray-300 uppercase font-bold text-xs py-20 border-2 border-dashed rounded-[2rem]">
                  Empty Node
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- QR SCANNER --- */}
      {showScanner && (
        <div
          className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[200] flex items-center justify-center p-4"
          onClick={() => setShowScanner(false)}
        >
          <div
            className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b flex justify-between items-center bg-gray-50 uppercase font-black text-sm tracking-widest">
              Scan Patient ID{" "}
              <button onClick={() => setShowScanner(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="p-2 bg-black h-[350px]">
              {/* UPDATED: Uses dedicated handleQrScan instead of direct handleSearch */}
              <Scanner 
                 onScan={handleQrScan} 
                 onError={(error) => {
                    if (error?.message?.includes("permission")) {
                        alert("Camera blocked! Please click the lock icon in your browser address bar to enable it.");
                    }
                 }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// HELPERS
const InfoCard = ({ title, icon, children }) => (
  <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col h-full relative overflow-hidden">
    <div className="flex items-center gap-3 mb-6 border-b border-gray-50 pb-4 text-primary opacity-60">
      {icon}
      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
        {title}
      </h3>
    </div>
    <div className="space-y-3 flex-grow">{children}</div>
  </div>
);

const DataRow = ({ label, value, color = "text-gray-800" }) => (
  <div className="flex justify-between items-center text-sm">
    <span className="font-medium text-gray-400 uppercase tracking-tighter text-[9px]">
      {label}
    </span>
    <span className={`font-bold uppercase ${color}`}>{value}</span>
  </div>
);

export default Charting;