import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

import DashboardLayout from "./layouts/DashboardLayout";
import Overview from "./pages/Overview";
import BedManagement from "./pages/BedManagement";
import Telemed from "./pages/Telemed";
import Charting from "./pages/Charting";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import ReferralCenter from "./pages/ReferralCenter";
import ServiceAndFacilities from "./pages/ServiceAndFacilities";

export default function App() {
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserRole(session.user);
      else setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session) fetchUserRole(session.user);
        else {
          setUserRole(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (user) => {
    try {
      const { data } = await supabase
        .from("facility_staff")
        .select("role")
        .eq("user_id", user.id)
        .single();

      setUserRole(data?.role || user.app_metadata?.role || "staff");
    } catch (err) {
      console.error(err);
      setUserRole("staff");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 50, textAlign: "center" }}>Loading ATAMAN...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        {!session && <Route path="*" element={<Login setSession={setSession} />} />}

        {session && (
          <Route path="/" element={<DashboardLayout userRole={userRole} />}>
            <Route index element={<Overview />} />
            <Route path="beds" element={<BedManagement />} />
            <Route path="referrals" element={<ReferralCenter />} />
            <Route path="services" element={<ServiceAndFacilities />} />
            <Route path="telemed" element={<Telemed />} />
            <Route path="charting" element={<Charting />} />
            <Route path="settings" element={<Settings />} />

            <Route
              path="admin"
              element={
                userRole?.toUpperCase() === "ADMIN"
                  ? <AdminDashboard />
                  : <Navigate to="/" replace />
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </BrowserRouter>
  );
}
