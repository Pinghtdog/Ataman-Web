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
  Clock,
  History,
  X,
  Edit3,
  Save,
  FolderOpen,
  ExternalLink,
  PlusCircle,
  QrCode, // <--- NEW IMPORT
  Camera, // <--- NEW IMPORT
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { Scanner } from '@yudiel/react-qr-scanner';

const Charting = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [patient, setPatient] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [recentPatients, setRecentPatients] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedPatient, setEditedPatient] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  
  // --- NEW STATE FOR SCANNER ---
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    fetchRecent();
    checkUserRole();
  }, []);

  const checkUserRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
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
      .select("id, first_name, last_name, birth_date, barangay, updated_at")
      .order("updated_at", { ascending: false })
      .limit(6);
    if (data) setRecentPatients(data);
    setLoadingRecent(false);
  };

  // --- MODIFIED SEARCH FUNCTION TO ACCEPT DIRECT INPUT ---
 const handleSearch = async (e, directTerm = null) => {
    if (e) e.preventDefault();
    
    const termToUse = directTerm || searchTerm;
    if (!termToUse.trim()) return;
    
    setLoading(true);
    setPatient(null);
    setSearchResults([]);

    const terms = termToUse.trim().split(" ");
    let query = supabase.from("users").select("*");

    if (terms.length === 1) {
      // --- UPDATED QUERY LINE ---
      // We added ",id.eq.${terms[0]}" at the very end so it checks the UUID too
      query = query.or(
        `first_name.ilike.%${terms[0]}%,last_name.ilike.%${terms[0]}%,philhealth_id.eq.${terms[0]},id.eq.${terms[0]}`
      );
    } else {
      query = query
        .ilike("first_name", `%${terms[0]}%`)
        .ilike("last_name", `%${terms[terms.length - 1]}%`);
    }

    const { data } = await query;
    if (data?.length === 1) selectPatient(data[0]);
    else if (data?.length > 1) setSearchResults(data);
    else alert("No records found.");
    
    // If it came from QR, update the search box visual too
    if (directTerm) setSearchTerm(directTerm);
    
    setLoading(false);
  };

  // --- NEW FUNCTION TO HANDLE QR RESULTS ---
 const handleQrScan = (detectedCodes) => {
    if (detectedCodes && detectedCodes.length > 0) {
      const scannedText = detectedCodes[0].rawValue;
      
      if (scannedText) {
        // --- ADD THIS ALERT FOR DEBUGGING ---
        alert("DEBUG: The scanner read this text: " + scannedText); 
        
        setShowScanner(false); 
        handleSearch(null, scannedText); 
      }
    }
  };
  
  const handleQrError = (err) => {
    console.error(err);
  };

  const selectPatient = async (selectedPatient) => {
    setPatient(selectedPatient);
    setEditedPatient(selectedPatient);
    setSearchResults([]);
    setIsEditing(false);

    const { data: notes } = await supabase
      .from("clinical_notes")
      .select("*")
      .eq("patient_id", selectedPatient.id)
      .order("created_at", { ascending: false });
    setHistory(notes || []);

    await supabase
      .from("users")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", selectedPatient.id);
  };

  const fetchDocuments = async (patientId) => {
    setLoadingDocs(true);
    const { data, error } = await supabase
      .from("medical_documents")
      .select("*")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    if (!error) setDocuments(data);
    setLoadingDocs(false);
  };

  const handleSaveEdits = async () => {
    setIsSaving(true);
    const { error } = await supabase
      .from("users")
      .update({
        blood_type: editedPatient.blood_type,
        medical_conditions: editedPatient.medical_conditions,
        allergies: editedPatient.allergies,
        emergency_contact_name: editedPatient.emergency_contact_name,
        emergency_contact_phone: editedPatient.emergency_contact_phone,
      })
      .eq("id", patient.id);

    if (!error) {
      setPatient(editedPatient);
      setIsEditing(false);
      alert("Medical Record Updated Successfully.");
    } else {
      alert("Error: " + error.message);
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
      <div className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter leading-none">
            Digital Charting
          </h1>
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-[0.2em] mt-2">
            Naga City Health Registry • Authorized Personnel Only
          </p>
        </div>
        
        <div className="flex gap-3">
            {/* --- NEW SCAN QR BUTTON --- */}
            <button 
                onClick={() => setShowScanner(true)}
                className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-600 transition-all flex items-center gap-2 shadow-lg shadow-slate-200"
            >
                <QrCode size={16} /> Scan Patient ID
            </button>

            {userRole === "DOCTOR" && (
            <span className="bg-emerald-50 text-emerald-600 px-4 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-emerald-100 flex items-center gap-2">
                <Shield size={12} /> Verified Clinician
            </span>
            )}
        </div>
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
            placeholder="Search by name or ID..."
            className="w-full outline-none px-4 text-sm font-medium text-gray-600 h-12 bg-transparent"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button className="bg-gray-900 text-white px-8 h-12 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-black transition-all">
            {loading ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              "Search"
            )}
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

      {/* --- EXISTING RECENTLY ACCESSED CODE (No Changes) --- */}
      {!patient && searchResults.length === 0 && (
        <div className="space-y-6 animate-in fade-in duration-700">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-4 flex items-center gap-2">
            <History size={14} /> Recent Modifications
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

      {/* --- EXISTING PATIENT CHART CODE (No Changes) --- */}
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
                  <button
                    onClick={() => {
                      setShowDocs(true);
                      fetchDocuments(patient.id);
                    }}
                    className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5 hover:underline"
                  >
                    <FolderOpen size={12} /> View Digital Attachments
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              {(userRole === "DOCTOR" || userRole === "ADMIN") && (
                <button
                  onClick={() =>
                    isEditing ? handleSaveEdits() : setIsEditing(true)
                  }
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all ${isEditing ? "bg-emerald-600 text-white shadow-lg" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  {isSaving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : isEditing ? (
                    <Save size={14} />
                  ) : (
                    <Edit3 size={14} />
                  )}
                  {isEditing ? "Commit Changes" : "Edit Medical Results"}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <InfoCard title="Profile Details" icon={<Calendar size={16} />}>
              <DataRow
                label="Age"
                value={`${calculateAge(patient.birth_date)} YRS`}
              />
              <DataRow label="Sex" value={patient.gender || "N/A"} />
              <DataRow
                label="Phone"
                value={patient.phone_number || "NO DATA"}
              />
              <DataRow label="Area" value={patient.barangay || "UNSET"} />
            </InfoCard>

            <InfoCard title="Medical Baseline" icon={<HeartPulse size={16} />}>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-bold text-gray-400 uppercase">
                    Blood Type
                  </span>
                  {isEditing ? (
                    <input
                      className="bg-gray-50 border rounded-lg px-2 py-1 text-xs font-bold text-red-600 w-16"
                      value={editedPatient.blood_type}
                      onChange={(e) =>
                        setEditedPatient({
                          ...editedPatient,
                          blood_type: e.target.value,
                        })
                      }
                    />
                  ) : (
                    <span className="font-bold text-red-600 uppercase">
                      {patient.blood_type || "Unknown"}
                    </span>
                  )}
                </div>
                <div className="pt-2">
                  <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">
                    Stated Conditions
                  </p>
                  {isEditing ? (
                    <textarea
                      className="w-full bg-gray-50 border rounded-xl p-3 text-xs font-medium"
                      rows="3"
                      value={editedPatient.medical_conditions}
                      onChange={(e) =>
                        setEditedPatient({
                          ...editedPatient,
                          medical_conditions: e.target.value,
                        })
                      }
                    />
                  ) : (
                    <p className="text-xs font-medium text-gray-600 leading-relaxed italic">
                      "
                      {patient.medical_conditions ||
                        "No chronic conditions listed."}
                      "
                    </p>
                  )}
                </div>
              </div>
            </InfoCard>

            <InfoCard
              title="Emergency Response"
              icon={<AlertCircle size={16} />}
            >
              <div className="p-5 bg-red-50/30 rounded-[1.8rem] border border-red-50">
                <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Activity size={10} /> Critical Allergies
                </p>
                {isEditing ? (
                  <input
                    className="w-full bg-white border border-red-100 rounded-lg p-2 text-xs font-bold text-red-600 uppercase"
                    value={editedPatient.allergies}
                    onChange={(e) =>
                      setEditedPatient({
                        ...editedPatient,
                        allergies: e.target.value,
                      })
                    }
                  />
                ) : (
                  <p className="text-xs font-bold text-red-600 uppercase">
                    {patient.allergies || "None Reported"}
                  </p>
                )}
              </div>
              <div className="mt-4 px-2 space-y-2">
                <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">
                  Emergency Contact
                </p>
                {isEditing ? (
                  <input
                    className="w-full bg-gray-50 border rounded-lg p-2 text-xs font-bold"
                    placeholder="Name"
                    value={editedPatient.emergency_contact_name}
                    onChange={(e) =>
                      setEditedPatient({
                        ...editedPatient,
                        emergency_contact_name: e.target.value,
                      })
                    }
                  />
                ) : (
                  <p className="text-xs font-bold text-gray-700 uppercase">
                    {patient.emergency_contact_name || "N/A"}
                  </p>
                )}
              </div>
            </InfoCard>
          </div>

          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em] mb-10 border-b border-gray-50 pb-4 text-center">
              Clinical Interaction Stream
            </h3>
            <div className="space-y-4">
              {history.length > 0 ? (
                history.map((note) => (
                  <div
                    key={note.id}
                    className="grid grid-cols-12 items-center p-6 bg-gray-50/40 rounded-[2rem] border border-gray-50 hover:bg-white transition-all group"
                  >
                    <div className="col-span-2 text-[10px] font-medium text-gray-400 uppercase tracking-widest">
                      {new Date(note.created_at).toLocaleDateString()}
                    </div>
                    <div className="col-span-3 flex items-center gap-2">
                      <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-[#00695C] group-hover:text-white transition-colors">
                        <Activity size={14} />
                      </div>
                      <span className="text-[10px] font-bold uppercase text-gray-600 tracking-widest uppercase italic">
                        Diagnostic Note
                      </span>
                    </div>
                    <div className="col-span-7 text-sm font-medium text-gray-600 leading-relaxed italic">
                      "{note.subjective_notes}"
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-20 text-center text-gray-300 font-bold text-[10px] uppercase tracking-[0.2em]">
                  Clinical History Clear
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- ATTACHMENTS MODAL (No Changes) --- */}
      {showDocs && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4" onClick={() => setShowDocs(false)}>
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl p-12 animate-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
            {/* ... (Existing Modal Content) ... */}
             <div className="flex justify-between items-center mb-10 border-b border-slate-50 pb-8">
               {/* Simplified for brevity - keep your existing code here */}
               <h2 className="text-2xl font-black">Medical Archive</h2>
               <button onClick={() => setShowDocs(false)}><X size={28} /></button>
             </div>
             {/* ... */}
          </div>
        </div>
      )}

      {/* --- NEW SCANNER POPUP MODAL --- */}
      {showScanner && (
        <div
          className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[200] flex items-center justify-center p-4"
          onClick={() => setShowScanner(false)}
        >
          <div
            className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div className="flex items-center gap-3">
                    <div className="bg-white p-2 rounded-lg text-slate-900 shadow-sm"><Camera size={18} /></div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Scan Patient ID</h3>
                </div>
                <button onClick={() => setShowScanner(false)} className="text-gray-400 hover:text-red-500">
                    <X size={20} />
                </button>
            </div>
            
            <div className="p-2 bg-black relative rounded-xl overflow-hidden h-[350px]">
                 {/* MODERN SCANNER COMPONENT */}
                 <Scanner
                    onScan={handleQrScan}
                    components={{ 
                        audio: false,    // Turn off beep noise
                        finder: false    // We use our own custom overlay
                    }}
                    styles={{
                        container: { width: "100%", height: "100%" },
                        video: { width: "100%", height: "100%", objectFit: "cover" }
                    }}
                />
                
                {/* Custom Overlay */}
                <div className="absolute inset-0 border-[40px] border-black/50 pointer-events-none flex items-center justify-center z-10">
                    <div className="w-full h-full border-2 border-emerald-500/50 relative">
                        <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-emerald-500"></div>
                        <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-emerald-500"></div>
                        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-emerald-500"></div>
                        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-emerald-500"></div>
                    </div>
                </div>
            </div>

            <div className="p-6 text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Hold QR code within the frame
                </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// HELPERS (No Changes)
const InfoCard = ({ title, icon, children }) => (
  <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col h-full relative group">
    <div className="flex items-center gap-3 mb-6 border-b border-gray-50 pb-4 text-primary">
      {icon}
      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
        {title}
      </h3>
    </div>
    <div className="space-y-3">{children}</div>
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