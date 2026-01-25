import React, { use, useState } from 'react';
import './Overview.css';
import { supabase } from '../supabaseClient';

const Overview = () => {
  const [beds, setBeds] = useState([]);
  const [selectedBed, setSelectedBed] = useState(null);
  const [loading, setLoading] = useState(true);

const fetchBeds = async () => {
    const { data, error } = await supabase
      .from('beds')
      .select('*, patients(name, condition, age, gender)').order('id', { ascending: true });


    if (error) {
      console.error('Error fetching beds:', error);
    } else {
      setBeds(data);
    }  
    setLoading(false);
};



  return (
    <div>
      {/* 1. Status Bar */}
      <div className="status-bar">
        <span className="status-pill">Status: Normal Operations</span>
      </div>

      {/* 2. KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card critical">
          <h3>ER Occupancy</h3>
          <div className="kpi-value">92%</div>
          <div className="kpi-status">Critical Level: Only 3 beds left</div>
        </div>

        <div className="kpi-card stable">
          <h3>General Ward</h3>
          <div className="kpi-value">65%</div>
          <div className="kpi-status">Stable: 45 beds available</div>
        </div>

        <div className="kpi-card warning">
          <h3>Pending Incoming Referrals</h3>
          <div className="kpi-value">4</div>
          <div className="kpi-status">Action required</div>
        </div>
      </div>

      {/* 3. Main Split View */}
      <div className="content-split">
        
        {/* Left: Bed Tracker */}
        <div className="section-container">
          <div className="section-header">
            <h4 className="section-title">Live ER Bed Tracker</h4>
            <div className="legend">
              <span><div className="dot" style={{background: '#B71C1C'}}></div> Occupied</span>
              <span><div className="dot" style={{background: '#F9A825'}}></div> Pending Discharge</span>
              <span><div className="dot" style={{background: '#004D40'}}></div> Available</span>
            </div>
          </div>

          <div className="bed-grid">
            {beds.map((bed) => (
              <div key={bed.id} className={`bed-box ${bed.status}`}>
                {bed.id}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Incoming Referrals */}
        <div className="section-container">
          <div className="section-header">
            <div>
              <h4 className="section-title">Incoming Referrals</h4>
              <small style={{color: '#6B7280'}}>Patients transferred digitally</small>
            </div>
          </div>

          <div className="referral-list">
            {/* Patient 1 */}
            <div className="referral-card">
              <button className="accept-btn">Accept</button>
              <span className="patient-name">Juan Dela Cruz</span>
              <span className="referral-info">From: Cararayan Health Center</span>
              <span className="reason-tag">Reason: Acute Appendicitis</span>
            </div>

            {/* Patient 2 */}
            <div className="referral-card">
              <button className="accept-btn">Accept</button>
              <span className="patient-name">Maria Clara</span>
              <span className="referral-info">From: Bicol Access Health</span>
              <span className="reason-tag" style={{background:'#E0F2F1', color:'#00695C'}}>Reason: Stable Transport</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Overview;