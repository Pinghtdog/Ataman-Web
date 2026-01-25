import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { X } from 'lucide-react';
import './Overview.css';

const Overview = () => {
  const [beds, setBeds] = useState([]);
  const [selectedBed, setSelectedBed] = useState(null);
  const [loading, setLoading] = useState(true);

// Stats State
  const [stats, setStats] = useState({
    erOccupancy: 0, erTotal: 0, erOccupied: 0,
    wardOccupancy: 0, wardTotal: 0, wardOccupied: 0,
    referrals: 4 // Static for now
  });

// Fetch Beds 
   const fetchBeds = async () => {
    const { data, error } = await supabase
      .from('beds')
      .select(`*, users ( first_name, last_name, medical_conditions, birth_date, gender, blood_type )`)
      .order('id', { ascending: true });

    if (!error) {
      setBeds(data || []);
      calculateStats(data || []);
    }
    setLoading(false);
  };

  const calculateAge = (birthDateString) => {
    if (!birthDateString) return 'N/A';
    const today = new Date();
    const birthDate = new Date(birthDateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };


  const calculateStats = (data) => {
    const erBeds = data.filter(b => b.ward_type === 'ER');
    const genBeds = data.filter(b => b.ward_type === 'General');
    // er
    const erTotal = erBeds.length;
    const erOcc = erBeds.filter(b => b.status === 'occupied').length;
    const erRate = erTotal > 0 ? Math.round((erOcc / erTotal) * 100) : 0;
    // ward
    const wardTotal = genBeds.length;
    const wardOcc = genBeds.filter(b => b.status === 'occupied').length;
    const wardRate = wardTotal > 0 ? Math.round((wardOcc / wardTotal) * 100) : 0;

    setStats(prev => ({
      ...prev,
      erOccupancy: erRate, erTotal, erOccupied: erOcc,
      wardOccupancy: wardRate, wardTotal, wardOccupied: wardOcc
    }));
  };

  useEffect(() => {
    fetchBeds();
    const channel = supabase.channel('overview').on('postgres_changes', { event: '*', schema: 'public', table: 'beds' }, fetchBeds).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // helpers
  const erBeds = beds.filter(b => b.ward_type === 'ER');
  const gwBeds = beds.filter(b => b.ward_type === 'General');

  return (
    <div>
      {/* STATUS BAR */}
      <div className="status-bar">
        <span className="status-pill">Status: Normal Operations</span>
      </div>

      {/* KPI CARDS */}
      <div className="kpi-grid">
        
        <div className={`kpi-card ${
            stats.erOccupancy >= 80 ? 'critical' : 
            stats.erOccupancy >= 50 ? 'warning' : 
            'stable'
        }`}>
          {/* er occupancy */}
          <h3>ER Occupancy</h3>
          <div className="kpi-value">{stats.erOccupancy}%</div>
          <div className="kpi-status">
            {stats.erOccupancy >= 90 
              ? `Critical: Only ${stats.erTotal - stats.erOccupied} beds left` 
              : `${stats.erOccupied} occupied / ${stats.erTotal} total`}
          </div>
        </div>

        { /* gen ward occupancy */ }
       <div className={`kpi-card ${
            stats.wardOccupancy >= 80 ? 'critical' : 
            stats.wardOccupancy >= 50 ? 'warning' : 
            'stable'
        }`}>
          <h3>General Ward</h3>
          <div className="kpi-value">{stats.wardOccupancy}%</div>
          <div className="kpi-status">
            {stats.wardOccupied} occupied / {stats.wardTotal} total
          </div>
       </div>

        {/* REFERRALS static*/}
        <div className="kpi-card warning">
          <h3>Pending Incoming Referrals</h3>
          <div className="kpi-value">{stats.referrals}</div>
          <div className="kpi-status">Action required</div>
        </div>
      </div>

      {/* MAIN CONTENT SPLIT */}
      <div className="content-split">
        
       {/* trackers */}
    <div className="section-container">
      <div className="section-header">
        <h4 className="section-title">Live Bed Tracker</h4>
        <div className="legend">
          <span><div className="dot" style={{background:'#B71C1C'}}></div> Occupied</span>
          <span><div className="dot" style={{background:'#F59E0B'}}></div> Pending</span>
          <span><div className="dot" style={{background:'#004D40'}}></div> Avail</span>
        </div>
      </div>

  {/*er */}
  <h5 style={{ 
      margin: '20px 0 10px 0', 
      color: '#4B5563', 
      borderBottom: '1px solid #eee', 
      paddingBottom: '5px' 
  }}>
    Emergency Room ({erBeds.length})
  </h5>
  
  <div className="bed-grid">
    {erBeds.map(bed => (
      <div 
        key={bed.id} 
        className={`bed-box ${bed.status}`} 
        onClick={() => setSelectedBed(bed)}
      >
        {bed.bed_label}
      </div>
    ))}
    {erBeds.length === 0 && <p style={{color: '#999', fontSize: '0.9rem'}}>No ER beds found.</p>}
  </div>

  {/* gen ward */}
  <h5 style={{ 
      margin: '30px 0 10px 0', 
      color: '#4B5563', 
      borderBottom: '1px solid #eee', 
      paddingBottom: '5px' 
  }}>
    General Ward ({gwBeds.length})
  </h5>

  <div className="bed-grid">
    {gwBeds.map(bed => (
      <div 
        key={bed.id} 
        className={`bed-box ${bed.status}`} 
        onClick={() => setSelectedBed(bed)}
      >
        {bed.bed_label}
      </div>
    ))}
    {gwBeds.length === 0 && <p style={{color: '#999', fontSize: '0.9rem'}}>No Ward beds found.</p>}
  </div>

</div>

        {/*referrals static*/}
        <div className="section-container">
          <div className="section-header">
            <div>
              <h4 className="section-title">Incoming Referrals</h4>
              <small style={{color: '#6B7280'}}>Patients transferred digitally</small>
            </div>
          </div>
          <div className="referral-list">
             <div style={{padding:'20px', color:'#999'}}>No new referrals</div>
          </div>
        </div>
      </div>

      {/*popups */}
      {selectedBed && (
        <div className="modal-overlay" onClick={() => setSelectedBed(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{margin: 0}}>Bed: {selectedBed.bed_label}</h2>
              <button className="close-btn" onClick={() => setSelectedBed(null)}>
                <X size={24} />
              </button>
            </div>

            <div className="detail-row">
              <span className="detail-label">Status</span>
              <span className={`status-badge ${selectedBed.status}`} style={{
                backgroundColor: selectedBed.status === 'occupied' ? '#FEE2E2' : '#E0F2F1',
                color: selectedBed.status === 'occupied' ? '#B91C1C' : '#00695C',
                width: 'fit-content'
              }}>
                {selectedBed.status}
              </span>
            </div>

            {selectedBed.users ? (
              <>
                <div className="detail-row">
                  <span className="detail-label">Patient Name</span>
                  <span className="detail-value">
                    {selectedBed.users.first_name} {selectedBed.users.last_name}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Diagnosis / Conditions</span>
                  <span className="detail-value">{selectedBed.users.medical_conditions || 'None listed'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Details</span>
                  <span className="detail-value">
                    {[
                      `${calculateAge(selectedBed.users.birth_date)} yrs old`,
                      selectedBed.users.gender,
                      selectedBed.users.blood_type
                    ].filter(Boolean).join(' • ')}
                  </span>
                </div>
              </>
            ) : (
              <p style={{color: '#6B7280', padding: '20px 0'}}>
                This bed is currently empty.
              </p>
            )}

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSelectedBed(null)}>Close</button>
              
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Overview;