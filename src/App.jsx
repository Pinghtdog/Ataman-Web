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
import AssistedBooking from "./pages/AssistedBooking";

export default function App() {
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(true); // fade state

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserRole(session.user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchUserRole(session.user);
      else setUserRole(null);
    });

    return () => subscription.unsubscribe();
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
    }
  };

  useEffect(() => {
    const fadeTimer = setTimeout(() => setVisible(false), 1000);
    const hideTimer = setTimeout(() => setLoading(false), 1000);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (loading) {
    return (
      /* Changed fixed, inset-0, and z-50 to cover the whole screen */
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white font-sans text-emerald-600">
        <div className="relative mb-6 flex items-center justify-center">
          {/* Subtle Green Pulse */}
          <div className="absolute h-16 w-16 animate-ping rounded-full bg-emerald-100 opacity-75"></div>

          {/* Main Emerald Spinner */}
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600"></div>
        </div>

        <div className="space-y-2 text-center">
          <h2 className="text-lg font-bold tracking-tight">
            WELCOME TO ATAMAN
          </h2>

          <div className="flex items-center justify-center gap-2">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400"></span>
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:0.2s]"></span>
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:0.4s]"></span>
          </div>

          <p className="pt-4 text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-800/40">
            "An pag-uswag nin banwaan nagsasarabot sa gabos." — Bicolano Proverb
          </p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {!session && (
          <Route path="*" element={<Login setSession={setSession} />} />
        )}
        {session && (
          <Route path="/" element={<DashboardLayout userRole={userRole} />}>
            <Route index element={<Overview />} />
            <Route path="beds" element={<BedManagement />} />
            <Route path="referrals" element={<ReferralCenter />} />
            <Route path="services" element={<ServiceAndFacilities />} />
            <Route path="telemed" element={<Telemed />} />
            <Route path="charting" element={<Charting />} />
            <Route path="settings" element={<Settings />} />
            <Route path="assisted-booking" element={<AssistedBooking />} />

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

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </BrowserRouter>
  );
}
