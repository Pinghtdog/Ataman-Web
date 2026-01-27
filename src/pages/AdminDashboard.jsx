import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { CheckCircle, AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import './Overview.css'; 

const AdminDashboard = () => {
  // Form State
  const [newBedLabel, setNewBedLabel] = useState('');
  const [wardType, setWardType] = useState('General'); 
  const [facilityId, setFacilityId] = useState(2); 

  // Data State
  const [beds, setBeds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Popup State
  const [modal, setModal] = useState({ show: false, type: '', message: '' });

  // 1. FETCH BEDS
  const fetchBeds = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('beds')
      .select('*')
      .order('bed_label', { ascending: true }); // Sort alphabetically

    if (error) console.error('Error fetching beds:', error);
    else setBeds(data || []);
    setIsLoading(false);
  };

  // Load beds on mount
  useEffect(() => {
    fetchBeds();
  }, []);

  // 2. ADD BED
  const handleAddBed = async (e) => {
    e.preventDefault();
    
    const { error } = await supabase
      .from('beds')
      .insert([{ 
          bed_label: newBedLabel, 
          status: 'available', 
          ward_type: wardType,
          facility_id: facilityId 
      }]);

    if (error) {
      setModal({ show: true, type: 'error', message: 'Error adding bed: ' + error.message });
    } else {
      setModal({ show: true, type: 'success', message: `Bed ${newBedLabel} added successfully!` });
      setNewBedLabel('');
      fetchBeds(); // Refresh list immediately
    }
  };

  // 3. DELETE BED
  const handleDeleteBed = async (id, label) => {
    // Simple browser confirm for safety
    if (!window.confirm(`Are you sure you want to permanently delete bed ${label}?`)) return;

    const { error } = await supabase
      .from('beds')
      .delete()
      .eq('id', id);

    if (error) {
      setModal({ show: true, type: 'error', message: 'Failed to delete: ' + error.message });
    } else {
      // Don't show a full popup for delete, just refresh the list
      fetchBeds(); 
    }
  };

  const closeModal = () => {
    setModal({ ...modal, show: false });
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Admin Settings</h2>
      
      <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        
        {/* --- SECTION 1: ADD NEW BED --- */}
        <div className="section-container" style={{ flex: 1, minWidth: '300px', maxWidth: '400px' }}>
          <h4 className="section-title">Add New Bed</h4>
          
          <form onSubmit={handleAddBed} style={{ display:'flex', flexDirection:'column', gap:'15px', marginTop:'20px' }}>
              <div>
                <label style={{ display:'block', marginBottom:'5px', fontWeight:'600', fontSize:'0.9rem' }}>Bed Label</label>
                <input 
                  type="text" 
                  placeholder="e.g. ER-05" 
                  value={newBedLabel}
                  onChange={e => setNewBedLabel(e.target.value)}
                  className="modal-input"
                  required 
                />
              </div>
              
              <div>
                <label style={{ display:'block', marginBottom:'5px', fontWeight:'600', fontSize:'0.9rem' }}>Ward Section</label>
                <select 
                  value={wardType} 
                  onChange={e => setWardType(e.target.value)}
                  className="modal-input"
                  style={{ backgroundColor:'white' }}
                >
                  <option value="ER">Emergency Room</option>
                  <option value="General">General Ward</option>
                  <option value="ICU">Intensive Care Unit</option>
                  <option value="Pediatrics">Pediatrics</option>
                  <option value="Maternity">Maternity</option>
                  <option value="Surgery">Surgery</option>
                </select>
              </div>

              <button className="btn-confirm" style={{ marginTop:'10px' }}>
                + Add Bed to System
              </button>
          </form>
        </div>

        {/* --- SECTION 2: REMOVE BEDS (NEW) --- */}
        <div className="section-container" style={{ flex: 1, minWidth: '300px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h4 className="section-title" style={{ margin: 0 }}>Manage Existing Beds</h4>
            <button onClick={fetchBeds} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666' }} title="Refresh List">
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead style={{ background: '#f9fafb', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #eee' }}>Label</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #eee' }}>Ward</th>
                  <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #eee' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #eee' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {beds.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#999' }}>No beds found.</td>
                  </tr>
                ) : (
                  beds.map(bed => (
                    <tr key={bed.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '12px', fontWeight: 'bold', color: '#333' }}>{bed.bed_label}</td>
                      <td style={{ padding: '12px', color: '#666' }}>{bed.ward_type}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 'bold',
                          backgroundColor: bed.status === 'occupied' ? '#FEE2E2' : '#ECFDF5',
                          color: bed.status === 'occupied' ? '#B91C1C' : '#047857'
                        }}>
                          {bed.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <button 
                          onClick={() => handleDeleteBed(bed.id, bed.bed_label)}
                          style={{ 
                            background: '#FEE2E2', border: 'none', borderRadius: '6px', 
                            padding: '6px', cursor: 'pointer', color: '#DC2626',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                          }}
                          title="Remove Bed"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* --- SUCCESS / ERROR MODAL --- */}
      {modal.show && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-box" style={{ maxWidth: '400px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            
            <div style={{
              width: '60px', height: '60px', 
              background: modal.type === 'success' ? '#D1FAE5' : '#FEE2E2', 
              borderRadius: '50%', 
              color: modal.type === 'success' ? '#059669' : '#DC2626', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', 
              margin: '0 auto 15px auto'
            }}>
              {modal.type === 'success' ? <CheckCircle size={32} /> : <AlertTriangle size={32} />}
            </div>
            
            <h3 className="modal-title" style={{ justifyContent: 'center', fontSize:'1.25rem' }}>
              {modal.type === 'success' ? 'Success!' : 'Error'}
            </h3>
            
            <p style={{ color: '#666', fontSize: '0.95rem', margin: '10px 0 25px 0' }}>
              {modal.message}
            </p>

            <button 
              className="btn-confirm" 
              style={{
                width: '100%', 
                backgroundColor: modal.type === 'success' ? '#059669' : '#DC2626',
                border: 'none'
              }} 
              onClick={closeModal}
            >
              OK
            </button>

          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;