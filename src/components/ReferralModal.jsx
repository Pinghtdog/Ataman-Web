import React, { useState, useEffect } from 'react';
import { Map, Marker } from "pigeon-maps";
import { supabase } from '../supabaseClient';

const HOSPITAL_LOCATION = [13.6218, 123.1948];

const ReferralModal = ({ referral, onClose, onUpdate, isLog, calculateETA }) => {
  const [remarks, setRemarks] = useState('');
  const [availableBeds, setAvailableBeds] = useState([]);
  const [selectedBed, setSelectedBed] = useState('');
  const [view, setView] = useState('details'); 
  
  const [mapCenter, setMapCenter] = useState(HOSPITAL_LOCATION);

  useEffect(() => {
    if (!isLog) {
      const fetchBeds = async () => {
        const { data } = await supabase.from('beds').select('id').eq('status', 'available');
        setAvailableBeds(data || []);
      };
      fetchBeds();
    }
  }, [isLog]);

  useEffect(() => {
    if (referral.ambulances?.latitude && referral.ambulances?.longitude) {
      setMapCenter([referral.ambulances.latitude, referral.ambulances.longitude]);
    }
  }, [referral.ambulances?.latitude, referral.ambulances?.longitude]);

  const handleAction = async (newStatus) => {
    if (newStatus === 'DIVERTED' && !remarks.trim()) {
      alert("Clinical remarks required for diversion.");
      return;
    }

    const finalEtaString = calculateETA(referral.ambulances?.latitude, referral.ambulances?.longitude);

    const { error } = await supabase
      .from('referrals')
      .update({ 
        status: newStatus, 
        diagnosis_impression: remarks || referral.diagnosis_impression,
        eta_status: finalEtaString 
      })
      .eq('id', referral.id);

    if (!error) {
      onUpdate();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-md p-4">
      <div className="bg-white rounded-[2.5rem] w-full max-w-5xl shadow-2xl overflow-hidden flex h-[620px] border border-white/20 animate-in zoom-in duration-300">
        
        
        <div className="w-1/2 bg-gray-100 border-r border-gray-100 relative">
          <Map 
            height={620} 
            center={mapCenter} 
            defaultZoom={14}
          >
            <Marker width={40} anchor={HOSPITAL_LOCATION} color="#00695C" />
            
            {referral.ambulances?.latitude && (
              <Marker 
                width={45} 
                anchor={[referral.ambulances.latitude, referral.ambulances.longitude]} 
                color="#D32F2F" 
                style={{ transition: 'all 0.5s ease-out' }} 
              />
            )}
          </Map>
          <div className="absolute top-6 left-6 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-sm border border-white">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
              Ambulance: {referral.ambulances?.plate_number || 'SYNCING'}
            </p>
          </div>
        </div>

        {}
        <div className="w-1/2 flex flex-col bg-white">
          <div className={`p-8 text-white flex justify-between items-start ${isLog ? 'bg-gray-800' : 'bg-primary'}`}>
            <div>
              <h2 className="text-2xl font-black tracking-tight">{isLog ? 'Clinical Audit' : 'Case Review'}</h2>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-60 mt-1">Reference No: {referral.reference_number}</p>
            </div>
            <button onClick={onClose} className="text-2xl opacity-40 hover:opacity-100 hover:rotate-90 transition-all">✕</button>
          </div>

          <div className="p-10 flex-1 overflow-y-auto space-y-8">
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-gray-50/50 p-5 rounded-3xl border border-gray-100">
                <label className="text-[9px] font-black text-gray-400 uppercase block mb-1">Patient Info</label>
                <p className="text-base font-bold text-gray-800 leading-none">{referral.users?.first_name} {referral.users?.last_name}</p>
                <p className="text-[10px] text-gray-400 mt-1 uppercase">ID: {referral.users?.medical_id}</p>
              </div>
              <div className="bg-gray-50/50 p-5 rounded-3xl border border-gray-100">
                <label className="text-[9px] font-black text-gray-400 uppercase block mb-1">Status/ETA</label>
                <p className="text-base font-black text-primary uppercase">
                  {isLog ? referral.eta_status : calculateETA(referral.ambulances?.latitude, referral.ambulances?.longitude)}
                </p>
                <p className="text-[10px] text-gray-400 mt-1 font-bold">{referral.transport_type}</p>
              </div>
            </div>

            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase block mb-2">Chief Complaint & History</label>
              <div className="p-6 bg-white border-2 border-gray-50 rounded-3xl text-sm italic text-gray-600 leading-relaxed shadow-inner">
                "{referral.chief_complaint}"
              </div>
            </div>

            {isLog ? (
              <div className={`p-6 rounded-3xl border ${referral.status === 'DIVERTED' ? 'bg-red-50 border-red-100 text-red-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
                <p className="text-[10px] font-black uppercase mb-1">Final Outcome: {referral.status}</p>
                <p className="text-sm font-medium leading-relaxed italic">"{referral.diagnosis_impression || 'Closed with no additional notes.'}"</p>
              </div>
            ) : (
              <div className="pt-6">
                {view === 'details' && (
                  <div className="flex gap-4">
                    <button onClick={() => setView('accept')} className="flex-1 bg-primary text-white py-5 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20 hover:translate-y-[-2px] transition-all">ACKNOWLEDGE</button>
                    <button onClick={() => setView('reject')} className="flex-1 border-2 border-red-500 text-red-500 py-5 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-red-50 transition-all">DIVERT</button>
                  </div>
                )}
                {view === 'reject' && (
                  <div className="space-y-4 animate-in slide-in-from-bottom-5">
                    <textarea className="w-full border-2 border-gray-100 rounded-3xl p-5 text-sm outline-none focus:border-red-200 transition-colors" rows="3" placeholder="Enter clinical reason for diversion..." value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                    <button onClick={() => handleAction('DIVERTED')} className="w-full bg-red-600 text-white py-5 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl shadow-red-200">Confirm Diversion</button>
                    <button onClick={() => setView('details')} className="w-full text-gray-400 text-[9px] font-black uppercase text-center mt-2 tracking-widest">Back to Review</button>
                  </div>
                )}
                {view === 'accept' && (
                  <div className="space-y-4 animate-in slide-in-from-bottom-5">
                    <select className="w-full border-2 border-gray-100 rounded-3xl p-5 font-bold text-sm bg-gray-50" value={selectedBed} onChange={(e) => setSelectedBed(e.target.value)}>
                      <option value="">Select Target Bed Unit...</option>
                      {availableBeds.map(bed => <option key={bed.id} value={bed.id}>ER Bed Assignment: #{bed.id}</option>)}
                    </select>
                    <button onClick={() => handleAction('ACCEPTED')} className="w-full bg-primary text-white py-5 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">Finalize & Acknowledge</button>
                    <button onClick={() => setView('details')} className="w-full text-gray-400 text-[9px] font-black uppercase text-center mt-2 tracking-widest">Back to Review</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReferralModal;