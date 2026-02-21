import React, { act, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Map, Marker } from "pigeon-maps";
import ReferralModal from '../components/ReferralModal'; 
import CreateReferralModal from '../components/CreateReferralModal';
// import { a } from 'framer-motion';

const HOSPITAL_LOCATION = { lat: 13.6218, lng: 123.1948 };
let simInterval = null;

const ReferralCenter = () => {
  const [referrals, setReferrals] = useState([]);
  const [viewMode, setViewMode] = useState('incoming'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReferral, setSelectedReferral] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [myFacilityId, setMyFacilityId] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [divertData, setDivertData] = useState(null);
  const [isListLoading, setIsListLoading] = useState(false);

  const fetchReferrals = async () => {
    setIsListLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: staffRecord } = await supabase
        .from('facility_staff')
        .select('facility_id')
        .eq('user_id', user.id)
        .single();

      const fId = staffRecord?.facility_id;
      setMyFacilityId(fId);

      let query = supabase.from('referrals').select(`
          id, reference_number, status, chief_complaint, ai_priority_score, 
          doctor_name, diagnosis_impression, created_at, eta_status,
          origin_facility_id, destination_facility_id,
          users!patient_id (first_name, last_name, medical_id),
          origin:facilities!origin_facility_id (name),
          destination:facilities!destination_facility_id (name),
          ambulances!ambulance_id (id, plate_number, latitude, longitude)
        `);

      if (viewMode === 'incoming') {
        query = query.eq('destination_facility_id', fId).eq('status', 'PENDING');
      } else if (viewMode === 'outgoing') {
        query = query.eq('origin_facility_id', fId).neq('status', 'ACCEPTED').neq('status', 'DIVERTED');
      } else if (viewMode === 'archive') {
        query = query.or(`origin_facility_id.eq.${fId},destination_facility_id.eq.${fId}`)
                     .or('status.eq.ACCEPTED,status.eq.DIVERTED');
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      setReferrals(data || []);
    } catch (err) {
      console.error("Fetch Error:", err.message);
    } finally {
      setIsListLoading(false);
    }
  };

  useEffect(() => {
    setReferrals([]); 
    fetchReferrals();

    const sub = supabase.channel('referral-center-main')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'referrals' }, fetchReferrals)
      .subscribe();

    const ambSub = supabase.channel('gps-list-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ambulances' }, (payload) => {
        setReferrals((prev) => prev.map(ref => {
          if (ref.ambulances && ref.ambulances.id === payload.new.id) {
            return { ...ref, ambulances: { ...ref.ambulances, ...payload.new } };
          }
          return ref;
        }));
      }).subscribe();

    return () => { 
      supabase.removeChannel(sub); 
      supabase.removeChannel(ambSub);
      if (simInterval) clearInterval(simInterval);
    };
  }, [viewMode]);

  const handleDivertHandoff = (data) => {
    setDivertData(data);
    setSelectedReferral(null); 
    setTimeout(() => setIsCreateModalOpen(true), 50);
  };

  useEffect(() => {
    if (viewMode === 'archive' && referrals.length === 0) return;

    const demoInterval = setInterval( async () => {
      const activeReferrals = referrals.filter(ref =>
        ref.ambulances?.id &&
        (ref.status === 'PENDING' || ref.status === 'ACCEPTED')
      );

      for (const ref of activeReferrals) {
        const amb = ref.ambulances;
        const targetLat = HOSPITAL_LOCATION.lat;
        const targetLng = HOSPITAL_LOCATION.lng;
        let currentLat = Number(amb.latitude);
        let currentLng = Number(amb.longitude);

        const stepSize = 0.0005;

        let moved = false;
        if (Math.abs(currentLat - targetLat) > 0.0001) {
          currentLat += (currentLat < targetLat ? stepSize : -stepSize);
          moved = true;
        }

        if (Math.abs(currentLng - targetLng) > 0.0001) {
          currentLng += (currentLng < targetLng ? stepSize : -stepSize);
          moved = true;
        }

        if (moved) {
          await supabase.from('ambulances').update({ latitude: currentLat, longitude: currentLng }).eq('id', amb.id);
        }
      }
    }, 5000);

    return () => clearInterval(demoInterval);
  }, [referrals, viewMode]);

  const calculateLiveETA = (lat, lon) => {
    if (!lat || !lon) return "GPS Syncing...";
    const R = 6371;
    const dLat = (HOSPITAL_LOCATION.lat - lat) * (Math.PI / 180);
    const dLon = (HOSPITAL_LOCATION.lng - lon) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat * (Math.PI / 180)) * Math.cos(HOSPITAL_LOCATION.lat * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const time = Math.round(((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) / 30) * 60);
    return time <= 2 ? (
    <span className="text-emerald-500 heartbeat">ARRIVING NOW</span>
  ) : (
    `${time} MINS`
  );
  };

  const displayData = referrals.filter(ref => {
    const fullName = `${ref.users?.first_name} ${ref.users?.last_name}`.toLowerCase();
    return fullName.includes(searchTerm.toLowerCase()) || ref.reference_number.includes(searchTerm);
  });

 return (
  <div className="p-4 md:p-8 bg-[#F8FAFC] min-h-screen relative overflow-hidden font-sans">
    
    {/* REFINED DESIGN SYSTEM */}
    <style>
      {`
        .glass-hud {
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(226, 232, 240, 0.8);
        }
        
        .compact-card {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .compact-card:hover {
          background-color: #ffffff;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
          transform: translateX(4px);
        }

        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 20px;
        }
      `}
    </style>

    {/* TIGHTENED HEADER */}
    <div className="flex flex-col lg:flex-row justify-between items-end mb-8 gap-4 relative z-10">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
          <p className="text-slate-400 text-[9px] font-black uppercase tracking-[0.3em]">Referral Center</p>
        </div>
        
        <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">
          {viewMode === 'incoming' && 'Inbound'}
          {viewMode === 'outgoing' && 'Outbound'}
          {viewMode === 'archive' && 'Archives'}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex bg-slate-200/50 p-1 rounded-xl border border-slate-200">
          {['incoming', 'outgoing', 'archive'].map((mode) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={`px-5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                viewMode === mode ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <button onClick={() => setIsCreateModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md transition-all active:scale-95">
          + New Referral Entry
        </button>
      </div>
    </div>

    {/* SEARCH */}
    <div className="mb-6 relative z-10">
      <div className="flex glass-hud rounded-xl shadow-sm items-center border border-slate-200/60 focus-within:border-emerald-500/50 focus-within:ring-4 focus-within:ring-emerald-500/5 transition-all">
        <div className="pl-4 flex items-center justify-center">
          {}
          <svg 
            width="14" 
            height="14" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="3" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className="text-slate-400"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
        <input 
          type="text" 
          placeholder="Search for a referral..." 
          className="w-full bg-transparent outline-none px-4 py-3 text-[10px] font-black text-slate-800 placeholder:text-slate-300 uppercase tracking-[0.2em]" 
          value={searchTerm} 
          onChange={(e) => setSearchTerm(e.target.value)} 
        />
      </div>
    </div>

    {/* MINI TABLE HEADER */}
    <div className="hidden lg:grid grid-cols-12 px-8 mb-3 text-[8px] font-black text-slate-400 uppercase tracking-[0.3em]">
      <div className="col-span-3">Patient Data</div>
      <div className="col-span-3">Network Node</div>
      <div className="col-span-2 text-center">Clinical Severity</div>
      <div className="col-span-2 text-center">Transit Status</div>
      <div className="col-span-2 text-right pr-4">Action</div>
    </div>

    {/* DATA ROWS: COMPACT VERSION */}
    <div className="space-y-2 relative z-10">
      {isListLoading ? (
          [1,2,3,4,5].map(i => <div key={i} className="h-16 bg-white/40 rounded-xl animate-pulse border border-slate-100" />)
      ) : displayData.length > 0 ? displayData.map((ref) => (
        <div 
          key={ref.id} 
          className="compact-card grid grid-cols-1 lg:grid-cols-12 bg-white/60 rounded-xl border border-slate-200/50 items-center p-4 lg:p-0 lg:h-16 relative overflow-hidden"
        >
          {/* Subtle Priority Side-Bar */}
          <div className={`absolute left-0 top-0 bottom-0 w-1 ${
            ref.ai_priority_score >= 0.8 ? 'bg-rose-500' : 'bg-emerald-500'
          }`} />
          
          {/* Section 1: Identity */}
          <div className="col-span-3 flex items-center gap-4 lg:pl-6">
            <div className="w-9 h-9 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center font-black text-[10px] border border-slate-200">
              {ref.users?.first_name?.[0]}{ref.users?.last_name?.[0]}
            </div>
            <div>
              <p className="font-black text-slate-800 text-sm tracking-tight uppercase leading-none">
                {ref.users?.first_name} {ref.users?.last_name}
              </p>
              <p className="text-[9px] text-slate-400 font-bold tracking-tighter mt-1">{ref.users?.medical_id}</p>
            </div>
          </div>

          {/* Section 2: Facility */}
          <div className="col-span-3">
            <p className="font-bold text-slate-700 text-xs uppercase truncate pr-4">
              {viewMode === 'outgoing' ? ref.destination?.name : ref.origin?.name}
            </p>
            <p className="text-[8px] text-emerald-600 font-black tracking-widest uppercase mt-0.5">{ref.reference_number}</p>
          </div>

          {/* Section 3: Severity */}
          <div className="col-span-2 flex lg:justify-center">
            <span className={`px-3 py-1 rounded-md text-[8px] font-black border ${
              ref.ai_priority_score >= 0.8 
              ? 'bg-rose-50 text-rose-600 border-rose-100' 
              : 'bg-emerald-50 text-emerald-600 border-emerald-100'
            }`}>
              {ref.ai_priority_score >= 0.8 ? 'ESI-1: CRITICAL' : 'ESI-4: STABLE'}
            </span>
          </div>

          {/* Section 4: ETA */}
          <div className="col-span-2 text-left lg:text-center">
            {viewMode === 'archive' ? (
              <span className={`text-[9px] font-black uppercase tracking-widest ${
                ref.status === 'DIVERTED' ? 'text-rose-500' : 'text-emerald-600'
              }`}>
                {ref.status}
              </span>
            ) : (
              <div className="flex flex-col items-center lg:items-center">
                <p className="text-xs font-black text-slate-800 tabular-nums italic">
                   {calculateLiveETA(ref.ambulances?.latitude, ref.ambulances?.longitude)}
                </p>
                <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">
                  {ref.ambulances?.plate_number || 'TRANSIT'}
                </p>
              </div>
            )}
          </div>

          {/* Section 5: Action */}
          <div className="col-span-2 flex justify-end lg:pr-6">
            <button 
              onClick={() => setSelectedReferral(ref)} 
              className="bg-slate-50 hover:bg-emerald-600 hover:text-white border border-slate-200 text-slate-600 px-4 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all"
            >
              Details
            </button>
          </div>
        </div>
      )) : (
        <div className="text-center py-20 bg-white/40 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center">
           <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-[10px]">No Active Signals</p>
        </div>
      )}
    </div>

    {/* MODALS */}
    {selectedReferral && (
      <ReferralModal 
        referral={referrals.find(r => r.id === selectedReferral.id) || selectedReferral} 
        isLog={viewMode === 'archive'} 
        onClose={() => setSelectedReferral(null)} 
        onUpdate={fetchReferrals} 
        onDivert={handleDivertHandoff} 
        calculateETA={calculateLiveETA} 
      />
    )}

    {isCreateModalOpen && (
      <CreateReferralModal 
        onClose={() => { setIsCreateModalOpen(false); setDivertData(null); }} 
        onSuccess={fetchReferrals} myFacilityId={myFacilityId} initialData={divertData} 
      />
    )}
  </div>
);
};

export default ReferralCenter;
