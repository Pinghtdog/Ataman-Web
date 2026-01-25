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
    <div className="p-8 bg-[#F8FAFC] min-h-screen relative overflow-hidden">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">{showArchive ? 'Audit Logs' : 'Incoming Referrals'}</h1>
          <p className="text-gray-500 text-sm font-medium uppercase tracking-widest opacity-70">NCGH Emergency Command Center</p>
        </div>
        <button onClick={() => setShowArchive(!showArchive)} className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all border-2 ${showArchive ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-white text-gray-600 border-gray-100'}`}>
          {showArchive ? '← Back to Live' : 'View Archive / Logs'}
        </button>
      </div>

      <div className="mb-6 flex bg-white p-2 rounded-2xl shadow-sm border border-gray-100 items-center">
        <input type="text" placeholder="Search Patient ID or Name..." className="w-full outline-none px-4 text-sm text-gray-600 h-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </div>

      <div className="grid grid-cols-12 px-8 mb-4 text-[10px] font-bold text-gray-400 uppercase tracking-[0.25em]">
        <div className="col-span-3">Patient</div>
        <div className="col-span-3">Origin / Provider</div>
        <div className="col-span-2 text-center">Severity</div>
        <div className="col-span-2 text-center">{showArchive ? 'Status' : 'ETA'}</div>
        <div className="col-span-2 text-right">Action</div>
      </div>

      <div className="space-y-4">
        {displayData.map((ref) => (
          <div key={ref.id} className="grid grid-cols-12 bg-white rounded-3xl shadow-sm border border-gray-100 items-center h-28 relative hover:shadow-lg transition-all transform hover:-translate-y-1">
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${ref.ai_priority_score >= 0.8 ? 'bg-danger' : 'bg-primary'}`} />
            <div className="col-span-3 flex items-center gap-4 pl-8">
              <div className="w-12 h-12 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center font-bold text-xs border border-gray-100 uppercase">{ref.users?.first_name?.[0]}{ref.users?.last_name?.[0]}</div>
              <div>
                <p className="font-bold text-gray-800 text-sm leading-tight">{ref.users?.first_name} {ref.users?.last_name}</p>
                <p className="text-[10px] text-gray-400 font-mono">ID: {ref.users?.medical_id}</p>
              </div>
            </div>
            <div className="col-span-3">
              <p className="font-bold text-gray-700 text-sm">{ref.origin?.name}</p>
              <p className="text-[10px] text-gray-400 font-medium">{ref.doctor_name}</p>
            </div>
            <div className="col-span-2 flex justify-center">
              <span className={`px-4 py-1 rounded-full text-[9px] font-black border-2 ${ref.ai_priority_score >= 0.8 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
                {ref.ai_priority_score >= 0.8 ? 'ESI 1: RESUS' : 'ESI 4: MINOR'}
              </span>
            </div>
            <div className="col-span-2 text-center">
              {showArchive ? (
                <span className={`px-3 py-1 rounded text-[10px] font-black uppercase ${ref.status === 'DIVERTED' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{ref.status}</span>
              ) : (
                <><p className="text-sm font-black text-gray-800 leading-none">{calculateLiveETA(ref.ambulances?.latitude, ref.ambulances?.longitude)}</p><p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter mt-1">{ref.ambulances?.plate_number || 'Transporting'}</p></>
              )}
            </div>
            <div className="col-span-2 flex justify-end pr-8">
              <button onClick={() => setSelectedReferral(ref)} className="border-2 border-primary text-primary px-8 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-primary hover:text-white transition-all">Details</button>
            </div>
          </div>
        ))}
      </div>

      {/* DRIVER DEMO CONTROLS */}
      <div className="fixed bottom-8 right-8 flex flex-col gap-2">
        <button onClick={resetSimulation} className="bg-gray-800 text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-black transition-all">Reset Position</button>
        <button onClick={toggleSimulation} className={`p-5 rounded-full shadow-2xl font-black text-white transition-all transform hover:scale-105 active:scale-95 ${isSimulating ? 'bg-red-600 animate-pulse' : 'bg-emerald-600'}`}>
          {isSimulating ? "STOP SIMULATOR" : "START DRIVER DEMO"}
        </button>
      </div>

      {selectedReferral && (
        <ReferralModal 
          // CRITICAL FIX: Find the live version of the referral so props update in real-time
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