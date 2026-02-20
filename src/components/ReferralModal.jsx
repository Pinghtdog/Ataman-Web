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
    const isDiagnostic = normalizedStream === 'DIAGNOSTIC';
    const isInpatient = normalizedStream === 'INPATIENT';
    const isOutpatient = normalizedStream === 'OUTPATIENT';

    // Resolve Patient ID safely
    const targetPatientId = 
      referral?.patient_id || 
      referral?.users?.id || 
      initialReferral?.patient_id;

    if (!targetPatientId) throw new Error("Could not resolve Patient ID for assignment.");
    if (!facilityId) throw new Error("Staff facility ID missing.");

    // --- 1. DIAGNOSTIC LOGIC ---
    if (isDiagnostic && selectedWard) {
      // Step A: Create the assignment record
      const { error: assignError } = await supabase
        .from('resource_assignments')
        .insert({
          resource_id: selectedWard, // UUID
          user_id: targetPatientId,
          facility_id: facilityId,
          assigned_at: new Date().toISOString()
        });

      if (assignError) throw assignError;
    }

    // --- 2. INPATIENT LOGIC ---
    if (isInpatient && selectedBed) {
      const { error: bedError } = await supabase
        .from('beds')
        .update({ status: 'occupied', patient_id: targetPatientId })
        .eq('id', selectedBed); // BigInt
      
      if (bedError) throw bedError;
    }

    // --- 3. REFERRAL UPDATE (The Data Type Fix) ---
    // We strictly separate UUID (assigned_resource_id) from BigInt (assigned_department_id)
    const { error: refError } = await supabase
      .from('referrals')
      .update({
        status: 'ACCEPTED',
        service_stream: normalizedStream,
        destination_facility_id: facilityId,
        // TYPE FIX HERE:
        assigned_bed_id: isInpatient ? parseInt(selectedBed) : null,
        assigned_department_id: (isInpatient || isOutpatient) ? parseInt(selectedWard) : null,
        assigned_resource_id: isDiagnostic ? selectedWard : null // The new UUID column
      })
      .eq('id', referral.id);

    if (refError) throw refError;

    // --- 4. AMBULANCE RELEASE LOGIC ---
    const ambulanceId = referral.ambulances?.id || referral.ambulance_id;
    if (ambulanceId) {
      const { error: ambError } = await supabase
        .from('ambulances')
        .update({ 
          is_available: true,
          latitude: facilityData.latitutde,
          longitude: facilityData.longitude,
          updated_at: new Date().toISOString()
        })
        .eq('id', ambulanceId);

      if (ambError) console.error("Ambulance Release Error:", ambError.message);
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

          @keyframes shimmer-bg {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }

          .clinical-skeleton {
            background: linear-gradient(90deg, #f1f5f9 25%, #f8fafc 50%, #f1f5f9 75%);
            background-size: 200% 100%;
            animation: shimmer-bg 2s infinite linear;
          }

          .precision-hud {
            background: rgba(255, 255, 255, 0.90);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(15, 23, 42, 0.08);
            box-shadow: 0 12px 24px -10px rgba(0, 0, 0, 0.15);
          }

          .heartbeat-dot {
            animation: telemetry-pulse 2s infinite;
          }

          .custom-scrollbar::-webkit-scrollbar { width: 4px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
          
          /* Prevent layout shift on select */
          select { text-overflow: ellipsis; }
        `}
      </style>

      <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center z-50 backdrop-blur-md p-4 transition-all">
        <div className="bg-white rounded-[1.5rem] max-w-5xl w-full flex overflow-hidden shadow-[0_50px_100px_-20px_rgba(15,23,42,0.5)] h-[620px] border border-slate-200 animate-in fade-in zoom-in duration-300">
          
          {/* LEFT PANEL: EMS LOGISTICS / DOCUMENTATION */}
          <div className="w-[42%] relative bg-slate-100 border-r border-slate-200 overflow-hidden">
            {/* VIEW 1: MAP HUD */}
            <div className={`absolute inset-0 transition-all duration-500 ease-in-out ${leftPanelView === 'map' ? 'opacity-100 scale-100' : 'opacity-0 scale-105 pointer-events-none'}`}>
              <Map height={620} center={mapCenter} zoom={15}>
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
              <div className="absolute bottom-6 left-6 right-6 precision-hud p-5 rounded-2xl border border-white/50">
                <div className="flex justify-between items-end">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full heartbeat-dot" />
                      <p className="text-[8px] font-black text-emerald-600 uppercase tracking-[0.3em]">Telemetry Active</p>
                    </div>
                    <h4 className="text-[13px] font-black text-slate-900 uppercase tracking-tight truncate max-w-[180px]">
                      {originHospital?.name || 'External Facility'}
                    </h4>
                  </div>
                  <div className="text-right border-l border-slate-200 pl-5">
                    <p className="text-[22px] font-black text-slate-900 tabular-nums leading-none tracking-tighter">
                      {ambulancePos ? calculateETA(ambulancePos[0], ambulancePos[1]) : 'TBD'}
                    </p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Est. Arrival</p>
                  </div>
                </div>
              </div>
            </div>

            {/* VIEW 2: DOCUMENTATION IFRAME */}
            <div className={`absolute inset-0 bg-white transition-all duration-500 ease-in-out flex flex-col ${leftPanelView === 'attachment' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}`}>
              <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Clinical Record</span>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* NEW DOWNLOAD BUTTON */}
                  <button 
                    onClick={handleDownload}
                    className="px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-full text-[8px] font-black text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all uppercase flex items-center gap-1"
                  >
                    DOWNLOAD PDF
                  </button>

                  <button 
                    onClick={() => setLeftPanelView('map')} 
                    className="px-3 py-1 bg-white border border-slate-200 rounded-full text-[8px] font-black text-slate-500 hover:text-rose-500 transition-colors uppercase"
                  >
                    Return to Map
                  </button>
                </div>
              </div>
              <div className="flex-1 p-3 bg-slate-200/50">
              {referral.referral_slip_url ? (
                <iframe 
                  src={`${referral.referral_slip_url}#view=FitH&toolbar=0`} 
                  className="w-full h-full rounded-xl shadow-inner bg-white border border-slate-300" 
                  title="Clinical Docs"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-slate-400">
                  <div className="w-12 h-12 rounded-full border-4 border-dashed border-slate-300 animate-spin" />
                  <span className="text-[9px] font-black uppercase tracking-widest">Awaiting Uplink...</span>
                </div>
              )}
            </div>
          </div>
          </div>

          {/* RIGHT PANEL: CLINICAL OPERATIONS */}
          <div className="w-[58%] flex flex-col bg-white">
            {/* HEADER */}
            <div className={`p-6 flex justify-between items-center transition-colors duration-500 ${
              isLoading ? 'bg-slate-50' : (isLog || isSender ? 'bg-white border-b border-slate-100' : 'bg-slate-950 text-white')
            }`}>
              {!isLoading ? (
                <>
                  <div className="space-y-1">
                    <h2 className="text-xl font-black tracking-tighter uppercase italic leading-none">
                      {isSender ? 'Outbound Pipeline' : isLog ? 'Case Registry' : 'Triage Command'}
                    </h2>
                    <div className="flex items-center gap-2 opacity-70">
                      <div className="w-1 h-1 bg-current rounded-full" />
                      <span className="text-[9px] font-bold tracking-[0.2em] uppercase">Ref ID: {referral.reference_number}</span>
                    </div>
                  </div>
                  <button 
                    onClick={onClose} 
                    className="group w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800/10 hover:bg-rose-500 transition-all"
                  >
                    <span className="text-slate-400 group-hover:text-white transition-colors">✕</span>
                  </button>
                </>
              ) : <div className="h-12 w-1/2 clinical-skeleton rounded-lg" />}
            </div>

            {/* CONTENT AREA */}
            <div className="p-8 flex-1 overflow-y-auto space-y-8 custom-scrollbar">
              {isLoading ? (
                <div className="space-y-6">
                  <div className="h-20 clinical-skeleton rounded-2xl w-full" />
                  <div className="h-32 clinical-skeleton rounded-2xl w-full" />
                  <div className="h-12 clinical-skeleton rounded-2xl w-2/3" />
                </div>
              ) : (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                  
                  {/* ASSET SELECTORS */}
                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <button 
                      onClick={() => setLeftPanelView('attachment')} 
                      className={`group p-4 rounded-2xl border transition-all flex items-center gap-4 ${
                        leftPanelView === 'attachment' ? 'bg-emerald-50 border-emerald-500' : 'bg-slate-50 border-slate-100 hover:border-slate-300'
                      }`}
                    >
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-xl shadow-sm border border-slate-100 group-hover:scale-110 transition-transform">📄</div>
                      <div className="text-left">
                        <p className={`text-[9px] font-black uppercase tracking-widest ${leftPanelView === 'attachment' ? 'text-emerald-600' : 'text-slate-600'}`}>Medical Dossier</p>
                        <p className="text-[7px] text-slate-400 uppercase font-bold">Review Records</p>
                      </div>
                    </button>
                    <div className="p-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 flex items-center gap-4 opacity-50 grayscale">
                      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-xl">🧪</div>
                      <div className="text-left">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Imaging</p>
                        <p className="text-[7px] text-slate-400 uppercase font-bold">Offline</p>
                      </div>
                    </div>
                  </div>

                  {/* PATIENT INFO CARD */}
                  <div className="bg-slate-50 border border-slate-200 p-6 rounded-[1.5rem] relative overflow-hidden mb-8 shadow-sm">
                    <div className="absolute top-0 right-0 p-4">
                       <span className="text-[8px] font-black text-slate-300 tracking-tighter uppercase opacity-50">Confidential</span>
                    </div>
                    <div className="flex justify-between items-start mb-5">
                      <div>
                        <p className="text-[8px] font-black text-emerald-600 uppercase tracking-[0.3em] mb-1.5">Referral Patient Details</p>
                        <h3 className="text-1xl font-black text-slate-900 tracking-tighter uppercase leading-none">
                          {referral.users?.first_name} {referral.users?.last_name}
                        </h3>
                      </div>
                      <div className="text-[8px] font-black text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                        ID: {referral.users?.medical_id || 'N/A'}
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm relative">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-l-xl" />
                      <p className="text-xs font-semibold text-slate-700 leading-relaxed italic">
                        "{referral.chief_complaint || 'No complaint specified'}"
                      </p>
                    </div>
                  </div>

                  {/* ACTION LOGIC / FORM */}
                  {(isLog || isSender) ? (
                    <div className="space-y-6 animate-in fade-in duration-500">
                      {/* DISPOSITION DETAILS CARD */}
                      <div className={`rounded-[1.5rem] p-6 shadow-sm border relative overflow-hidden ${
                        referral.status === 'DIVERTED' 
                          ? 'bg-orange-50 border-orange-200' 
                          : 'bg-white border-slate-200'
                      }`}>
                        {/* Subtle Background Icon */}
                        <div className="absolute -right-4 -bottom-4 text-7xl opacity-5 grayscale pointer-events-none">
                          {referral.status === 'DIVERTED' ? '↩️' : 
                          referral.service_stream === 'DIAGNOSTIC' ? '🧪' : 
                          referral.service_stream === 'INPATIENT' ? '🏥' : '🩺'}
                        </div>

                        <div className="relative z-10">
                          <p className={`text-[8px] font-black uppercase tracking-[0.4em] mb-4 ${
                            referral.status === 'DIVERTED' ? 'text-orange-600' : 'text-emerald-600'
                          }`}>
                            {referral.status === 'DIVERTED' ? 'Diversion Protocol' : 'Finalized Disposition'}
                          </p>
                          
                          <div className="grid grid-cols-2 gap-6">
                            {/* Left Column: Status / Stream Type */}
                            <div>
                              <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">
                                {referral.status === 'DIVERTED' ? 'Protocol Status' : 'Service Stream'}
                              </p>
                              <p className="text-sm font-black text-slate-900 uppercase tracking-tight">
                                {referral.status === 'DIVERTED' ? 'Diverted Out' : (referral.service_stream || 'N/A')}
                              </p>
                            </div>

                            {/* Right Column: Dynamic Assignment Details */}
                            <div>
                              <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">
                                {referral.status === 'DIVERTED' ? 'Target Facility' : 
                                referral.service_stream === 'DIAGNOSTIC' ? 'Assigned Equipment' : 
                                referral.service_stream === 'INPATIENT' ? 'Bed Allocation' : 'Department'}
                              </p>
                              <p className="text-sm font-black text-slate-900 uppercase tracking-tight">
                                {referral.status === 'DIVERTED' ? 
                                  (referral.destination_facility?.name || 'External Medical Center') :
                                referral.service_stream === 'DIAGNOSTIC' ? 
                                  (referral.resource_assignments?.[0]?.facility_resources?.unit_label || 'Laboratory Asset') :
                                referral.service_stream === 'INPATIENT' ? 
                                  (`${referral.beds?.ward_type || 'Ward'} - ${referral.beds?.bed_label || 'Unassigned'}`) :
                                (referral.departments?.name || 'General Outpatient')}
                              </p>
                            </div>
                          </div>

                          <div className={`mt-6 pt-6 border-t flex justify-between items-center ${
                            referral.status === 'DIVERTED' ? 'border-orange-200' : 'border-slate-100'
                          }`}>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full heartbeat-dot ${
                                referral.status === 'DIVERTED' ? 'bg-orange-500' : 'bg-emerald-500'
                              }`} />
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                {referral.status === 'DIVERTED' ? 'Rerouting in Progress' : 'Confirmed & Synchronized'}
                              </span>
                            </div>
                            <span className={`text-[10px] font-black px-3 py-1 rounded-md border ${
                              referral.status === 'DIVERTED' 
                                ? 'text-orange-600 bg-orange-100 border-orange-200' 
                                : 'text-emerald-600 bg-emerald-50 border-emerald-100'
                            }`}>
                              {referral.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {view === 'details' ? (
                        <div className="flex gap-3">
                          <button 
                            onClick={() => setView('accept')} 
                            className="flex-[3] bg-emerald-600 hover:bg-emerald-700 text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] shadow-lg shadow-emerald-900/10 active:scale-[0.98] transition-all"
                          >
                            Accept Admission
                          </button>
                          <button 
                            onClick={handleDivert} 
                            className="flex-1 bg-white border-2 border-slate-100 text-rose-500 py-5 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 hover:border-rose-100 transition-all"
                          >
                            Divert
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-5 animate-in slide-in-from-bottom-4 duration-500">
                          {/* STREAM SELECTOR */}
                          <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1">
                            {['OUTPATIENT', 'INPATIENT', 'DIAGNOSTIC'].map((s) => (
                              <button 
                                key={s} 
                                onClick={() => { setServiceStream(s); setSelectedWard(''); }}
                                className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase transition-all ${
                                  serviceStream === s ? 'bg-white text-emerald-600 shadow-sm scale-[1.02]' : 'text-slate-400 hover:text-slate-600'
                                }`}
                              >
                                {s}
                              </button>
                            ))}
                          </div>

                          {/* DYNAMIC DROPDOWNS */}
                          <div className="space-y-3">
                            <div className="relative group">
                              <select 
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-5 text-[11px] font-black uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all appearance-none cursor-pointer"
                                value={selectedWard} 
                                onChange={(e) => setSelectedWard(e.target.value)}
                              >
                                <option value="" className="text-slate-400">
                                  {serviceStream === 'DIAGNOSTIC' ? '— Select Laboratory Resource —' : '— Select Admission Unit —'}
                                </option>
                                {serviceStream === 'DIAGNOSTIC' && diagnostics?.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.unit_label} ({item.resource_type}) — {item.total_capacity - item.current_occupied} Free
                                  </option>
                                ))}
                                {serviceStream === 'INPATIENT' && wardTypes?.map((w, i) => (
                                  <option key={i} value={w.type}>{w.type} Ward</option>
                                ))}
                                {serviceStream === 'OUTPATIENT' && departments?.map(d => (
                                  <option key={d.id} value={d.id}>{d.name} Department</option>
                                ))}
                              </select>
                              <div className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-emerald-500 transition-colors">▼</div>
                            </div>

                            {serviceStream === 'INPATIENT' && selectedWard && (
                              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="relative group">
                                  <select 
                                    className="w-full bg-emerald-50/50 border-2 border-emerald-100 rounded-2xl p-5 text-[11px] font-black uppercase outline-none focus:border-emerald-500 focus:bg-white appearance-none cursor-pointer transition-all"
                                    value={selectedBed}
                                    onChange={(e) => setSelectedBed(e.target.value)}
                                  >
                                    <option value="">Assign Bed Asset...</option>
                                    {beds?.map(bed => (
                                      <option key={bed.id} value={bed.id}>{bed.bed_label}</option>
                                    ))}
                                  </select>
                                  <div className="absolute right-5 top-1/2 -translate-y-1/2 text-emerald-400 pointer-events-none">▼</div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* FOOTER ACTIONS */}
                          <div className="flex gap-4 pt-4 items-center">
                            <button 
                              onClick={() => setView('details')} 
                              className="px-6 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors"
                            >
                              Cancel
                            </button>
                            <button 
                              onClick={handleFinalize} 
                              disabled={isProcessing || !selectedWard}
                              className={`flex-1 py-5 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] shadow-xl transition-all ${
                                !selectedWard ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-slate-950 text-white hover:bg-emerald-600 active:scale-95'
                              }`}
                            >
                              {isProcessing ? (
                                <span className="flex items-center justify-center gap-2">
                                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  Syncing...
                                </span>
                              ) : 'Confirm Disposition'}
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