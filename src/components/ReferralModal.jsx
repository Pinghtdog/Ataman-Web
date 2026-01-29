import React, { useState, useEffect } from 'react';
import { Map, Marker } from "pigeon-maps";
import { supabase } from '../supabaseClient';

const HOSPITAL_LOCATION = [13.6218, 123.1948];

const ReferralModal = ({ referral: initialReferral, onClose, onUpdate, isLog, calculateETA }) => {
  const [view, setView] = useState('details');
  const [leftPanelView, setLeftPanelView] = useState('map');
  const [referral, setReferral] = useState(initialReferral);
  const [serviceStream, setServiceStream] = useState(referral.service_stream || 'OUTPATIENT');
  const [selectedWard, setSelectedWard] = useState(
    // Plan A: If Diagnostic, get the ID from the join
    referral.resource_assignments?.[0]?.resource_id || 
    // Plan B: If Inpatient, get the Ward Type from the joined bed data
    referral.beds?.ward_type || 
    // Plan C: Empty default
    ''
  );
  const [selectedBed, setSelectedBed] = useState(referral.assigned_bed_id || '');
  const [facilityId, setFacilityId] = useState(null);     
  const [facilityData, setFacilityData] = useState(null);
  const [diagnostics, setDiagnostics] = useState([]);
  const [wardTypes, setWardTypes] = useState([]); 
  const [beds, setBeds] = useState([]);
  const [originHospital, setOriginHospital] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    const initializeData = async () => {
      setIsLoading(true);
      try {
        const { data: enrichedRef, error: refError } = await supabase
          .from('referrals')
          .select(`
            id,
            patient_id,
            reference_number,
            chief_complaint,
            destination_facility_id,
            origin_facility_id,
            status,
            users!inner (
              id, 
              first_name, 
              last_name, 
              medical_id
            ),
            ambulances (*),
            beds (
              id,
              bed_label,
              ward_type
            ),
            resource_assignments (
              resource_id,
              facility_resources (
                resource_type,
                unit_label
              )
            )
          `)
          .eq('id', initialReferral.id)
          .single();

        if (!refError && enrichedRef) setReferral(enrichedRef);

        const { data: { user } } = await supabase.auth.getUser();
        const { data: staffRecord } = await supabase
          .from('facility_staff')
          .select('facility_id')
          .eq('user_id', user.id)
          .single();

        const fid = staffRecord.facility_id;
        setFacilityId(fid);

        // FETCH ALL DATA AT ONCE
        const [facRes, diagRes, origRes, bedsRes, deptRes] = await Promise.all([
          supabase.from('facilities').select('name').eq('id', fid).single(),
          supabase.from('facility_resources').select('*').eq('resource_category', 'equipment').eq('facility_id', fid),
          supabase.from('facilities').select('name').eq('id', initialReferral.origin_facility_id).single(),
          supabase.from('beds').select('ward_type, status').eq('facility_id', fid),
          supabase.from('departments').select('id, name').eq('facility_id', fid)
        ]);

        // UPDATE STATES
        setDepartments(deptRes.data || []); // FIXED: Moved inside try block
        setFacilityData(facRes.data);
        setDiagnostics(diagRes.data || []);
        setOriginHospital(origRes.data);

        if (bedsRes.data) {
          const counts = bedsRes.data.reduce((acc, bed) => {
            const type = bed.ward_type || 'General Ward';
            if (!acc[type]) acc[type] = { type, available: 0 };
            if (bed.status === 'available') acc[type].available += 1;
            return acc;
          }, {});
          setWardTypes(Object.values(counts));
        }
      } catch (err) {
        console.error("Initialization Error:", err.message);
      } finally {
        setIsLoading(false);
      }
    };
    initializeData();
  }, [initialReferral.id, initialReferral.origin_facility_id]);

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

const handleFinalize = async () => {
  setIsProcessing(true);

  console.log("Full Referral Object:", referral);
  console.log("Initial Referral Prop:", initialReferral);
  try {
    const normalizedStream = serviceStream.toUpperCase();

    // Priority: 1. Main patient_id, 2. Joined User ID, 3. The initial prop ID
const targetPatientId = 
  referral?.patient_id ||              // Direct column
  referral?.users?.id ||               // Joined object (standard for .single())
  referral?.users?.[0]?.id ||          // Joined array (fallback)
  initialReferral?.patient_id;         // Prop fallback
    console.log("Resolved Patient ID:", targetPatientId);

      if (!targetPatientId) {
        console.error("❌ ID RESOLUTION FAILED. Check the console logs above.");
        throw new Error("Critical Failure: Patient ID could not be resolved.");
      }

    if (!facilityId) throw new Error("Staff facility ID missing.");

    // 1. DIAGNOSTIC LOGIC
    if (normalizedStream === 'DIAGNOSTIC' && selectedWard) {
      const { error: assignError } = await supabase
        .from('resource_assignments')
        .insert({
          resource_id: selectedWard, 
          user_id: targetPatientId,
          facility_id: facilityId,
          assigned_at: new Date().toISOString()
        });

      if (assignError) throw assignError;
    }

      // 2. INPATIENT LOGIC: Bed Assignment
      if (normalizedStream === 'INPATIENT' && selectedBed) {
        await supabase
          .from('beds')
          .update({ status: 'occupied', patient_id: targetPatientId })
          .eq('id', selectedBed);
      }

      // 3. REFERRAL UPDATE
      await supabase
        .from('referrals')
        .update({
          status: 'ACCEPTED',
          service_stream: normalizedStream,
          assigned_bed_id: normalizedStream === 'INPATIENT' ? selectedBed : null,
          destination_facility_id: facilityId 
        })
        .eq('id', referral.id);

      onUpdate();
      onClose();
    } catch (err) {
      console.error("[FINALIZATION ERROR]:", err.message);
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
        {/* DYNAMIC HEADER */}
        <div className={`p-6 flex justify-between items-center transition-all duration-500 ${
          isLog 
            ? 'bg-slate-50 border-b border-slate-100' 
            : 'bg-gradient-to-r from-emerald-500 to-teal-600 shadow-lg' 
        } ${isLog ? 'text-slate-800' : 'text-white'}`}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              {!isLog && <span className="w-2 h-2 bg-white rounded-full animate-pulse shadow-sm" />}
              <h2 className="text-lg font-black tracking-tight uppercase italic leading-none">
                {isLog ? 'Clinical Audit' : 'Case Disposition'}
              </h2>
            </div>
            <p className={`text-[9px] font-black tracking-[0.2em] uppercase leading-none ${
              isLog ? 'text-slate-400' : 'opacity-70'
            }`}>
              {referral.reference_number}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90 shadow-sm ${
              isLog 
                ? 'bg-slate-200/50 text-slate-400 hover:bg-slate-200 hover:text-slate-600' 
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            ✕
          </button>
        </div>

        <div className="p-8 flex-1 overflow-y-auto space-y-8 custom-scrollbar">
          {/* TACTICAL ATTACHMENT BUTTONS */}
          <div className="flex gap-3">
            <button onClick={() => setLeftPanelView('attachment')} className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-[1.5rem] flex items-center gap-4 hover:border-emerald-500 transition-all group shadow-sm">
              <span className="text-2xl group-hover:scale-110 transition-transform">📄</span>
              <div className="text-left">
                 <p className="text-[10px] font-black text-slate-700 uppercase leading-none mb-1">View Clinical PDF</p>
                 <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Verified Documentation</p>
              </div>
            </button>
            <div className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-[1.5rem] flex items-center gap-4 opacity-40 grayscale cursor-not-allowed">
              <span className="text-2xl">🖼️</span>
              <p className="text-[10px] font-black text-slate-700 uppercase leading-none tracking-tight">Imaging (N/A)</p>
            </div>
          </div>

          {/* PATIENT BRIEFING CARD */}
          <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 shadow-inner relative overflow-hidden">
             <p className="text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest leading-none">Patient Case Details</p>
             <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">{referral.users?.first_name} {referral.users?.last_name}</h3>
             <p className="text-xs italic text-slate-600 mt-2 leading-relaxed font-medium">"{referral.chief_complaint}"</p>
          </div>

          {/* MAIN VIEW LOGIC */}
{isLog ? (
  // AUDIT VIEW LOGIC
  <div className="space-y-4 animate-in fade-in duration-500">
    <div className="p-8 bg-white text-slate-700 rounded-[2.5rem] text-[11px] leading-relaxed border border-slate-100 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <p className="uppercase text-[10px] font-black text-slate-400 tracking-[0.25em]">
          Clinical Decision Archive
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3 uppercase">
          <span className="text-slate-400 tracking-widest font-black text-[9px]">Disposition</span>
          <b className="text-emerald-600 font-black text-xs tracking-tight bg-emerald-50 px-3 py-1 rounded-lg">
            {referral.status}
          </b>
        </div>

        <div className="flex justify-between items-center border-b border-slate-100 pb-3 uppercase">
          <span className="text-slate-400 tracking-widest font-black text-[9px]">Service Stream</span>
          <b className="text-slate-800 font-black text-xs tracking-tight">
            {referral.service_stream || "N/A"}
          </b>
        </div>

        <div className="flex justify-between items-center border-b border-slate-100 pb-3 uppercase">
          <span className="text-slate-400 tracking-widest font-black text-[9px]">Assigned Unit</span>
          <b className="text-slate-800 font-black text-xs tracking-tight">
          {/* 1. Check if assigned to Equipment (Diagnostic) */}
          {referral.resource_assignments?.length > 0 ? (
            `${referral.resource_assignments[0].facility_resources.resource_type} [${referral.resource_assignments[0].facility_resources.unit_label}]`
          ) :
          /* 2. Check if assigned to a Bed (Inpatient) */
          referral.beds ? (
          `${referral.beds.ward_type} — ${referral.beds.bed_label}`) 
          : "Not Assigned"}
        </b>
        </div>
      </div>
    </div>
  </div>
) : (
  // DISPOSITION SELECTOR
  <div className="space-y-6">
    {view === 'details' ? (
      <div className="flex gap-4">
        <button
          onClick={() => setView('accept')}
          className="flex-1 bg-emerald-600 text-white py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-200 hover:scale-[1.02] active:scale-95 transition-all"
        >
          Accept Case
        </button>
        <button
          onClick={handleDivert}
          className="flex-1 border-2 border-rose-200 text-rose-500 py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 hover:border-rose-400 transition-all"
        >
          Divert Patient
        </button>
      </div>
    ) : (
      <div className="space-y-5 animate-in slide-in-from-bottom-2 duration-300">
        {/* STREAM TOGGLE */}
        <div className="grid grid-cols-3 gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
          {['OUTPATIENT', 'DIAGNOSTIC', 'INPATIENT'].map((s) => (
            <button
              key={s}
              onClick={() => { setServiceStream(s); setSelectedWard(''); setSelectedBed(''); }}
              className={`py-3 rounded-xl text-[9px] font-black uppercase transition-all ${
                serviceStream === s
                  ? 'bg-white text-emerald-600 shadow-sm border border-slate-200 scale-100'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* TARGET UNIT SELECTOR */}
        <div className="relative group">
          <select
            className="w-full border-2 border-slate-100 rounded-[1.5rem] p-5 font-black text-xs bg-slate-50 focus:border-emerald-500 focus:bg-white transition-all outline-none cursor-pointer appearance-none shadow-sm"
            value={selectedWard}
            onChange={(e) => setSelectedWard(e.target.value)}
          >
            <option value="">
              {serviceStream === 'INPATIENT'
                ? 'Select Relational Ward...'
                : 'Select Target Unit...'}
            </option>
            {serviceStream === 'INPATIENT'
              ? wardTypes.map((w, i) => (
                  <option key={i} value={w.type} disabled={w.available === 0}>
                    {w.type.toUpperCase()} — {w.available} AVAILABLE BEDS
                  </option>
                ))
              : serviceStream === 'DIAGNOSTIC'
              ? diagnostics.map((d) => {
                  const availableCount = d.total_capacity - (d.current_occupied || 0);
                  const isFull = availableCount <= 0 || d.status !== 'ONLINE';
                  return (
                    <option key={d.id} value={d.id} disabled={isFull}>
                      {d.resource_type.toUpperCase()} [{d.unit_label || 'A'}] — {isFull ? 'UNAVAILABLE' : 'READY'}
                    </option>
                  );
                })
              : ( departments.map((dept) => (
                <option key={dept.id} value={dept.name}>
                  {dept.name.toUpperCase()} DEPARTMENT
                </option>
              ))
            )}
          </select>
          <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300 group-hover:text-emerald-500 transition-colors font-black">
            ▼
          </div>
        </div>

        {/* BED GRID (Only for Inpatient) */}
        {serviceStream === 'INPATIENT' && selectedWard && (
          <div className="space-y-3 animate-in fade-in zoom-in duration-300">
            <p className="text-[9px] font-black text-slate-400 uppercase text-center tracking-[0.3em]">Physical Bed Allocation</p>
            <div className="grid grid-cols-5 gap-2 border-t border-slate-50 pt-4 max-h-[140px] overflow-y-auto p-2 custom-scrollbar bg-slate-50 rounded-2xl">
              {beds.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelectedBed(b.id)}
                  className={`py-3 rounded-xl text-[10px] font-black border-2 transition-all ${
                    selectedBed === b.id
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg scale-105'
                      : 'bg-white border-slate-100 text-slate-400 hover:border-emerald-300 hover:text-emerald-600'
                  }`}
                >
                  {b.bed_label || `#${b.id}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ACTION FOOTER */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => setView('details')}
            className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-[1.5rem] font-black text-[10px] uppercase hover:bg-slate-200 transition-all"
          >
            Back
          </button>
          <button
            onClick={handleFinalize}
            disabled={isProcessing || !selectedWard || (serviceStream === 'INPATIENT' && !selectedBed)}
            className="flex-[2] bg-emerald-600 text-white py-4 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-200 disabled:opacity-30 disabled:shadow-none hover:shadow-emerald-400 active:scale-95 transition-all"
          >
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
);
}          
export default ReferralModal;
