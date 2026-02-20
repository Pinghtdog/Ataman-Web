import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { motion, AnimatePresence } from "framer-motion";

const CreateReferralModal = ({ onClose, onSuccess, myFacilityId, initialData }) => {
  const [view, setView] = useState("list"); 
  const [facilities, setFacilities] = useState([]);
  const [patients, setPatients] = useState([]);
  const [ambulances, setAmbulances] = useState([]);
  const [staff, setStaff] = useState([]); 
  const [selectedFacility, setSelectedFacility] = useState(null);

  // Facility Asset States
  const [facilityWards, setFacilityWards] = useState([]);
  const [facilityEquipment, setFacilityEquipment] = useState([]); 
  const [facilityDepts, setFacilityDepts] = useState([]);

  // Search & Selection States
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [isPatientListOpen, setIsPatientListOpen] = useState(false);

  const [staffSearch, setStaffSearch] = useState("");
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [isStaffListOpen, setIsStaffListOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [referralFile, setReferralFile] = useState(null);

  const [formData, setFormData] = useState({
    chief_complaint: "",
    service_stream: "OUTPATIENT",
    ambulance_id: "",
  });

  useEffect(() => { loadInitialData(); }, [myFacilityId]);

  const loadInitialData = async () => {
    if (!myFacilityId || myFacilityId === "null") return;
    try {
      setFetching(true);
      const medicalRoles = ['DOCTOR', 'NURSE', 'HEAD_NURSE', 'RESIDENT', 'SPECIALIST', 'HEALTH_OFFICER', 'ATTENDANT'];

      const [fRes, pRes, aRes, sRes] = await Promise.all([
        supabase.from("facilities").select("*").neq("id", myFacilityId),
        supabase.from("users").select("id, first_name, last_name, medical_id").order("last_name"),
        supabase.from("ambulances").select("id, plate_number").eq("is_available", true),
        supabase.from("facility_staff")
          .select(`id, role, users:user_id (first_name, last_name)`)
          .eq("facility_id", Number(myFacilityId)) 
          .in("role", medicalRoles)
      ]);

      setFacilities(fRes.data || []);
      setPatients(pRes.data || []);
      setAmbulances(aRes.data || []);
      setStaff((sRes.data || []).map(item => ({
        id: item.id,
        role: item.role,
        name: item.users ? `${item.users.last_name}, ${item.users.first_name}` : `Staff (${item.role})`
      })));
    } finally { setFetching(false); }
  };

  const loadFacilityDetails = async (facility) => {
    try {
      setSelectedFacility(facility);
      setFetching(true);
      const [bedsRes, resourcesRes, deptsRes] = await Promise.all([
        supabase.from("beds").select("ward_type, status").eq("facility_id", facility.id),
        supabase.from("facility_resources").select("*").eq("facility_id", facility.id).eq("resource_category", "equipment"),
        supabase.from("departments").select("id, name, specialty").eq("facility_id", Number(facility.id))
      ]);

      const wardMap = bedsRes.data?.reduce((acc, bed) => {
        if (!acc[bed.ward_type]) acc[bed.ward_type] = { total: 0, available: 0 };
        acc[bed.ward_type].total++;
        if (bed.status?.toLowerCase() === "available") acc[bed.ward_type].available++;
        return acc;
      }, {});

      setFacilityWards(Object.entries(wardMap || {}).map(([type, counts]) => ({ type, ...counts })));
      setFacilityEquipment(resourcesRes.data || []);
      setFacilityDepts(deptsRes.data || []);
      setView("details");
    } finally { setFetching(false); }
  };

  const handleFinalize = async (e) => {
    e.preventDefault();
    if (!referralFile || !selectedPatient || !formData.ambulance_id || !selectedStaff) {
      return alert("Incomplete Protocol: Verify Subject, Officer, and Documents.");
    }
    setLoading(true);
    try {
      const fileExt = referralFile.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `slips/${fileName}`;
      await supabase.storage.from('referral-slips').upload(filePath, referralFile);
      const { data: urlData } = supabase.storage.from('referral-slips').getPublicUrl(filePath);

      // 1. Mark Ambulance as Unavailable immediately
      const { error: ambError } = await supabase
        .from("ambulances")
        .update({ is_available: false })
        .eq("id", formData.ambulance_id);
      
      if (ambError) throw new Error("Failed to secure ambulance unit.");

      // 2. Insert Referral
      const { error } = await supabase.from("referrals").insert([{
        ...formData,
        referring_staff_id: selectedStaff.id,
        patient_id: selectedPatient.id,
        origin_facility_id: myFacilityId,
        destination_facility_id: selectedFacility.id,
        referral_slip_url: urlData.publicUrl,
        status: "PENDING",
        reference_number: `REF-${Math.floor(100000 + Math.random() * 900000)}`
      }]);

      if (error) throw error;
      onSuccess(); onClose();
    } catch (err) { 
        alert(err.message); 
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex justify-center items-center z-[9999] p-4 font-sans">
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-5xl h-[620px] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200/60"
      >
        {/* COMMAND HEADER */}
        <div className="px-8 py-4 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-1 h-8 bg-emerald-500 rounded-full" />
            <div>
              <h2 className="text-base font-black uppercase italic tracking-tighter leading-none text-slate-800">Discovery Hub</h2>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] mt-0.5">Asset & Capability Terminal</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-rose-50 hover:text-rose-500 transition-all flex items-center justify-center text-slate-300">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#F8FAFC]">
          
          {/* VIEW 1: NODE REGISTRY */}
          {view === "list" && (
            <div className="p-8 animate-in fade-in duration-500">
              <div className="flex flex-col items-center mb-8">
                <input placeholder="Select Facility..." className="w-full max-w-md p-4 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all uppercase tracking-widest shadow-sm"
                  onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="grid grid-cols-4 gap-4">
                {facilities.filter(f => f.name.toLowerCase().includes(search.toLowerCase())).map(f => (
                  <button key={f.id} onClick={() => loadFacilityDetails(f)} className="bg-white p-5 rounded-2xl border border-slate-100 hover:border-emerald-500 hover:shadow-lg transition-all text-left group">
                    <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-xl mb-3 border border-slate-100 group-hover:bg-emerald-50 transition-colors">🏥</div>
                    <h4 className="font-black text-[10px] uppercase tracking-tight text-slate-800 leading-tight line-clamp-2 h-8">{f.name}</h4>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* VIEW 2: CAPABILITY TELEMETRY (DETAILED) */}
          {view === "details" && selectedFacility && (
            <div className="animate-in slide-in-from-right-4 duration-500 flex h-full">
              {/* Profile Brief */}
              <div className="w-[30%] p-6 border-r border-slate-100 bg-white space-y-4">
                <button onClick={() => setView("list")} className="text-[8px] font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600 transition-colors">← Back to Registry</button>
                <div className="rounded-xl overflow-hidden shadow-md border border-slate-100 aspect-video">
                  <img src={selectedFacility.image_url || "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=1000&auto=format&fit=crop"} className="w-full h-full object-cover" alt="" />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase italic tracking-tighter leading-tight text-slate-800 mb-2">{selectedFacility.name}</h3>
                  <button onClick={() => setView("form")} className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg hover:bg-emerald-600 transition-all active:scale-95">Initiate Disposition</button>
                </div>
              </div>

              {/* Asset Data Grid */}
              <div className="flex-1 p-6 space-y-6 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 gap-6">
                  {/* Occupancy HUD */}
                  <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Inpatient Occupancy</p>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                      {facilityWards.map(w => (
                        <div key={w.type} className="space-y-1.5">
                          <div className="flex justify-between font-black text-[8px] uppercase">
                            <span className="text-slate-500">{w.type} Unit</span>
                            <span className={w.available > 0 ? "text-emerald-600" : "text-rose-500"}>{w.available}/{w.total} Beds</span>
                          </div>
                          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full transition-all duration-1000 ${w.available > 0 ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${(w.available/w.total)*100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Departments & Equipment */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-3">Service Streams</p>
                      <div className="space-y-2">
                        {facilityDepts.slice(0, 5).map(d => (
                          <div key={d.id} className="p-2 bg-slate-50 rounded-lg flex items-center justify-between border border-slate-100/50">
                            <span className="text-[8px] font-black uppercase text-slate-700">{d.name}</span>
                            <span className="text-[7px] font-bold text-slate-400 uppercase italic">{d.specialty || 'General'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-3">Medical Equipment</p>
                      <div className="space-y-2">
                        {facilityEquipment.slice(0, 5).map(r => (
                          <div key={r.id} className="flex justify-between items-center p-2 bg-slate-50 rounded-lg border border-slate-100/50">
                            <span className="text-[8px] font-black text-slate-600 uppercase tracking-tight">{r.resource_type}</span>
                            <div className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-100 text-emerald-600 text-[7px] font-black">READY</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 3: DISPOSITION PROTOCOL (FORM) */}
          {view === "form" && (
            <div className="p-8 h-full flex flex-col animate-in zoom-in-95 duration-300">
              <button onClick={() => setView("details")} className="mb-4 text-[8px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">← Back to Capabilities</button>
              
              <form onSubmit={handleFinalize} className="bg-white flex-1 p-8 rounded-[2rem] border border-slate-200 shadow-xl overflow-visible flex flex-col justify-between">
                <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                  
                  {/* SEARCHABLE PATIENT REGISTRY */}
                  <div className="space-y-2 relative">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Admission Registry</label>
                    {!selectedPatient ? (
                      <div className="relative">
                        <input type="text" placeholder="Select Patient..." className="w-full bg-slate-50 p-3 rounded-xl font-bold text-[10px] outline-none border border-slate-100 focus:border-emerald-500"
                          value={patientSearch} onChange={(e) => { setPatientSearch(e.target.value); setIsPatientListOpen(true); }} onFocus={() => setIsPatientListOpen(true)} />
                        <AnimatePresence>
                          {isPatientListOpen && patientSearch.length > 0 && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl z-[1001] max-h-40 overflow-y-auto custom-scrollbar">
                              {patients.filter(p => `${p.first_name} ${p.last_name}`.toLowerCase().includes(patientSearch.toLowerCase())).map(p => (
                                <button key={p.id} type="button" className="w-full p-3 text-left hover:bg-slate-50 text-[10px] font-bold border-b border-slate-50 last:border-none" onClick={() => { setSelectedPatient(p); setIsPatientListOpen(false); setPatientSearch(""); }}>
                                  {p.last_name}, {p.first_name} <span className="text-[8px] text-slate-400 ml-1">[{p.medical_id}]</span>
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ) : (
                      <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex justify-between items-center">
                        <span className="text-[9px] font-black uppercase text-emerald-800">{selectedPatient.last_name}, {selectedPatient.first_name}</span>
                        <button type="button" onClick={() => setSelectedPatient(null)} className="text-[8px] font-black text-rose-500 underline uppercase">CHANGE</button>
                      </div>
                    )}
                  </div>

                  {/* SEARCHABLE OFFICER REGISTRY */}
                  <div className="space-y-2 relative">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Attending Officer Registry</label>
                    {!selectedStaff ? (
                      <div className="relative">
                        <input type="text" placeholder="Select Medical Staff..." className="w-full bg-slate-50 p-3 rounded-xl font-bold text-[10px] outline-none border border-slate-100 focus:border-emerald-500"
                          value={staffSearch} onChange={(e) => { setStaffSearch(e.target.value); setIsStaffListOpen(true); }} onFocus={() => setIsStaffListOpen(true)} />
                        <AnimatePresence>
                          {isStaffListOpen && staffSearch.length > 0 && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl z-[1001] max-h-40 overflow-y-auto custom-scrollbar">
                              {staff.filter(s => s.name.toLowerCase().includes(staffSearch.toLowerCase())).map(s => (
                                <button key={s.id} type="button" className="w-full p-3 text-left hover:bg-slate-50 text-[10px] font-bold border-b border-slate-50 last:border-none" onClick={() => { setSelectedStaff(s); setIsStaffListOpen(false); setStaffSearch(""); }}>
                                  {s.name} <span className="text-[8px] text-slate-400 ml-1 uppercase">[{s.role}]</span>
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ) : (
                      <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex justify-between items-center">
                        <span className="text-[9px] font-black uppercase text-blue-800">{selectedStaff.name}</span>
                        <button type="button" onClick={() => setSelectedStaff(null)} className="text-[8px] font-black text-rose-500 underline uppercase">Change</button>
                      </div>
                    )}
                  </div>

                  {/* LOGISTICS & DOCUMENTATION */}
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">EMS Dispatch Unit</label>
                    <select required className="w-full bg-slate-50 p-3 rounded-xl font-black text-[10px] border border-slate-100 outline-none" onChange={(e) => setFormData({...formData, ambulance_id: e.target.value})}>
                      <option value="">Choose Unit...</option>
                      {ambulances.map(a => <option key={a.id} value={a.id}>{a.plate_number}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Admission Slip (Encrypted)</label>
                    <div className="relative border border-slate-200 border-dashed rounded-xl p-3 h-[42px] flex items-center justify-center bg-slate-50/50">
                      <input type="file" required className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => setReferralFile(e.target.files[0])} />
                      <p className="text-[8px] font-black uppercase text-slate-400 truncate px-2">{referralFile ? referralFile.name : "Attach Clinical Record"}</p>
                    </div>
                  </div>

                  <div className="col-span-2 space-y-2">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Disposition Manifestation Brief</label>
                    <textarea required rows="2" placeholder="Clinical summary..." className="w-full bg-slate-50 p-4 rounded-xl font-bold text-[10px] border border-slate-100 outline-none resize-none focus:border-emerald-500"
                      onChange={(e) => setFormData({...formData, chief_complaint: e.target.value})} />
                  </div>
                </div>

                <button type="submit" disabled={loading} className="w-full bg-slate-900 text-white py-4 mt-6 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-emerald-600 transition-all disabled:opacity-50">
                  {loading ? "Synchronizing Hub Data..." : "Commit Disposition Protocol"}
                </button>
              </form>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default CreateReferralModal;