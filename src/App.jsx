import { BrowserRouter, Routes, Route } from 'react-router-dom';
import DashboardLayout from './layouts/DashboardLayout';
import Overview from './pages/Overview'; 
import ReferralCenter from './pages/ReferralCenter'; 
import ServiceAndFacilities from './pages/ServiceAndFacilities'; 

// Placeholders
const BedManagement = () => <div className="p-4">Bed Management Page (Work in Progress)</div>;
const Telemed = () => <div className="p-4">Telemedicine Hub (Work in Progress)</div>;
const Charting = () => <div className="p-4">Digital Charting (Work in Progress)</div>;
const Settings = () => <div className="p-4">Settings (Work in Progress)</div>;

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<Overview />} /> 
          <Route path="beds" element={<BedManagement />} />
          <Route path="referrals" element={<ReferralCenter />} />
          <Route path="services" element={<ServiceAndFacilities />} />
          <Route path="telemed" element={<Telemed />} />
          <Route path="charting" element={<Charting />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}