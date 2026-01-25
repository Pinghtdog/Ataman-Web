import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

import DashboardLayout from './layouts/DashboardLayout';
import Overview from './pages/Overview'; 
import BedManagement from './pages/BedManagement';
import Telemed from "./pages/Telemed";
import Charting from "./pages/Charting";
import Settings from "./pages/Settings";
import Login from './pages/Login';           
import AdminDashboard from './pages/AdminDashboard'; 

export default function App() {
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserRole(session.user.id);
      else setLoading(false);
    });

    // auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchUserRole(session.user.id);
      else {
        setUserRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('facility_staff')
        .select('role')
        .eq('user_id', userId)
        .single();
      
      if (error) {
        console.error('Error fetching role:', error);
        setUserRole('staff'); 
      } else if (data) {
        setUserRole(data.role); 
      }
    } catch (err) {
      console.error("Unexpected error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={{padding:'50px', textAlign:'center'}}>Loading ATAMAN...</div>;

  return (
    <BrowserRouter>
      {!session ? (
        <Login setSession={setSession} />
      ) : (
        <Routes>
          <Route path="/" element={<DashboardLayout userRole={userRole} />}>
            <Route index element={<Overview />} /> 
            <Route path="beds" element={<BedManagement />} />
            <Route path="telemed" element={<Telemed />} />
            <Route path="charting" element={<Charting />} />
            <Route path="settings" element={<Settings />} />
            <Route path="admin" element={
              userRole === 'ADMIN' ? <AdminDashboard /> : <Navigate to="/" replace />
            } />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}