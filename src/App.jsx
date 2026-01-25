import { BrowserRouter, Routes, Route } from 'react-router-dom';
import DashboardLayout from './layouts/DashboardLayout';
import Overview from './pages/Overview'; 
import BedManagement from './pages/BedManagement';

//  placeholder
const Beds = () => <div>Bed Management Page</div>;

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<Overview />} /> 
          <Route path="beds" element={<BedManagement />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}