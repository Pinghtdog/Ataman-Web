import { useState, useEffect, useRef} from 'react';
import { Map, Marker } from "pigeon-maps";
import { supabase } from '../supabaseClient';

const DEFAULT_CENTER = [13.6218, 123.1948];

const AmbulanceIcon = ({ color = "#E11D48" }) => (
  <div style={{ transform: 'translate(-50%, -100%)' }} className="relative">
    {/* Subtle shadow pulse underneath */}
    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-6 h-2 bg-black/10 rounded-[100%] blur-sm animate-pulse" />
    
    <svg width="45" height="45" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Main Body */}
      <path 
        d="M3 16V8C3 6.89543 3.89543 6 5 6H15L20 10V16C20 17.1046 19.1046 18 18 18H5C3.89543 18 3 17.1046 3 16Z" 
        fill={color} 
      />
      
      {/* Windshield */}
      <path d="M15 7H16.5L19 10H15V7Z" fill="#CBD5E1" />
      
      {/* Medical Cross */}
      <path d="M9 10H11V12H13V14H11V16H9V14H7V12H9V10Z" fill="white" />
      
      {/* Wheels */}
      <circle cx="7" cy="18" r="2" fill="#1E293B" />
      <circle cx="16" cy="18" r="2" fill="#1E293B" />
      <circle cx="7" cy="18" r="0.8" fill="#94A3B8" />
      <circle cx="16" cy="18" r="0.8" fill="#94A3B8" />

      {/* Flashing Light Bar */}
      <rect x="8" y="5" width="4" height="1.5" rx="0.75" fill="#F87171" className="animate-pulse" />
    </svg>
  </div>
);

const ReferralModal = ({ referral: initialReferral, onClose, onUpdate, onDivert, isLog, calculateETA }) => {
  const [view, setView] = useState('details');
  const [leftPanelView, setLeftPanelView] = useState('map');
  const [referral, setReferral] = useState(initialReferral);
  const [serviceStream, setServiceStream] = useState(referral.service_stream || 'OUTPATIENT');
  
  // Initialization States
  const [facilityId, setFacilityId] = useState(null);    
  const [isSender, setIsSender] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Data States
  const [facilityData, setFacilityData] = useState(null);
  const [diagnostics, setDiagnostics] = useState([]);
  const [wardTypes, setWardTypes] = useState([]); 
  const [beds, setBeds] = useState([]);
  const [originHospital, setOriginHospital] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [ambulancePos, setAmbulancePos] = useState(null);
  const [selectedWard, setSelectedWard] = useState(
    // Plan A: If Diagnostic, get the ID from the join
    referral.resource_assignments?.[0]?.resource_id || 
    // Plan B: If Inpatient, get the Ward Type from the joined bed data
    referral.beds?.ward_type || 
    // Plan C: Empty default
    ''
  );
  const [selectedBed, setSelectedBed] = useState(referral.assigned_bed_id || '');

  useEffect(() => {
    setReferral(initialReferral);
    setIsLoading(true); 
    setView('details');
    setServiceStream(initialReferral.service_stream || 'OUTPATIENT');
  }, [initialReferral.id]);

  // 2. DATA INITIALIZATION
  useEffect(() => {
    const initializeData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: staffRecord } = await supabase
          .from('facility_staff')
          .select('facility_id')
          .eq('user_id', user.id)
          .single();

        if (!staffRecord) throw new Error("Staff record not found.");
        const fid = staffRecord.facility_id;
        setFacilityId(fid);

        // SET POV IMMEDIATELY BEFORE FETCHING OTHER DATA
        const isSenderPOV = initialReferral.origin_facility_id === fid;
        setIsSender(isSenderPOV);

        // FETCH ENRICHED DATA
        const { data: enrichedRef } = await supabase
          .from('referrals')
          .select(`
            id, patient_id, reference_number, chief_complaint, status, service_stream, referral_slip_url, assigned_bed_id, assigned_department_id,
            departments (id, name),
            users!inner (id, first_name, last_name, medical_id),
            ambulances (*),
            beds (id, bed_label, ward_type)
          `)
          .eq('id', initialReferral.id)
          .single();

        const pid = enrichedRef.patient_id || enrichedRef.users?.id;
        const originId = initialReferral?.origin_facility_id;

        const [assignmentsRes, facRes, diagRes, origRes, bedsRes, deptRes] = await Promise.all([
          supabase.from('resource_assignments').select('resource_id, facility_resources (resource_type, unit_label)').eq('user_id', pid),
          supabase.from('facilities').select('name, latitude, longitude').eq('id', fid).single(),
          supabase.from('facility_resources').select('*').eq('resource_category', 'equipment').eq('facility_id', fid),
          originId ? supabase.from('facilities').select('name, latitude, longitude').eq('id', originId).single() : Promise.resolve({ data: null }),
          supabase.from('beds').select('ward_type, status').eq('facility_id', fid),
          supabase.from('departments').select('id, name').eq('facility_id', fid)
        ]);

        const ambulanceRaw = Array.isArray(enrichedRef.ambulances) ? enrichedRef.ambulances[0] : enrichedRef.ambulances;
        const ambulanceData = ambulanceRaw ? {
          ...ambulanceRaw,
          latitude: Number(ambulanceRaw.latitude),
          longitude: Number(ambulanceRaw.longitude)
        } : null;

        setReferral({ ...enrichedRef, ambulances: ambulanceData, resource_assignments: assignmentsRes.data || [] });
        setFacilityData(facRes.data);
        setOriginHospital(origRes.data);
        setDepartments(deptRes.data || []);
        setDiagnostics(diagRes.data || []);

        if (ambulanceData?.latitude) {
          setAmbulancePos([ambulanceData.latitude, ambulanceData.longitude]);
          setMapCenter([ambulanceData.latitude, ambulanceData.longitude]);
        } else if (facRes.data?.latitude) {
          setMapCenter([Number(facRes.data.latitude), Number(facRes.data.longitude)]);
        }

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
        console.error("Critical Initialization Error:", err.message);
      } finally {
        // Delay slightly for a smoother transition
        setTimeout(() => setIsLoading(false), 300);
      }
    };

    initializeData();
  }, [initialReferral.id]);

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

useEffect(() => {
  const { latitude, longitude } = referral?.ambulances || {};
  if (latitude == null || longitude == null || !ambulancePos) return;

  const endLat = Number(latitude);
  const endLng = Number(longitude);
  const [startLat, startLng] = ambulancePos;

  if (Math.abs(startLat - endLat) < 0.00001) {
    setAmbulancePos([endLat, endLng]);
    setMapCenter([endLat, endLng]);
    return;
  }

  console.log(`Animation Starting: From [${startLat}, ${startLng}] To [${endLat}, ${endLng}]`);

  let frameId;
  let step = 0;
  const steps = 60; 

  const animate = () => {
    step++;
    const progress = step / steps;
    const easing = 1 - Math.pow(1 - progress, 3); 
    
    const curLat = startLat + (endLat - startLat) * easing;
    const curLng = startLng + (endLng - startLng) * easing;
    const nextPos = [curLat, curLng];
    
    setAmbulancePos(nextPos);
    setMapCenter(nextPos);

    if (step < steps) {
      frameId = requestAnimationFrame(animate);
    } else {
      console.log("Animation: Finished gliding.");
    }
  };

  frameId = requestAnimationFrame(animate);
  return () => cancelAnimationFrame(frameId);
}, [referral?.ambulances?.latitude, referral?.ambulances?.longitude]);

/* 
  useEffect(() => {
  if (!referral?.ambulances?.id || isLog || !facilityData) return;

  console.log("Demo: Simulation Started");
  const ambulanceId = referral.ambulances.id;
  const targetLat = Number(facilityData.latitude);
  const targetLng = Number(facilityData.longitude);

  let currentLat = Number(referral.ambulances.latitude);
  let currentLng = Number(referral.ambulances.longitude);

  const demoInterval = setInterval(async () => {
    const stepSize = 0.0005; 

    if (Math.abs(currentLat - targetLat) > 0.0001) currentLat += currentLat < targetLat ? stepSize : -stepSize;
    if (Math.abs(currentLng - targetLng) > 0.0001) currentLng += currentLng < targetLng ? stepSize : -stepSize;

    console.log(`Demo: Pushing new coords to Supabase -> [${currentLat}, ${currentLng}]`);

    const { error } = await supabase
      .from('ambulances')
      .update({ latitude: currentLat, longitude: currentLng, updated_at: new Date().toISOString() })
      .eq('id', ambulanceId);

    if (error) console.error("Demo: Supabase Update Error:", error.message);

    if (Math.abs(currentLat - targetLat) < 0.0005 && Math.abs(currentLng - targetLng) < 0.0005) {
      console.log("Demo: Destination Reached.");
      clearInterval(demoInterval);
    }
  }, 1500);

  return () => clearInterval(demoInterval);
}, [referral?.ambulances?.id, !!facilityData, isLog]);

*/

useEffect(() => {
  if (!referral?.ambulances?.id) return;

  const ambulanceId = referral.ambulances.id;
  console.log(`Realtime: Subscribing to ambulance-${ambulanceId}`);
  
  const channel = supabase
    .channel(`ambulance-tracking-${ambulanceId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'ambulances', filter: `id=eq.${ambulanceId}` },
      (payload) => {
        console.log("Realtime: Received Update from Supabase!", payload.new);
        const { latitude, longitude } = payload.new; 

        setReferral((prev) => ({
          ...prev,
          ambulances: { 
            ...prev.ambulances, 
            latitude: Number(latitude),
            longitude: Number(longitude)
          }
        }));
      }
    )
    .subscribe((status) => console.log("Realtime Status:", status));

  return () => { 
    console.log("Realtime: Unsubscribing.");
    supabase.removeChannel(channel); 
  };
}, [referral?.ambulances?.id]);

useEffect(() => {
  if (!referral?.id) return;
  const referralId = referral.id;

  const referralChannel = supabase
    .channel(`referral-status-${referralId}`)
    .on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'referrals', 
      filter: `id=eq.${referralId}` 
    }, async (payload) => {
      console.log("Realtime: Status Change Detected!", payload.new.status);
      
      // RE-FETCH the enriched data so we get the Department/Bed NAMES
      const { data: refreshedRef } = await supabase
        .from('referrals')
        .select(`
          id, reference_number, status, service_stream, chief_complaint, referral_slip_url, assigned_bed_id, assigned_department_id,
          departments (id, name),
          beds (id, bed_label, ward_type),
          users (id, first_name, last_name, medical_id),
          ambulances (*)
        `)
        .eq('id', referralId)
        .single();

      if (refreshedRef) {
        setReferral(refreshedRef);
      }
    })
    .subscribe();

  return () => supabase.removeChannel(referralChannel);
}, [referral?.id]);

const handleFinalize = async () => {
  setIsProcessing(true);
  try {
    const normalizedStream = serviceStream.toUpperCase();

    const targetPatientId = 
      referral?.patient_id || 
      referral?.users?.id || 
      initialReferral?.patient_id;

    if (!facilityId) throw new Error("Staff facility ID missing.");

    // --- 1. DIAGNOSTIC LOGIC ---
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

    // --- 2. INPATIENT LOGIC: Bed Assignment ---
    if (normalizedStream === 'INPATIENT' && selectedBed) {
      const { error: bedError } = await supabase
        .from('beds')
        .update({ status: 'occupied', patient_id: targetPatientId })
        .eq('id', selectedBed);
      
      if (bedError) throw bedError;
    }

    // --- 3. REFERRAL UPDATE ---
    // Note: We include assigned_department_id for both OUTPATIENT and DIAGNOSTIC streams
    const { error: refError } = await supabase
      .from('referrals')
      .update({
        status: 'ACCEPTED',
        service_stream: normalizedStream,
        assigned_bed_id: normalizedStream === 'INPATIENT' ? selectedBed : null,
        assigned_department_id: (normalizedStream === 'OUTPATIENT' || normalizedStream === 'DIAGNOSTIC') ? selectedWard : null,  
        destination_facility_id: facilityId 
      })
      .eq('id', referral.id);

    if (refError) throw refError;

    // --- 4. AMBULANCE RELEASE LOGIC ---
    // Setting the ambulance back to available
    if (referral.ambulances?.id) {
      console.log(`Releasing Ambulance: ${referral.ambulances.plate_number}`);
      const { error: ambError } = await supabase
        .from('ambulances')
        .update({ is_available: true })
        .eq('id', referral.ambulances.id);

      if (ambError) {
        console.error("Ambulance Release Error:", ambError.message);
      }
    }

    onUpdate();
    onClose();
  } catch (err) {
    console.error("[FINALIZATION ERROR]:", err.message);
    alert(`Finalization Failed: ${err.message}`);
  } finally {
    setIsProcessing(false);
  }
};

  const handleDivert = () => {
    if (!window.confirm("Initiate diversion? You will be redirected to select a new facility.")) return;

    if (onDivert) {
      onDivert({
        patient: referral.users,
        complaint: referral.chief_complaint,
        oldReferralId: referral.id 
      });
    }
    onClose();
  };

  const handleDownload = async () => {
    try {
      // SCENARIO 1: The Referral has an actual PDF URL from Supabase
      if (referral.referral_slip_url) {
        const fileName = `Referral_${referral.reference_number}.pdf`;
        const response = await fetch(referral.referral_slip_url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        return;
      }

      // SCENARIO 2: Fallback - No PDF found, generate a text summary
      console.warn("No PDF URL found. Generating text summary instead.");
      
      const content = `
        CLINICAL REFERRAL SLIP
        ----------------------
        Reference: ${referral.reference_number}
        Patient: ${referral.users?.first_name} ${referral.users?.last_name}
        Medical ID: ${referral.users?.medical_id}
        Chief Complaint: ${referral.chief_complaint}
        Status: ${referral.status}
        Stream: ${referral.service_stream || 'N/A'}
        Date: ${new Date().toLocaleString()}
      `.trim();

      const textBlob = new Blob([content], { type: 'text/plain' });
      const textUrl = URL.createObjectURL(textBlob);
      const textLink = document.createElement('a');
      
      textLink.href = textUrl;
      textLink.download = `Summary_${referral.reference_number}.txt`;
      textLink.click();
      
      URL.revokeObjectURL(textUrl);

    } catch (err) {
      console.error("Download failed:", err);
      alert("Could not download the file. Please check your connection.");
    }
  };

  return (
  <>
    {/* CLINICAL COMMAND DESIGN SYSTEM */}
    <style>
      {`
        @keyframes telemetry-pulse {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
          70% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
          100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }

        .clinical-skeleton {
          background: linear-gradient(90deg, #f1f5f9 25%, #f8fafc 50%, #f1f5f9 75%);
          background-size: 200% 100%;
          animation: shimmer-bg 2s infinite linear;
        }

        .precision-hud {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(15, 23, 42, 0.08);
          box-shadow: 0 12px 24px -10px rgba(0, 0, 0, 0.15);
        }

        .heartbeat-dot {
          animation: telemetry-pulse 2s infinite;
        }

        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #94a3b8;
          border-radius: 10px;
        }
      `}
    </style>

    <div className="fixed inset-0 bg-slate-950/45 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[1.5rem] max-w-5xl w-full flex overflow-hidden shadow-[0_50px_100px_-20px_rgba(15,23,42,0.3)] h-[580px] border border-slate-200 animate-in fade-in zoom-in duration-300">
        
        {/* LEFT PANEL: EMS LOGISTICS MAP */}
        <div className="w-[40%] relative bg-[#f1f5f9] border-r border-slate-100 overflow-hidden">
          <div className={`absolute inset-0 transition-opacity duration-500 ${leftPanelView === 'map' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <Map height={580} center={mapCenter} zoom={15}>
              {facilityData?.latitude && (
                <Marker width={25} anchor={[Number(facilityData.latitude), Number(facilityData.longitude)]} color="#0D9488" />
              )}
              {Array.isArray(ambulancePos) && (
                <Marker width={32} anchor={ambulancePos}>
                  <AmbulanceIcon color="#E11D48" />
                </Marker>
              )}
            </Map>

            {/* TELEMETRY HUD */}
            <div className="absolute bottom-4 left-4 right-4 precision-hud p-4 rounded-xl">
              <div className="flex justify-between items-end">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full heartbeat-dot" />
                    <p className="text-[7px] font-black text-emerald-600 uppercase tracking-[0.4em]">Active Inbound</p>
                  </div>
                  <h4 className="text-[12px] font-black text-slate-900 uppercase tracking-tight truncate max-w-[150px]">
                    {originHospital?.name || 'Referring Node'}
                  </h4>
                </div>
                <div className="text-right border-l border-slate-100 pl-4">
                  <p className="text-[18px] font-black text-slate-900 tabular-nums leading-none tracking-tighter">
                    {ambulancePos ? calculateETA(ambulancePos[0], ambulancePos[1]) : '--:--'}
                  </p>
                  <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-1">Est. Arrival Time</p>
                </div>
              </div>
            </div>
          </div>

          <div className={`absolute inset-0 bg-white transition-all duration-500 flex flex-col ${leftPanelView === 'attachment' ? 'opacity-100' : 'opacity-0 translate-y-4'}`}>
            <div className="p-3 bg-slate-50 border-b flex justify-between items-center">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] pl-2">Clinical Documentation</span>
              <button onClick={() => setLeftPanelView('map')} className="text-[8px] font-black text-slate-400 hover:text-rose-500 uppercase">Return to HUD</button>
            </div>
            <div className="flex-1 p-2">
              {referral.referral_slip_url ? (
                <iframe src={`${referral.referral_slip_url}#toolbar=0`} className="w-full h-full rounded-lg bg-slate-50 border border-slate-100" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[8px] font-black text-slate-300 uppercase">Pending Record</div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: CLINICAL OPERATIONS */}
        <div className="w-[60%] flex flex-col bg-white">
          <div className={`p-6 flex justify-between items-center transition-all ${
            isLoading ? 'bg-slate-50' : (isLog || isSender ? 'bg-white border-b border-slate-100' : 'bg-slate-900 text-white')
          }`}>
            {!isLoading ? (
              <>
                <div className="space-y-1">
                  <h2 className="text-lg font-black tracking-tighter uppercase italic leading-none">
                    {isSender ? 'Outbound Transfer' : isLog ? 'Clinical Audit' : 'Triage Disposition'}
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-bold tracking-[0.4em] text-slate-500 uppercase">Control ID: {referral.reference_number}</span>
                  </div>
                </div>
                <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-rose-50 hover:text-rose-500 text-slate-400 transition-all">✕</button>
              </>
            ) : <div className="h-10 w-full" />}
          </div>

          <div className="p-8 flex-1 overflow-y-auto space-y-6 custom-scrollbar">
            {isLoading ? (
              <div className="space-y-4">
                <div className="h-12 clinical-skeleton rounded-lg w-full" />
                <div className="h-24 clinical-skeleton rounded-lg w-full" />
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                
                {/* TACTICAL ASSETS */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <button onClick={() => setLeftPanelView('attachment')} className="group p-4 bg-slate-50 hover:bg-white rounded-xl border border-slate-100 hover:border-emerald-500 transition-all flex items-center gap-4">
                    <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center text-lg shadow-sm border border-slate-50 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">📄</div>
                    <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Medical Record</span>
                  </button>
                  <div className="p-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 flex items-center gap-4 opacity-40">
                    <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center text-lg">🧪</div>
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Imaging (N/A)</span>
                  </div>
                </div>

                {/* PATIENT PROFILE */}
                <div className="bg-[#f8fafc] border border-slate-200 p-6 rounded-2xl relative overflow-hidden mb-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-[7px] font-black text-emerald-600 uppercase tracking-[0.3em] mb-1">Subject Verification</p>
                      <h3 className="text-xl font-black text-slate-900 tracking-tighter uppercase leading-none">
                        {referral.users?.first_name} {referral.users?.last_name}
                      </h3>
                    </div>
                    <div className="text-[7px] font-black text-slate-400 bg-white px-2 py-1 rounded-md border border-slate-100 italic">MEDID: {referral.users?.medical_id}</div>
                  </div>
                  <div className="bg-white/80 p-3 rounded-xl border border-white shadow-sm">
                    <p className="text-[11px] font-medium text-slate-600 leading-relaxed italic">"{referral.chief_complaint}"</p>
                  </div>
                </div>

                {/* UPDATED SEMANTIC TIMELINE */}
                {(isLog || isSender) ? (
                  <div className="space-y-6">
                    {isSender && (
                      <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-[0.3em] mb-6 text-center">Transfer Lifecycle Tracking</p>
                        
                        <div className="flex justify-between items-center px-2 relative">
                          <div className="absolute h-[2px] bg-slate-200 left-10 right-10 top-[18px] -translate-y-1/2" />
                          <div 
                            className="absolute h-[2px] bg-emerald-500 left-10 transition-all duration-1000 top-[18px] -translate-y-1/2" 
                            style={{ width: referral.status === 'ACCEPTED' ? 'calc(100% - 80px)' : '0%' }} 
                          />

                          {[
                            { id: 1, label: 'INIT', desc: 'Initiated' },
                            { id: 2, label: 'PROC', desc: 'Processing' },
                            { id: 3, label: 'FIN', desc: 'Finalized' }
                          ].map((step) => {
                            const isCompleted = (step.id === 1) || (step.id === 2 && referral.status === 'ACCEPTED') || (step.id === 3 && referral.status === 'ACCEPTED');
                            const isCurrent = (step.id === 2 && referral.status === 'PENDING');

                            return (
                              <div key={step.id} className="z-10 flex flex-col items-center gap-2">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[8px] font-black transition-all duration-500 border-4 border-white shadow-sm ${
                                  isCompleted ? 'bg-emerald-500 text-white shadow-emerald-100 scale-110' : 
                                  isCurrent ? 'bg-amber-400 text-white shadow-amber-100 animate-pulse' : 'bg-slate-200 text-slate-400'
                                }`}>
                                  {isCompleted ? '✓' : step.label}
                                </div>
                                <span className={`text-[7px] font-black uppercase tracking-tighter ${isCompleted ? 'text-emerald-600' : 'text-slate-400'}`}>
                                  {step.desc}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between items-center p-4 bg-slate-900 rounded-xl border border-slate-800 shadow-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 heartbeat-dot" />
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em]">Live Disposition Status</span>
                      </div>
                      <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded bg-white/5 ${
                        referral.status === 'ACCEPTED' ? 'text-emerald-400' : 'text-amber-400'
                      }`}>
                        {referral.status}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {view === 'details' ? (
                      <div className="flex gap-2">
                        <button onClick={() => setView('accept')} className="flex-[3] bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-[0.3em] shadow-lg shadow-emerald-100 active:scale-95 transition-all">Accept Admission</button>
                        <button onClick={handleDivert} className="flex-1 bg-white border border-rose-200 text-rose-500 py-4 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-rose-50 transition-all">Divert</button>
                      </div>
                    ) : (
                      <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                        <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                          {['OUTPATIENT', 'INPATIENT'].map((s) => (
                            <button key={s} onClick={() => { setServiceStream(s); setSelectedWard(''); }}
                                    className={`flex-1 py-3 rounded-lg text-[9px] font-black uppercase transition-all ${serviceStream === s ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>{s}</button>
                          ))}
                        </div>
                        <div className="relative">
                          <select className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-[10px] font-black uppercase outline-none focus:border-emerald-500 appearance-none"
                                  value={selectedWard} onChange={(e) => setSelectedWard(e.target.value)}>
                            <option value="">Choose Admissions Unit...</option>
                            {serviceStream === 'INPATIENT' ? wardTypes.map((w, i) => (
                              <option key={i} value={w.type}>{w.type} Unit</option>
                            )) : departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 text-[8px]">▼</div>
                        </div>
                        <div className="flex gap-4 pt-4 items-center">
                          <button onClick={() => setView('details')} className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Back</button>
                          <button onClick={handleFinalize} disabled={isProcessing || !selectedWard}
                                  className="flex-1 bg-slate-900 text-white py-4 rounded-xl font-black text-[9px] uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all">
                            {isProcessing ? 'Saving Node Data...' : 'Confirm Disposition'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </>
);
};

export default ReferralModal;
