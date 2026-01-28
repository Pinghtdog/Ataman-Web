import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../supabaseClient";

const ServiceAndFacilities = () => {
  const [resources, setResources] = useState([]);
  const [wardOccupancy, setWardOccupancy] = useState([]);
  const [staffCounts, setStaffCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSubCat, setActiveSubCat] = useState("All");
  const supplyChainRef = useRef(null);
  const [facilityId, setFacilityId] = useState(null);

  const fetchData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: staffRecord } = await supabase
        .from("facility_staff")
        .select("facility_id")
        .eq("user_id", user.id)
        .single();

      if (!staffRecord) return;
      const fId = staffRecord.facility_id;
      setFacilityId(fId);

      const { data: resData } = await supabase
        .from("facility_resources")
        .select("*, departments(*)")
        .eq("facility_id", fId)
        .order("resource_type", { ascending: true });

      const { data: bedData } = await supabase
        .from("beds")
        .select("ward_type, status")
        .eq("facility_id", fId);

      const wardStats = (bedData || []).reduce((acc, bed) => {
        const type = bed.ward_type || "General";
        if (!acc[type]) acc[type] = { type, occupied: 0, total: 0 };
        acc[type].total += 1;
        if (bed.status === "occupied") acc[type].occupied += 1;
        return acc;
      }, {});

      const { data: staffData } = await supabase
        .from("facility_staff")
        .select("department_id")
        .eq("facility_id", fId);

      const counts = (staffData || []).reduce((acc, curr) => {
        acc[curr.department_id] = (acc[curr.department_id] || 0) + 1;
        return acc;
      }, {});

      setResources(resData || []);
      setWardOccupancy(Object.values(wardStats));
      setStaffCounts(counts);
      setLoading(false);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
    const resChannel = supabase
      .channel("logistics-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "facility_resources" },
        fetchData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "beds" },
        fetchData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "facility_staff" },
        fetchData,
      )
      .subscribe();

    return () => supabase.removeChannel(resChannel);
  }, []);

  const handleToggle = async (id, currentStatus) => {
    const nextStatus = currentStatus === "ONLINE" ? "OFFLINE" : "ONLINE";
    await supabase
      .from("facility_resources")
      .update({ status: nextStatus })
      .eq("id", id);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setActiveSubCat("All");
  };

  const scrollToSupplyChain = (itemName) => {
    setSearchTerm(itemName);
    setActiveSubCat("All");
    supplyChainRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const criticalItems = resources.filter(
    (r) => r.status === "CRITICAL" || r.status === "OUT OF STOCK",
  );
  const equipment = resources.filter(
    (r) =>
      r.resource_category === "equipment" &&
      r.resource_type.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const supplies = resources.filter((r) => {
    const isSupply = r.resource_category === "supplies";
    const matchesSearch = r.resource_type
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesSub =
      activeSubCat === "All" || r.sub_category === activeSubCat;
    return isSupply && matchesSearch && matchesSub;
  });

  const subCategories = [
    "All",
    "Medications",
    "PPE",
    "First Aid",
    "Nutritional",
    "Sanitation",
  ];

  if (loading)
    return (
      <div className="h-screen flex items-center justify-center bg-white font-mono text-emerald-600 animate-pulse">
        Synchronizing Command Center...
      </div>
    );

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC] text-slate-900 overflow-hidden font-sans">
      {/* 1. TACTICAL HEADER */}
      <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="bg-emerald-600 text-white text-[10px] px-2 py-1 rounded font-black tracking-tighter shadow-sm">
            LOGISTICS
          </span>
          <span className="text-xs font-bold text-slate-400">
            / Live Operations Board
          </span>
        </div>
        <div className="flex items-center gap-3">
          {(searchTerm !== "" || activeSubCat !== "All") && (
            <button
              onClick={clearFilters}
              className="text-[10px] font-black text-emerald-600 uppercase border border-emerald-100 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-all"
            >
              ✕ Clear Search & Filters
            </button>
          )}
          <input
            type="text"
            placeholder="Search Global Assets..."
            className="w-64 pl-4 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] outline-none focus:border-emerald-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </header>

      {/* 2. DASHBOARD CONTENT */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* ROW 1: LIVE DATABASE VITALS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Real Ward Occupancy */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
              Relational Ward Occupancy
            </h3>
            <div className="grid grid-cols-2 gap-x-10 gap-y-5">
              {wardOccupancy.map((ward, i) => {
                const perc = Math.round((ward.occupied / ward.total) * 100);
                return (
                  <div key={i} className="flex flex-col gap-2">
                    <div className="flex justify-between text-[10px] font-black uppercase italic">
                      <span className="text-slate-700">{ward.type}</span>
                      <span
                        className={
                          perc >= 80 ? "text-rose-500" : "text-emerald-500"
                        }
                      >
                        {perc}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-50">
                      <div
                        className={`h-full transition-all duration-700 ${perc >= 80 ? "bg-rose-500" : "bg-emerald-500"}`}
                        style={{ width: `${perc}%` }}
                      />
                    </div>
                    <p className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter">
                      {ward.occupied} / {ward.total} Beds Occupied
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Real Staffing Counts */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto no-scrollbar">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
              Departmental Staffing Matrix
            </h3>
            <div className="flex gap-4">
              {resources
                .filter(
                  (v, i, a) =>
                    a.findIndex(
                      (t) => t.departments?.id === v.departments?.id,
                    ) === i,
                )
                .map((r) => (
                  <div
                    key={r.departments?.id}
                    className="min-w-[130px] bg-slate-50 p-4 rounded-2xl border border-slate-100 group hover:border-emerald-200 transition-all"
                  >
                    <p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-3 truncate">
                      {r.departments?.name || "General"}
                    </p>
                    <p className="text-2xl font-black text-slate-800 tracking-tighter">
                      {staffCounts[r.departments?.id] || 0}
                    </p>
                    <div className="w-8 h-1 bg-emerald-500 rounded-full mt-2 group-hover:w-full transition-all" />
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* SHORTAGE ALERTS */}
        {criticalItems.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 bg-rose-500 rounded-full animate-ping" />{" "}
              Global Shortage Warnings
            </h3>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
              {criticalItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => scrollToSupplyChain(item.resource_type)}
                  className="min-w-[220px] cursor-pointer bg-rose-50 border border-rose-100 p-4 rounded-xl flex justify-between items-center shadow-sm hover:shadow-md transition-all active:scale-95"
                >
                  <div>
                    <p className="text-xs font-black text-rose-900 uppercase leading-tight">
                      {item.resource_type}
                    </p>
                    <p className="text-[9px] text-rose-400 font-bold uppercase tracking-tighter">
                      {item.sub_category}
                    </p>
                  </div>
                  <span className="text-[9px] font-black text-rose-600 bg-rose-100 px-2 py-1 rounded border border-rose-200 uppercase">
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* REGISTRIES */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Medical Equipment Registry */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-[520px] shadow-sm">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="text-[11px] font-black text-slate-700 uppercase tracking-tight">
                Active Medical Equipment Registry
              </h3>
              <span className="text-[9px] font-black text-slate-400 bg-white px-2 py-1 rounded border border-slate-100 uppercase tracking-tighter">
                {equipment.length} Units Counted
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {equipment.map((item) => (
                <div
                  key={item.id}
                  className="p-5 rounded-2xl border border-slate-50 bg-white shadow-sm hover:border-emerald-100 transition-all"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2 h-2 rounded-full ${item.status === "ONLINE" ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-slate-300"}`}
                      />
                      <div>
                        <p className="text-xs font-black text-slate-800 uppercase leading-none mb-1">
                          {item.resource_type}
                        </p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                          {item.sub_text || "Active Asset"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggle(item.id, item.status)}
                      className={`w-10 h-5 rounded-full relative transition-all duration-300 ${item.status === "ONLINE" ? "bg-emerald-500" : "bg-slate-200"}`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all duration-300 shadow-sm ${item.status === "ONLINE" ? "right-0.5" : "left-0.5"}`}
                      />
                    </button>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-slate-50">
                    <span className="text-[10px] font-black text-slate-700 uppercase tracking-tighter">
                      Usage: {item.current_occupied || 0} /{" "}
                      {item.total_capacity} Units
                    </span>
                    <span
                      className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${item.status === "ONLINE" ? "text-emerald-600 bg-emerald-50" : "text-slate-400 bg-slate-50"}`}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Supply Chain Inventory */}
          <div
            ref={supplyChainRef}
            className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-[520px] shadow-sm"
          >
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h3 className="text-[11px] font-black text-slate-700 uppercase">
                  Supply Chain Inventory
                </h3>
                <div className="flex gap-1">
                  {subCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setActiveSubCat(cat)}
                      className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${activeSubCat === cat ? "bg-emerald-600 text-white shadow-md shadow-emerald-200" : "bg-white text-slate-400 border border-slate-200 hover:border-emerald-200"}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] border-b border-slate-50">
                    <th className="pb-3">Asset Item</th>
                    <th className="pb-3">Stock Status</th>
                    <th className="pb-3 text-right">Ops</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {supplies.map((item) => (
                    <tr
                      key={item.id}
                      className="group hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-4">
                        <p className="text-xs font-black text-slate-800 uppercase leading-none mb-1">
                          {item.resource_type}
                        </p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter italic">
                          {item.sub_category}
                        </p>
                      </td>
                      <td className="py-4">
                        <span
                          className={`text-[8px] font-black uppercase px-2 py-1 rounded border ${
                            item.status === "AVAILABLE"
                              ? "text-emerald-600 bg-emerald-50 border-emerald-100"
                              : "text-rose-600 bg-rose-50 border-rose-100"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="py-4 text-right">
                        <button className="text-[8px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-4 py-1.5 rounded-lg uppercase hover:bg-emerald-600 hover:text-white transition-all">
                          Update
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ServiceAndFacilities;
