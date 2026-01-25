import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { User, AlertTriangle } from 'lucide-react'; // Added AlertTriangle for the warning icon
import './BedManagement.css';

const BedManagement = () => {
  const [beds, setBeds] = useState([]);
  
  // MODAL & SEARCH STATES
  const [selectedBed, setSelectedBed] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState([]); 
  const [chosenPatient, setChosenPatient] = useState(null); 
  const [showDischargeConfirm, setShowDischargeConfirm] = useState(false);

  // 1. FETCH DATA (Real-time)
  const fetchBeds = async () => {
    const { data, error } = await supabase
      .from('beds')
      .select(`*, users ( id, first_name, last_name, birth_date )`)
      .order('id', { ascending: true });

    if (error) console.error('Error fetching beds:', error);
    else setBeds(data || []);
  };

  useEffect(() => {
    fetchBeds();

    const channel = supabase
      .channel('bed-management-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'beds' }, () => {
        fetchBeds();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 2. AUTO-SUGGEST LOGIC (Debounced)
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (searchTerm.length < 2 || chosenPatient) {
        setSuggestions([]);
        return;
      }

      const { data } = await supabase
        .from('users')
        .select('id, first_name, last_name, birth_date')
        .ilike('first_name', `%${searchTerm}%`)
        .limit(5);

      setSuggestions(data || []);
    };

    const timeoutId = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, chosenPatient]);

  // 3. HANDLERS

  // A. Select a patient from dropdown
  const handleSelectPatient = (user) => {
    setChosenPatient(user);
    setSearchTerm(`${user.first_name} ${user.last_name}`);
    setSuggestions([]); 
  };

  // B. Confirm Assignment (Updates DB)
  const executeAssignment = async () => {
    if (!chosenPatient || !selectedBed) {
      alert("Please select a patient from the list.");
      return;
    }

    const { error } = await supabase
      .from('beds')
      .update({ 
        status: 'occupied', 
        patient_id: chosenPatient.id 
      })
      .eq('id', selectedBed.id);

    if (error) {
      alert("Error updating bed: " + error.message);
    } else {
      await fetchBeds(); 
      setSelectedBed(null);
      setSearchTerm('');
      setChosenPatient(null);
    }
  };

  // C. PREPARE Discharge (Opens Modal)
  const openDischargeModal = (bed) => {
    setSelectedBed(bed);           // Set the bed we want to discharge
    setShowDischargeConfirm(true); // Show the popup
  };

  // D. EXECUTE Discharge (Actual DB Update)
  const executeDischarge = async () => {
    if (!selectedBed) return;

    try {
      // Update Supabase: Set status to 'cleaning' & remove patient
      const { error } = await supabase
        .from('beds')
        .update({ 
          status: 'cleaning', 
          patient_id: null 
        })
        .eq('id', selectedBed.id);

      if (error) throw error;

      // Success! Close everything and refresh
      setShowDischargeConfirm(false); 
      setSelectedBed(null);           
      await fetchBeds();
      
    } catch (error) {
      console.error('Error discharging:', error);
      alert('Failed to discharge. Check console.');
    }
  };

  // E. Mark Ready (Cleaning -> Available)
  const handleMarkReady = async (id) => {
    const { error } = await supabase
      .from('beds')
      .update({ status: 'available' })
      .eq('id', id);

    if (!error) await fetchBeds();
  };

  // 4. STATS & FILTERING
  const totalBeds = beds.length;
  const occupied = beds.filter(b => b.status === 'occupied').length;
  const available = beds.filter(b => b.status === 'available').length;
  const cleaning = beds.filter(b => b.status === 'cleaning').length;

  const erBeds = beds.filter(b => b.ward_type === 'ER');
  const wardBeds = beds.filter(b => b.ward_type === 'General');

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Bed Management</h2>

      {/* STATS CARDS */}
      <div className="stats-container">
        <div className="stat-card">
          <div className="stat-label">Total Beds</div>
          <div className="stat-number">{totalBeds}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Occupied</div>
          <div className="stat-number red">{occupied}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Available</div>
          <div className="stat-number green">{available}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">To Be Cleaned</div>
          <div className="stat-number yellow">{cleaning}</div>
        </div>
      </div>

      {/* --- SECTION 1: EMERGENCY ROOM --- */}
      <div className="mb-8">
        <h3 className="text-xl font-bold text-gray-700 mb-4 border-b pb-2">Emergency Room (ER)</h3>
        {erBeds.length === 0 && <p className="text-gray-400 italic">No ER beds configured.</p>}
        
        <div className="management-grid">
          {erBeds.map((bed) => (
            <BedCard 
              key={bed.id} 
              bed={bed} 
              onDischargeClick={openDischargeModal} 
              onMarkReady={handleMarkReady} 
              onAssign={setSelectedBed} 
            />
          ))}
        </div>
      </div>

      {/* --- SECTION 2: GENERAL WARD --- */}
      <div>
        <h3 className="text-xl font-bold text-gray-700 mb-4 border-b pb-2">General Ward</h3>
        {wardBeds.length === 0 && <p className="text-gray-400 italic">No General Ward beds configured.</p>}

        <div className="management-grid">
          {wardBeds.map((bed) => (
            <BedCard 
              key={bed.id} 
              bed={bed} 
              onDischargeClick={openDischargeModal} 
              onMarkReady={handleMarkReady} 
              onAssign={setSelectedBed} 
            />
          ))}
        </div>
      </div>

      {/* --- ASSIGN PATIENT MODAL --- */}
      {selectedBed && !showDischargeConfirm && (
        <div className="modal-overlay" onClick={() => setSelectedBed(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Assign Patient to {selectedBed.bed_label}</h3>
            
            <div className="input-group">
              <input 
                type="text" 
                className="modal-input"
                placeholder="Type patient name (e.g. 'Jasmin')..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setChosenPatient(null);
                }}
                autoFocus
              />
              
              {/* DROPDOWN LIST */}
              {suggestions.length > 0 && (
                <ul className="suggestions-list">
                  {suggestions.map((user) => (
                    <li 
                      key={user.id} 
                      className="suggestion-item"
                      onClick={() => handleSelectPatient(user)}
                    >
                      <span className="suggestion-name-text">
                        {user.first_name} {user.last_name}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setSelectedBed(null)}>Cancel</button>
              <button 
                className="btn-confirm" 
                onClick={executeAssignment}
                style={{ opacity: chosenPatient ? 1 : 0.5, cursor: chosenPatient ? 'pointer' : 'not-allowed' }}
              >
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- NEW: DISCHARGE CONFIRMATION POPUP --- */}
      {showDischargeConfirm && selectedBed && (
        <div className="modal-overlay" style={{zIndex: 9999}}>
          <div className="modal-box" style={{maxWidth: '400px', textAlign: 'center'}} onClick={(e) => e.stopPropagation()}>
            
            <div style={{
              width: '50px', height: '50px', background: '#FEE2E2', 
              borderRadius: '50%', color: '#DC2626', display: 'flex', 
              alignItems: 'center', justifyContent: 'center', margin: '0 auto 15px auto'
            }}>
              <AlertTriangle size={24} />
            </div>
            
            <h3 className="modal-title" style={{justifyContent: 'center'}}>Confirm Discharge</h3>
            
            <p style={{color: '#666', fontSize: '0.95rem', margin: '10px 0 20px 0'}}>
              Are you sure you want to discharge <strong>{selectedBed.users?.first_name} {selectedBed.users?.last_name}</strong>?
              <br/><br/>
              <span style={{fontSize: '0.85rem', color: '#999'}}>
                The bed <strong>{selectedBed.bed_label}</strong> will be marked as "Cleaning".
              </span>
            </p>

            <div className="modal-actions" style={{justifyContent: 'center'}}>
              <button 
                className="btn-cancel" 
                onClick={() => {
                  setShowDischargeConfirm(false);
                  setSelectedBed(null);
                }}
              >
                Cancel
              </button>
              
              <button 
                className="btn-confirm" 
                style={{backgroundColor: '#DC2626', border: 'none'}} 
                onClick={executeDischarge}
              >
                Confirm Discharge
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// --- SUB-COMPONENT FOR BED CARDS ---
const BedCard = ({ bed, onDischargeClick, onMarkReady, onAssign }) => {
  return (
    <div className={`manage-card ${bed.status}`}>
      <div className="card-header">{bed.bed_label}</div>
      <div className="card-body">
        
        {/* CASE: OCCUPIED */}
        {bed.status === 'occupied' && (
          <>
            <div className="patient-icon"><User size={20} /></div>
            <div className="patient-name">
              {bed.users ? `${bed.users.first_name} ${bed.users.last_name}` : 'Unknown'}
            </div>
            {/* UPDATED: Pass the WHOLE bed object, not just ID */}
            <button className="action-btn btn-discharge" onClick={() => onDischargeClick(bed)}>
              Discharge
            </button>
          </>
        )}

        {/* CASE: CLEANING */}
        {bed.status === 'cleaning' && (
          <>
            <div className="status-text">CLEANING</div>
            <button className="action-btn btn-ready" onClick={() => onMarkReady(bed.id)}>
              Mark Ready
            </button>
          </>
        )}

        {/* CASE: AVAILABLE */}
        {bed.status === 'available' && (
          <>
            <div className="status-text">VACANT</div>
            <button className="action-btn btn-assign" onClick={() => onAssign(bed)}>
              Assign
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default BedManagement;