import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import ReferralModal from '../components/ReferralModal'; 

const HOSPITAL_LOCATION = { lat: 13.6218, lng: 123.1948 };
let simInterval = null;

const ReferralCenter = () => {
  const [referrals, setReferrals] = useState([]);
  const [showArchive, setShowArchive] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReferral, setSelectedReferral] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const fetchReferrals = async () => {
    const { data, error } = await supabase
      .from('referrals')
      .select(`
        id, reference_number, status, chief_complaint, ai_priority_score, 
        doctor_name, diagnosis_impression, created_at, eta_status,
        users!patient_id (first_name, last_name, medical_id),
        origin:facilities!origin_facility_id (name),
        ambulances!ambulance_id (id, plate_number, latitude, longitude)
      `)
      .order('created_at', { ascending: false });

    if (!error) setReferrals(data);
  };

  useEffect(() => {
    document.title = "Referral Center | ATAMAN Health";
    fetchReferrals();

    // 1. Listen for status changes (Accepted/Diverted)
    const sub = supabase.channel('referral-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'referrals' }, fetchReferrals)
      .subscribe();

    // 2. Listen for GPS movement (Updates state without re-fetching everything)
    const ambSub = supabase.channel('amb-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ambulances' }, (payload) => {
        setReferrals((prev) => prev.map(ref => {
          if (ref.ambulances && ref.ambulances.id === payload.new.id) {
            return { ...ref, ambulances: { ...ref.ambulances, ...payload.new } };
          }
          return ref;
        }));
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(sub); 
      supabase.removeChannel(ambSub); 
      if (simInterval) clearInterval(simInterval); 
    };
  }, []);

  // --- DRIVER SIMULATOR LOGIC ---
  const toggleSimulation = () => {
    if (isSimulating) {
      clearInterval(simInterval);
      setIsSimulating(false);
    } else {
      setIsSimulating(true);
      simInterval = setInterval(async () => {
        const targetAmbId = '550e8400-e29b-41d4-a716-446655440000'; 
        
        const { data } = await supabase.from('ambulances').select('latitude, longitude').eq('id', targetAmbId).single();
        
        if (data) {
          await supabase.from('ambulances').update({ 
            latitude: data.latitude - 0.0003, 
            longitude: data.longitude + 0.0002 
          }).eq('id', targetAmbId);
        }
      }, 3000);
    }
  };

  const resetSimulation = async () => {
    const targetAmbId = '550e8400-e29b-41d4-a716-446655440000';
    await supabase.from('ambulances').update({ 
      latitude: 13.6373, 
      longitude: 123.1611 
    }).eq('id', targetAmbId);
    alert("Ambulance reset to starting position.");
  };

  const calculateLiveETA = (lat, lon) => {
    if (!lat || !lon) return "GPS Syncing...";
    const R = 6371;
    const dLat = (HOSPITAL_LOCATION.lat - lat) * (Math.PI / 180);
    const dLon = (HOSPITAL_LOCATION.lng - lon) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat * (Math.PI / 180)) * Math.cos(HOSPITAL_LOCATION.lat * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const time = Math.round(((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) / 30) * 60);
    return time <= 2 ? "Arriving Now" : `${time} mins`;
  };

  const displayData = referrals.filter(ref => {
    const fullName = `${ref.users?.first_name} ${ref.users?.last_name}`.toLowerCase();
    const matchesSearch = fullName.includes(searchTerm.toLowerCase()) || ref.users?.medical_id?.toLowerCase().includes(searchTerm.toLowerCase());
    return showArchive ? (matchesSearch && ref.status !== 'PENDING') : (matchesSearch && ref.status === 'PENDING');
  });

  return (
  <div className="p-10 bg-[#F1F5F9] min-h-screen relative overflow-hidden font-sans">
    {/* HEADER SECTION */}
    <div className="flex justify-between items-end mb-10">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">NCGH Emergency Command Center</p>
        </div>
        <h1 className="text-4xl font-black text-slate-800 tracking-tighter">
          {showArchive ? 'Audit Archive' : 'Incoming Referrals'}
        </h1>
      </div>
      
      <button 
        onClick={() => setShowArchive(!showArchive)} 
        className={`px-8 py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all border-2 ${
          showArchive 
            ? 'bg-slate-800 text-white border-slate-800 shadow-xl' 
            : 'bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary shadow-sm'
        }`}
      >
        {showArchive ? '← Return to Live Board' : 'Database Logs / Archive'}
      </button>
    </div>

    {/* SEARCH BAR */}
    <div className="mb-8 group">
      <div className="flex bg-white/80 backdrop-blur-md p-1 rounded-[2rem] shadow-sm border border-slate-200 items-center transition-all group-focus-within:border-primary group-focus-within:shadow-lg group-focus-within:shadow-primary/10">
        <div className="pl-6 text-slate-400">🔍</div>
        <input 
          type="text" 
          placeholder="Search by Patient Name, ID, or Condition..." 
          className="w-full bg-transparent outline-none px-4 py-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300" 
          value={searchTerm} 
          onChange={(e) => setSearchTerm(e.target.value)} 
        />
      </div>
    </div>

    {/* TABLE HEADER */}
    <div className="grid grid-cols-12 px-10 mb-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
      <div className="col-span-3">Patient Identification</div>
      <div className="col-span-3">Referring Provider</div>
      <div className="col-span-2 text-center">Clinical Severity</div>
      <div className="col-span-2 text-center">{showArchive ? 'Decision Status' : 'Estimated Arrival'}</div>
      <div className="col-span-2 text-right pr-4">Action</div>
    </div>

    {/* DATA ROWS */}
    <div className="space-y-4">
      {displayData.map((ref) => (
        <div 
          key={ref.id} 
          className="grid grid-cols-12 bg-white rounded-[2.5rem] shadow-sm border border-slate-100 items-center h-32 relative hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] transition-all transform hover:-translate-y-1 group"
        >
          {/* Priority Indicator Line */}
          <div className={`absolute left-0 top-8 bottom-8 w-1.5 rounded-r-full transition-all ${
            ref.ai_priority_score >= 0.8 ? 'bg-rose-500 shadow-[2px_0_10px_rgba(244,63,94,0.4)]' : 'bg-emerald-500'
          }`} />

          {/* Patient Info */}
          <div className="col-span-3 flex items-center gap-5 pl-10">
            <div className="w-14 h-14 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center font-black text-xs border border-slate-100 uppercase transition-all group-hover:bg-slate-100 group-hover:text-slate-600">
              {ref.users?.first_name?.[0]}{ref.users?.last_name?.[0]}
            </div>
            <div>
              <p className="font-black text-slate-800 text-base leading-tight uppercase tracking-tight">
                {ref.users?.first_name} {ref.users?.last_name}
              </p>
              <p className="text-[10px] text-slate-400 font-bold tracking-widest mt-1 italic">
                {ref.users?.medical_id}
              </p>
            </div>
          </div>

          {/* Provider Info */}
          <div className="col-span-3">
            <p className="font-black text-slate-700 text-sm uppercase tracking-tight">{ref.origin?.name}</p>
            <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase italic tracking-tighter">Dr. {ref.doctor_name}</p>
          </div>

          {/* Severity Tag */}
          <div className="col-span-2 flex justify-center">
            <span className={`px-5 py-2 rounded-xl text-[9px] font-black border-2 transition-all ${
              ref.ai_priority_score >= 0.8 
                ? 'bg-rose-50 text-rose-600 border-rose-100' 
                : 'bg-emerald-50 text-emerald-600 border-emerald-100'
            }`}>
              {ref.ai_priority_score >= 0.8 ? 'ESI 1: RESUSCITATION' : 'ESI 4: NON-URGENT'}
            </span>
          </div>

          {/* ETA / Status */}
          <div className="col-span-2 text-center">
            {showArchive ? (
              <span className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                ref.status === 'DIVERTED' 
                  ? 'bg-rose-100 text-rose-700' 
                  : 'bg-emerald-100 text-emerald-700'
              }`}>
                {ref.status}
              </span>
            ) : (
              <div className="animate-in fade-in duration-700">
                <p className="text-lg font-black text-slate-800 leading-none tabular-nums">
                  {calculateLiveETA(ref.ambulances?.latitude, ref.ambulances?.longitude)}
                </p>
                <div className="flex items-center justify-center gap-1.5 mt-2">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest italic">
                    {ref.ambulances?.plate_number || 'TRANSIT'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action Button */}
          <div className="col-span-2 flex justify-end pr-10">
            <button 
              onClick={() => setSelectedReferral(ref)} 
              className="bg-white border-2 border-slate-200 text-slate-700 px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:border-primary hover:text-primary hover:shadow-lg hover:shadow-primary/10 transition-all active:scale-95"
            >
              Review Case
            </button>
          </div>
        </div>
      ))}
    </div>

    {/* MODAL */}
    {selectedReferral && (
      <ReferralModal 
        referral={referrals.find(r => r.id === selectedReferral.id) || selectedReferral} 
        isLog={showArchive} 
        onClose={() => setSelectedReferral(null)} 
        onUpdate={fetchReferrals} 
        calculateETA={calculateLiveETA} 
      />
    )}
  </div>
  );
};

export default ReferralCenter;