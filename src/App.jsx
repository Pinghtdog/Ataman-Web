import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardLayout from "./layouts/DashboardLayout";
import Overview from "./pages/Overview";
import Telemed from "./pages/Telemed";
import Charting from "./pages/Charting";
import Settings from "./pages/Settings";

//  placeholder
const Beds = () => <div>Bed Management Page</div>;

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<Overview />} />
          <Route path="beds" element={<Beds />} />
          <Route path="telemed" element={<Telemed />} />
          <Route path="charting" element={<Charting />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
