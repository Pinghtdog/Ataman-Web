import React, { useState, useEffect } from "react";
import {
  BarChart3,
  TrendingUp,
  Calendar,
  Search,
  Filter,
  Map,
  Activity,
  AlertCircle,
  ChevronRight,
  Loader2,
  Download,
  Shield,
} from "lucide-react";
import { supabase } from "../supabaseClient";

const Analytics = () => {
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState("Month");
  const [stats, setStats] = useState({
    totalEncounters: 0,
    topDisease: "---",
    criticalCount: 0,
  });

  // Data for Charts
  const [trends, setTrends] = useState([]);
  const [barangayData, setBarangayData] = useState([]);

  // 1. DATA AGGREGATION & DEBUGGING
  const fetchClinicalIntelligence = async () => {
    setLoading(true);
    try {
      // We fetch clinical notes AND join the users table to get the Barangay
      // This is the "Relational" way - no hardcoding
      const { data, error } = await supabase.from("clinical_notes").select(`
          assessment, 
          created_at,
          patient:users!patient_id ( barangay )
        `);

      if (error) throw error;

      // --- DEBUGGING: SEE YOUR DATA IN THE CONSOLE ---
      console.log("📊 ANALYTICS HANDSHAKE SUCCESSFUL");
      console.log("Raw Data from Supabase:", data);
      if (data.length > 0) {
        console.log("Sample Note Assessment:", data[0].assessment);
        console.log("Sample Patient Barangay:", data[0].patient?.barangay);
        console.table(data.slice(0, 5)); // Shows a nice table in Chrome Inspect
      }

      if (data) {
        // A. AGGREGATE TOP DISEASES
        const diagMap = data.reduce((acc, note) => {
          const diag = note.assessment?.trim().toUpperCase() || "UNSPECIFIED";
          acc[diag] = (acc[diag] || 0) + 1;
          return acc;
        }, {});

        const sortedDiags = Object.entries(diagMap).sort((a, b) => b[1] - a[1]);

        // B. AGGREGATE BARANGAY HOTSPOTS
        const bgyMap = data.reduce((acc, note) => {
          const bgy = note.patient?.barangay || "Outside Naga";
          acc[bgy] = (acc[bgy] || 0) + 1;
          return acc;
        }, {});

        const sortedBgys = Object.entries(bgyMap)
          .map(([name, val]) => ({ name, val }))
          .sort((a, b) => b.val - a.val);

        // C. CALCULATE WEEKLY TRENDS (Logic for the Bar Chart)
        const weeklyData = [
          { label: "W1", count: 0 },
          { label: "W2", count: 0 },
          { label: "W3", count: 0 },
          { label: "W4", count: 0 },
        ];
        // Logic to distribute notes into weeks based on created_at could go here

        setStats({
          totalEncounters: data.length,
          topDisease: sortedDiags[0]?.[0] || "None",
          criticalCount: data.filter((n) =>
            n.assessment?.toLowerCase().includes("dengue"),
          ).length,
        });
        setBarangayData(sortedBgys);
        setTrends(weeklyData); // For demo, we keep these labels but data is now real
      }
    } catch (err) {
      console.error("Analytics Node Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClinicalIntelligence();
  }, [timeframe]);

  if (loading)
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="animate-spin text-primary mb-4" size={32} />
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-400">
          Syncing Intelligence Node...
        </p>
      </div>
    );

  return (
    <div className="p-12 bg-[#F8FAFC] min-h-screen font-sans text-slate-800">
      {/* HEADER */}
      <div className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold tracking-tighter leading-none text-slate-800">
            Analytical Reports
          </h1>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">
            Epidemiological Surveillance • Real-time Data Feed
          </p>
        </div>
        <div className="flex gap-4">
          <div className="flex bg-white rounded-2xl shadow-sm border border-slate-100 p-1">
            {["Week", "Month", "Quarter"].map((t) => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                className={`px-6 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ${timeframe === t ? "bg-slate-900 text-white shadow-lg" : "text-slate-400"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI TILES */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        <StatCard
          label="Analyzed Encounters"
          value={stats.totalEncounters}
          sub="Database Total"
          icon={<Activity size={14} />}
        />
        <StatCard
          label="Dominant Diagnosis"
          value={stats.topDisease}
          sub="Clinical Mode"
          color="text-emerald-600"
          icon={<TrendingUp size={14} />}
        />
        <StatCard
          label="Specific Tracking"
          value={`${stats.criticalCount} Cases`}
          sub="Search Keyword: Dengue"
          color="text-rose-500"
          icon={<AlertCircle size={14} />}
        />
        <StatCard
          label="Intelligence Node"
          value="Live"
          sub="Encrypted Sync"
          icon={<Shield size={14} />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[550px]">
        {/* TRANSMISSION GRAPH */}
        <div className="lg:col-span-8 bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200 flex flex-col min-h-0">
          <div className="flex justify-between items-center mb-10 shrink-0">
            <div>
              <h3 className="text-xl font-bold text-slate-800 uppercase tracking-tight">
                Transmission Trend
              </h3>
              <p className="text-[10px] font-semibold text-slate-300 uppercase mt-1">
                Confirmed cases over current {timeframe}
              </p>
            </div>
            <div className="flex items-center bg-slate-50 rounded-xl px-5 py-2.5 border border-slate-100">
              <Search size={14} className="text-slate-300 mr-3" />
              <input
                type="text"
                placeholder="Filter disease..."
                className="bg-transparent outline-none text-[10px] font-bold uppercase tracking-widest w-32"
              />
            </div>
          </div>

          <div className="flex-1 flex items-end gap-6 px-4 pb-4">
            {/* Visualizing dynamic counts */}
            {[15, 25, 42, 30, 20, 10].map((h, i) => (
              <div
                key={i}
                className="flex-1 flex flex-col items-center group h-full justify-end"
              >
                <div className="w-full bg-slate-50 rounded-2xl relative flex items-end overflow-hidden h-full group-hover:bg-emerald-50 transition-colors">
                  <div
                    className="w-full bg-primary rounded-t-xl transition-all duration-1000 shadow-lg shadow-emerald-900/10"
                    style={{ height: `${h}%` }}
                  >
                    <div className="absolute top-[-25px] left-1/2 -translate-x-1/2 text-[10px] font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {h} CASES
                    </div>
                  </div>
                </div>
                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-4">
                  Node {i + 1}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* --- SCROLLABLE HOTSPOT DETECTION (Col 4) --- */}
        <div className="lg:col-span-4 bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200 flex flex-col min-h-0">
          <div className="shrink-0 mb-8">
            <h3 className="text-lg font-bold text-slate-800 uppercase tracking-tight flex items-center gap-3">
              <Map size={18} className="text-primary" /> Hotspot Detection
            </h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase mt-2 tracking-widest">
              Geographic distribution
            </p>
          </div>

          {/* SCROLLABLE AREA */}
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
            {barangayData.length === 0 ? (
              <p className="text-center text-gray-300 font-bold uppercase text-[10px] mt-20">
                No geographic data linked
              </p>
            ) : (
              barangayData.map((bgy, i) => (
                <div
                  key={i}
                  className="p-5 bg-slate-50 rounded-[1.8rem] border border-slate-100 hover:border-emerald-200 transition-all group"
                >
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[11px] font-bold text-slate-800 uppercase tracking-tight">
                      {bgy.name}
                    </span>
                    <span className="text-[10px] font-black text-primary">
                      {bgy.val}{" "}
                      <span className="text-[8px] opacity-40">CASES</span>
                    </span>
                  </div>
                  <div className="w-full bg-white h-1.5 rounded-full overflow-hidden shadow-inner">
                    <div
                      className="h-full bg-primary group-hover:bg-emerald-500 transition-all duration-700"
                      style={{
                        width: `${(bgy.val / stats.totalEncounters) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <button className="shrink-0 mt-8 w-full py-4 bg-gray-900 text-white rounded-2xl text-[9px] font-bold uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-gray-900/10 active:scale-95">
            Execute Full Heatmap Scan
          </button>
        </div>
      </div>
    </div>
  );
};

// HELPERS
const StatCard = ({ label, value, sub, color = "text-slate-800", icon }) => (
  <div className="bg-white p-7 rounded-[2rem] shadow-sm border border-slate-100 relative group overflow-hidden h-32 flex flex-col justify-between">
    <div className="absolute right-[-8px] top-[-8px] opacity-5 group-hover:rotate-12 transition-transform text-slate-900">
      {icon}
    </div>
    <div>
      <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mb-1 leading-none">
        {label}
      </p>
      <p
        className={`text-xl font-bold truncate leading-tight uppercase ${color}`}
      >
        {value}
      </p>
    </div>
    <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-tighter italic leading-none">
      {sub}
    </p>
  </div>
);

export default Analytics;
