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
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserRole(session.user);
      else setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchUserRole(session.user);
      else {
        setUserRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (user) => {
    try {
      // 1. Check your public.facility_staff table first
      const { data, error } = await supabase
        .from("facility_staff")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setUserRole(data.role);
      } else {
        // 2. FALLBACK: Check the metadata you set via SQL earlier
        const metaRole = user.app_metadata?.role;
        setUserRole(metaRole || "staff");
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setUserRole("staff");
    } finally {
      setLoading(false);
    }
  };

  if (loading)
    return (
      <div style={{ padding: "50px", textAlign: "center" }}>
        Loading ATAMAN...
      </div>
    );

  return (
    <BrowserRouter>
      <Routes>
        {/* Unauthenticated Route */}
        {!session ? (
          <Route path="*" element={<Login setSession={setSession} />} />
        ) : (
          /* Authenticated Routes Wrapper */
          <Route path="/" element={<DashboardLayout userRole={userRole} />}>
            <Route index element={<Overview />} />
            <Route path="beds" element={<BedManagement />} />
            <Route path="referrals" element={<ReferralCenter />} />
            <Route path="services" element={<ServiceAndFacilities />} />
            <Route path="telemed" element={<Telemed />} />
            <Route path="charting" element={<Charting />} />
            <Route path="settings" element={<Settings />} />

            {/* Protected Admin Route */}
            <Route
              path="admin"
              element={
                userRole?.toUpperCase() === "ADMIN" ? (
                  <AdminDashboard />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />

            {/* Catch-all inside the layout */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </BrowserRouter>
  );
}
