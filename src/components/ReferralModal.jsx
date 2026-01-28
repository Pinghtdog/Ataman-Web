import React, { useState, useEffect } from 'react';
import { Map, Marker } from "pigeon-maps";
import { supabase } from '../supabaseClient';

const HOSPITAL_LOCATION = [13.6218, 123.1948];

const ReferralModal = ({ referral: initialReferral, onClose, onUpdate, isLog, calculateETA }) => {
  const [view, setView] = useState('details');
  const [leftPanelView, setLeftPanelView] = useState('map');
  
  // Create a local state for referral to hold the enriched data (with IDs)
  const [referral, setReferral] = useState(initialReferral);
  
  const [serviceStream, setServiceStream] = useState(referral.service_stream || 'OUTPATIENT');
  const [selectedWard, setSelectedWard] = useState(referral.assigned_unit || '');
  const [selectedBed, setSelectedBed] = useState(referral.assigned_bed_id || '');

  const [facilityId, setFacilityId] = useState(null);
  const [facilityData, setFacilityData] = useState(null);
  const [diagnostics, setDiagnostics] = useState([]);
  const [wardTypes, setWardTypes] = useState([]); 
  const [beds, setBeds] = useState([]);
  const [originHospital, setOriginHospital] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * 1. CORE INITIALIZATION
   * Integrated the enriched select query here to fix the missing Patient ID issue.
   */
  useEffect(() => {
    const initializeData = async () => {
      setIsLoading(true);
      try {
        // A. Enrich the referral data with missing IDs
        const { data: enrichedRef, error: refError } = await supabase
          .from('referrals')
          .select(`
            *,
            patient_id,
            users (
              id,
              first_name,
              last_name,
              medical_id
            ),
            ambulances (*)
          `)
          .eq('id', initialReferral.id)
          .single();

        if (!refError && enrichedRef) {
          setReferral(enrichedRef);
        }

        // B. Identify Logged-in Staff
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("No authenticated user found");

        const { data: staffRecord } = await supabase
          .from('facility_staff')
          .select('facility_id')
          .eq('user_id', user.id)
          .single();

        if (!staffRecord) throw new Error("Staff not linked to a facility");
        const fid = staffRecord.facility_id;
        setFacilityId(fid);

        // C. Fetch Hospital Resources & Origin info
        const [facRes, diagRes, origRes, bedsRes] = await Promise.all([
          supabase.from('facilities').select('name').eq('id', fid).single(),
          supabase.from('facility_resources').select('*').eq('resource_category', 'equipment').eq('facility_id', fid),
          supabase.from('facilities').select('name').eq('id', initialReferral.origin_facility_id).single(),
          supabase.from('beds').select('ward_type, status').eq('facility_id', fid)
        ]);

        if (bedsRes.data) {
          const counts = bedsRes.data.reduce((acc, bed) => {
            const type = bed.ward_type || 'General Ward';
            if (!acc[type]) acc[type] = { type, available: 0 };
            if (bed.status === 'available') acc[type].available += 1;
            return acc;
          }, {});
          setWardTypes(Object.values(counts));
        }

        setFacilityData(facRes.data);
        setDiagnostics(diagRes.data || []);
        setOriginHospital(origRes.data);
      } catch (err) {
        console.error("Initialization Error:", err.message);
      } finally {
        setIsLoading(false);
      }
    };

    initializeData();
  }, [initialReferral.id, initialReferral.origin_facility_id]);

  /**
   * 2. FETCH WARD BEDS
   */
  useEffect(() => {
    if (serviceStream === 'INPATIENT' && selectedWard && facilityId) {
      const fetchAvailableBeds = async () => {
        const { data, error } = await supabase
          .from('beds')
          .select('id, bed_label')
          .eq('facility_id', facilityId)
          .eq('ward_type', selectedWard)
          .eq('status', 'available');

        if (!error) setBeds(data || []);
      };
      fetchAvailableBeds();
    } else {
      setBeds([]);
    }
  }, [selectedWard, serviceStream, facilityId]);

  /**
   * 3. FINALIZATION LOGIC
   */
  const handleFinalize = async () => {
    setIsProcessing(true);
    console.log("🚀 [FINALIZE START]");
    console.log("📊 SERVICE STREAM:", serviceStream);
    console.log("📍 SELECTED UNIT:", selectedWard);

    try {
      const normalizedStream = serviceStream.toUpperCase();
      const targetPatientId = referral.patient_id || referral.users?.id;

      if (!facilityId) {
        console.error("❌ ERROR: facilityId is null. Staff record might not be loaded.");
        throw new Error("Staff facility ID missing.");
      }

      // 1. DIAGNOSTIC LOGIC (The Name-to-ID Bridge)
      if (normalizedStream === 'DIAGNOSTIC' && selectedWard) {
        // Clean the string in case it contains extra status text
        const cleanResourceName = selectedWard.split(' — ')[0].trim();
        console.log(`🔍 [LOOKUP] Searching facility_resources for: "${cleanResourceName}" in Facility: ${facilityId}`);

        const { data: resource, error: lookupError } = await supabase
          .from('facility_resources')
          .select('id, current_occupied, total_capacity, resource_type')
          .eq('facility_id', facilityId)
          .ilike('resource_type', cleanResourceName) 
          .single();

        if (lookupError || !resource) {
          console.error("❌ [LOOKUP FAILED]:", lookupError?.message || "No record found");
          throw new Error(`Could not find a resource record named "${cleanResourceName}"`);
        }

        console.log("✅ [RESOURCE FOUND]:", resource);

        // Calculate new values
        const newOccupancy = (resource.current_occupied || 0) + 1;
        const newStatus = newOccupancy >= resource.total_capacity ? 'OFFLINE' : 'ONLINE';

        console.log(`📤 [UPDATING RESOURCE]: ID ${resource.id} | New Occupancy: ${newOccupancy} | New Status: ${newStatus}`);

        const { data: updatedRes, error: updateError } = await supabase
          .from('facility_resources')
          .update({
            current_occupied: newOccupancy,
            status: newStatus
          })
          .eq('id', resource.id)
          .select(); // Returns updated row for verification

        if (updateError) {
          console.error("❌ [UPDATE ERROR]:", updateError.message);
        } else if (updatedRes.length === 0) {
          console.warn("⚠️ [RLS WARNING]: Update successful but 0 rows changed. Check RLS policies!");
        } else {
          console.log("🎉 [UPDATE SUCCESS]:", updatedRes[0]);
        }
      }

      // 2. INPATIENT LOGIC (Bed Assignment)
      if (normalizedStream === 'INPATIENT' && selectedBed) {
        console.log(`🛏️ [UPDATING BED]: ID ${selectedBed} for Patient ${targetPatientId}`);
        const { error: bedError } = await supabase
          .from('beds')
          .update({ status: 'occupied', patient_id: targetPatientId })
          .eq('id', selectedBed);
        
        if (bedError) {
            console.error("❌ [BED UPDATE ERROR]:", bedError.message);
            throw bedError;
        }
        console.log("✅ [BED OCCUPIED SUCCESS]");
      }

      // 3. REFERRAL RECORD UPDATE
      console.log(`📝 [UPDATING REFERRAL]: ID ${referral.id}`);
      const { error: refError } = await supabase
        .from('referrals')
        .update({
          status: 'ACCEPTED',
          service_stream: normalizedStream,
          assigned_unit: selectedWard, 
          assigned_bed_id: normalizedStream === 'INPATIENT' ? selectedBed : null,
          destination_facility_id: facilityId 
        })
        .eq('id', referral.id);

      if (refError) {
        console.error("❌ [REFERRAL UPDATE ERROR]:", refError.message);
        throw refError;
      }

      console.log("🏁 [ALL TRANSACTIONS COMPLETE]");
      onUpdate();
      onClose();
    } catch (err) {
      console.error("💥 [CRITICAL FAILURE]:", err.message);
      alert(`Finalization Failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDivert = async () => {
    if (!window.confirm("Confirm patient diversion?")) return;
    setIsProcessing(true);
    try {
      const { error } = await supabase.from('referrals').update({ status: 'DIVERTED' }).eq('id', referral.id);
      if (error) throw error;
      onUpdate();
      onClose();
    } catch (err) {
      alert(`Diversion Failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    const content = `Referral Slip: ${referral.reference_number}\nPatient: ${referral.users?.first_name} ${referral.users?.last_name}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Referral_${referral.reference_number}.txt`;
    link.click();
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-100">
        <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Syncing Clinical Data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-md p-4">
      <div className="bg-white rounded-[2.5rem] max-w-6xl w-full flex overflow-hidden shadow-2xl h-[650px] border border-slate-200 animate-in fade-in zoom-in duration-200">
        
        {/* LEFT PANEL: MAP / DOCUMENTS */}
        <div className="w-[45%] relative bg-slate-50 border-r border-slate-100 overflow-hidden">
          <div className={`absolute inset-0 transition-all duration-500 ${leftPanelView === 'map' ? 'opacity-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
            <Map height={650} center={HOSPITAL_LOCATION} defaultZoom={14}>
              <Marker width={35} anchor={HOSPITAL_LOCATION} color="#0D9488" />
              {referral.ambulances?.latitude && (
                <Marker width={40} anchor={[referral.ambulances.latitude, referral.ambulances.longitude]} color="#E11D48" />
              )}
            </Map>
            <div className="absolute bottom-6 left-6 right-6 bg-white/95 p-5 rounded-[2rem] shadow-xl border border-slate-100 backdrop-blur-md">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Live Transit Status</p>
              <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">{originHospital?.name || 'Referring Facility'}</h4>
              <p className="text-[10px] text-primary font-black mt-1 uppercase tracking-tighter italic">ETA: {calculateETA(referral.ambulances?.latitude, referral.ambulances?.longitude)}</p>
            </div>
          </div>

          <div className={`absolute inset-0 bg-slate-100 transition-all duration-500 flex flex-col ${leftPanelView === 'attachment' ? 'opacity-100' : 'opacity-0 translate-y-full'}`}>
            <div className="p-4 bg-white border-b flex justify-between items-center shadow-sm">
              <span className="text-[10px] font-black uppercase text-slate-500 italic tracking-widest">Referral_Slip_Digital.pdf</span>
              <div className="flex gap-2">
                <button onClick={handleDownload} className="bg-primary/10 text-primary px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight hover:bg-primary/20 transition">Download</button>
                <button onClick={() => setLeftPanelView('map')} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">Close File</button>
              </div>
            </div>
            <div className="flex-1 p-8 flex justify-center bg-slate-200/50">
              <div className="w-full bg-white shadow-xl p-10 min-h-[500px] rounded-[1.5rem] flex flex-col items-center">
                <div className="w-full border-b-2 border-slate-800 pb-4 mb-8 text-center font-serif text-xl font-black uppercase italic tracking-tighter">Clinical Referral Slip</div>
                <div className="w-full space-y-4 opacity-30">
                  <div className="h-4 bg-slate-200 w-3/4 rounded-full"></div>
                  <div className="h-4 bg-slate-200 w-full rounded-full"></div>
                  <div className="h-24 bg-slate-50 w-full rounded-xl border-2 border-dashed border-slate-100 flex items-center justify-center font-black text-[10px] uppercase tracking-widest italic">Vitals & Case History</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: ACTIONS */}
        <div className="w-[55%] flex flex-col bg-white">
  <div className={`p-6 flex justify-between items-center transition-all duration-500 ${
    isLog 
      ? 'bg-slate-50 border-b border-slate-100' // Audit mode: light & clean
      : 'bg-gradient-to-r from-emerald-500 to-teal-600' // Active mode: vibrant medical green
  } ${isLog ? 'text-slate-800' : 'text-white'}`}>
    
    <div>
      <div className="flex items-center gap-2 mb-1">
        {isLog && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
        <h2 className="text-lg font-black tracking-tight uppercase italic leading-none">
          {isLog ? 'Clinical Audit' : 'Case Disposition'}
        </h2>
      </div>
      <p className={`text-[9px] font-black tracking-[0.2em] uppercase leading-none ${
        isLog ? 'text-slate-400' : 'opacity-70'
      }`}>
        REF: {referral.reference_number}
      </p>
    </div>

    <button 
      onClick={onClose} 
      className={`w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90 ${
        isLog 
          ? 'bg-slate-200/50 text-slate-400 hover:bg-slate-200 hover:text-slate-600' 
          : 'bg-white/10 text-white hover:bg-white/20'
      }`}
    >
      ✕
    </button>
  </div>

          <div className="p-8 flex-1 overflow-y-auto space-y-8 custom-scrollbar">
            <div className="flex gap-3">
              <button onClick={() => setLeftPanelView('attachment')} className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-[1.5rem] flex items-center gap-4 hover:border-primary transition group">
                <span className="text-2xl group-hover:scale-110 transition-transform">📄</span>
                <p className="text-[10px] font-black text-slate-700 uppercase leading-none">View Clinical PDF</p>
              </button>
              <div className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-[1.5rem] flex items-center gap-4 opacity-40 grayscale cursor-not-allowed">
                <span className="text-2xl">🖼️</span>
                <p className="text-[10px] font-black text-slate-700 uppercase leading-none tracking-tight">Imaging (N/A)</p>
              </div>
            </div>

            <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 shadow-inner">
               <p className="text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest leading-none">Patient Case Details</p>
               <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">{referral.users?.first_name} {referral.users?.last_name}</h3>
               <p className="text-xs italic text-slate-600 mt-2 leading-relaxed font-medium">"{referral.chief_complaint}"</p>
            </div>

            <div className="pt-4 border-t border-slate-100">
              {isLog ? (
                <div className="space-y-4 animate-in fade-in duration-500">
  <div className="p-8 bg-slate-50 text-slate-700 rounded-[2.5rem] text-[11px] leading-relaxed border-l-[10px] border-emerald-500 shadow-sm shadow-slate-200/50">
    <div className="flex items-center gap-3 mb-6">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      <p className="uppercase text-[10px] font-black text-slate-400 tracking-[0.25em]">Clinical Decision Archive</p>
    </div>
    
    <div className="space-y-4">
      {/* Disposition Row */}
      <div className="flex justify-between items-center border-b border-slate-200/60 pb-3 uppercase">
        <span className="text-slate-400 tracking-widest font-black">Disposition</span> 
        <b className="text-emerald-600 font-black text-xs tracking-tight">{referral.status}</b>
      </div>

      {/* Stream Row */}
      <div className="flex justify-between items-center border-b border-slate-200/60 pb-3 uppercase">
        <span className="text-slate-400 tracking-widest font-black">Service Stream</span> 
        <b className="text-slate-800 font-black text-xs tracking-tight">{referral.service_stream || "N/A"}</b>
      </div>

      {/* Unit Row */}
      <div className="flex justify-between items-center border-b border-slate-200/60 pb-3 uppercase">
        <span className="text-slate-400 tracking-widest font-black">Assigned Unit</span> 
        <b className="text-slate-800 font-black text-xs tracking-tight">{referral.assigned_unit || "N/A"}</b>
      </div>

      {/* Conditional Bed Row */}
      {referral.assigned_bed_id && (
        <div className="flex justify-between items-center pt-2 uppercase">
          <span className="text-slate-400 tracking-widest font-black italic">Allocated Bed Record</span> 
          <b className="text-primary font-black text-xs tracking-[0.15em]">BED #{referral.assigned_bed_id}</b>
        </div>
      )}
    </div>
  </div>
</div>
              ) : (
                <div className="space-y-6">
                  {view === 'details' ? (
                    <div className="flex gap-4">
                      <button onClick={() => setView('accept')} className="flex-1 bg-primary text-white py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all">Accept Case</button>
                      <button onClick={handleDivert} className="flex-1 border-2 border-red-200 text-red-400 py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-widest hover:bg-red-50 hover:border-red-400 transition-all">Divert Patient</button>
                    </div>
                  ) : (
                    <div className="space-y-5 animate-in slide-in-from-bottom-2 duration-300">
                      <div className="grid grid-cols-3 gap-2">
                        {['OUTPATIENT', 'DIAGNOSTIC', 'INPATIENT'].map(s => (
                          <button key={s} onClick={() => { setServiceStream(s); setSelectedWard(''); setSelectedBed(''); }} className={`py-3 rounded-xl text-[9px] font-black uppercase border-2 transition-all ${serviceStream === s ? 'border-primary bg-primary/5 text-primary' : 'border-slate-100 text-slate-300 hover:border-slate-200'}`}>{s}</button>
                        ))}
                      </div>

                      <select 
                        className="w-full border-2 border-slate-100 rounded-[1.5rem] p-5 font-black text-xs bg-slate-50 focus:border-primary transition-all outline-none cursor-pointer" 
                        value={selectedWard} 
                        onChange={(e) => {
                          console.log("DROPDOWN SELECTED:", e.target.value); // CHECKPOINT 1
                          setSelectedWard(e.target.value);
                        }}
                      >
                        <option value="">
                          {serviceStream === 'INPATIENT' ? 'Select Relational Ward...' : 'Select Target Unit...'}
                        </option>
                        
                        {serviceStream === 'INPATIENT' ? (
                            wardTypes.map((w, i) => (
                              <option key={i} value={w.type} disabled={w.available === 0}>
                                {w.type.toUpperCase()} — {w.available} AVAILABLE BEDS
                              </option>
                            ))
                          ) : serviceStream === 'DIAGNOSTIC' ? (
                              diagnostics.map((d) => {
                                const availableCount = d.total_capacity - (d.current_occupied || 0);
                                const isFull = availableCount <= 0;
                                
                                return (
                                  <option key={d.id} value={d.resource_type} disabled={isFull}>
                                    {d.resource_type.toUpperCase()} — {availableCount} UNITS ONLINE 
                                    {isFull ? ' (BUSY)' : ''}
                                  </option>
                                );
                              })
                          ) : (
                            <option value="General OPD">GENERAL OPD CLINIC</option>
                          )}
                      </select>

                      {serviceStream === 'INPATIENT' && selectedWard && (
                        <div className="space-y-3">
                            <p className="text-[9px] font-black text-slate-400 uppercase text-center tracking-[0.3em]">Physical Bed Allocation</p>
                            <div className="grid grid-cols-5 gap-2 border-t border-slate-50 pt-4 max-h-[140px] overflow-y-auto p-2 custom-scrollbar">
                                {beds.map((b) => (
                                    <button key={b.id} onClick={() => setSelectedBed(b.id)} className={`py-3 rounded-xl text-[10px] font-black border-2 transition-all ${selectedBed === b.id ? 'bg-primary border-primary text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400 hover:border-primary/30'}`}>
                                        {b.bed_label || `#${b.id}`}
                                    </button>
                                ))}
                            </div>
                        </div>
                      )}

                      <div className="flex gap-3 pt-2">
                        <button onClick={() => setView('details')} className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-[1.5rem] font-black text-[10px] uppercase">Back</button>
                        <button onClick={handleFinalize} disabled={isProcessing || !selectedWard || (serviceStream === 'INPATIENT' && !selectedBed)} className="flex-[2] bg-primary text-white py-4 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20 disabled:opacity-30">
                          {isProcessing ? 'SYNCHRONIZING...' : 'FINALIZE & COMMIT'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReferralModal;
