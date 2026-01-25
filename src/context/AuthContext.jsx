import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [staffProfile, setStaffProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // active sessions, sets the user
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchStaffProfile(session.user.id);
      }
      setLoading(false);
    };

    getSession();

    // Listen for changes on auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchStaffProfile(session.user.id);
      } else {
        setStaffProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchStaffProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('facility_staff')
        .select('*, facilities(*)')
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      setStaffProfile(data);
    } catch (error) {
      console.error('Error fetching staff profile:', error.message);
      setStaffProfile(null);
    }
  };

  const signOut = () => supabase.auth.signOut();

  const value = {
    user,
    staffProfile,
    loading,
    signOut,
    isAdmin: staffProfile?.role === 'ADMIN',
    isDoctor: staffProfile?.role === 'DOCTOR',
    isNurse: staffProfile?.role === 'NURSE',
    isDispatcher: staffProfile?.role === 'DISPATCHER',
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
