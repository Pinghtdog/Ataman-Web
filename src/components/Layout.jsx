import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Settings, 
  LogOut, 
  Bell,
  Hospital
} from 'lucide-react';

export default function Layout() {
  const { staffProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Referrals', href: '/referrals', icon: FileText },
    { name: 'Patients', href: '/patients', icon: Users },
    { name: 'Facility Settings', href: '/settings', icon: Settings },
  ];

  return (
      ),
}
