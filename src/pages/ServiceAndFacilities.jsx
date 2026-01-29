import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../supabaseClient";

const ServiceAndFacilities = () => {
  const [resources, setResources] = useState([]);
  const [wardOccupancy, setWardOccupancy] = useState([]);
  const [staffCounts, setStaffCounts] = useState({});
  const [activeOccupants, setActiveOccupants] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSubCat, setActiveSubCat] = useState("All");
  const [isAssigning, setIsAssigning] = useState(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState([]);
  const [tick, setTick] = useState(0);

  const supplyChainRef = useRef(null);
  const facilityId = 1;

  const calculateDuration = (startTime) => {
    if (!startTime) return "---";
    const start = new Date(startTime);
    const now = new Date();
    const diffInMs = now - start;
    const diffInMins = Math.floor(diffInMs / (1000 * 60));

    if (diffInMins < 1) return "< 1m"; // Shows immediate feedback

    if (diffInMins >= 60) {
      const hours = Math.floor(diffInMins / 60);
      const mins = diffInMins % 60;
      return `${hours}h ${mins}m`;
    }
    return `${diffInMins}m`;
  };

  const searchPatients = async (term) => {
    setPatientSearch(term);
    if (term.length < 2) return setPatientResults([]);

    const { data } = await supabase
      .from("users")
      .select("id, first_name, last_name, medical_id")
      .ilike("first_name", `%${term}%`)
      .limit(5);

    setPatientResults(data || []);
  };

  const handleAssign = async (userId, resourceId) => {
    const { error } = await supabase.from("resource_assignments").insert([
      {
        user_id: userId,
        resource_id: resourceId,
        facility_id: facilityId,
        assigned_at: new Date().toISOString(),
      },
    ]);

    if (!error) {
      setIsAssigning(null);
      setPatientSearch("");
      fetchData(); // Trigger UI refresh
    } else {
      console.error("Assignment Failed:", error.message);
    }
  };

  const handleRelease = async (userId, resourceId) => {
    if (
      !window.confirm(
        "Are you sure you want to release this patient from the unit?",
      )
    )
      return;

    const { error } = await supabase
      .from("resource_assignments")
      .delete()
      .eq("user_id", userId)
      .eq("resource_id", resourceId);

    if (error) {
      console.error("Release Failed:", error.message);
      alert("Error releasing unit: " + error.message);
    } else {
      fetchData();
    }
  };

  const fetchData = async () => {
    const { data: resData } = await supabase
      .from("facility_resources")
      .select("*, departments(*)")
      .eq("facility_id", facilityId)
      .order("resource_type", { ascending: true });

    const { data: occupantData } = await supabase
      .from("resource_assignments")
      .select(
        "resource_id, user_id, assigned_at, users(first_name, last_name, medical_id)",
      ) // Added assigned_at
      .eq("facility_id", facilityId);

    const occupantMap = (occupantData || []).reduce((acc, curr) => {
      // Add this guard: only add to map if the user actually exists
      if (curr.users) {
        acc[curr.resource_id] = {
          user_id: curr.user_id,
          // Use optional chaining (?.) just to be ultra-safe
          name: `${curr.users?.first_name || "Unknown"} ${curr.users?.last_name || "Patient"}`,
          medical_id: curr.users?.medical_id || "N/A",
          assigned_at: curr.assigned_at,
        };
      }
      return acc;
    }, {});

    const { data: bedData } = await supabase
      .from("beds")
      .select("ward_type, status")
      .eq("facility_id", facilityId);

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
      .eq("facility_id", facilityId);

    const counts = (staffData || []).reduce((acc, curr) => {
      acc[curr.department_id] = (acc[curr.department_id] || 0) + 1;
      return acc;
    }, {});

    setResources(resData || []);
    setWardOccupancy(Object.values(wardStats));
    setStaffCounts(counts);
    setActiveOccupants(occupantMap);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const resChannel = supabase
      .channel("ncgh-logistics-sync")
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
        { event: "*", schema: "public", table: "referrals" },
        fetchData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "facility_staff" },
        fetchData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "resource_assignments" },
        fetchData,
      )
      .subscribe();

    return () => supabase.removeChannel(resChannel);
  }, []);

  useEffect(() => {
    const timerInterval = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 60000);

    return () => clearInterval(timerInterval);
  }, []);

  const handleToggleCapacity = async (item) => {
    const isFull = item.current_occupied >= item.total_capacity;
    const nextStatus =
      item.status === "ONLINE" ? "OFFLINE" : isFull ? "OFFLINE" : "ONLINE";

    await supabase
      .from("facility_resources")
      .update({ status: nextStatus })
      .eq("id", item.id);
  };

  // Alias to prevent JSX reference error (NO logic change)
  const handleToggle = (id, status) => {
    const item = resources.find((r) => r.id === id);
    if (item) handleToggleCapacity(item);
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

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-white font-sans text-emerald-600">
        <div className="relative mb-6 flex items-center justify-center">
          <div className="absolute h-16 w-16 animate-ping rounded-full bg-emerald-100 opacity-75" />
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" />
        </div>
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-bold tracking-tight">
            Syncing Services and Facilities...
          </h2>

          <div className="flex items-center justify-center gap-2">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400"></span>
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:0.2s]"></span>
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:0.4s]"></span>
          </div>

          <p className="pt-4 text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-800/40">
            Ataman Security Protocol Active
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC] text-slate-900 overflow-hidden font-sans">
      <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="bg-emerald-600 text-white text-[10px] px-2 py-1 rounded font-black tracking-tighter shadow-sm">
            NCGH LOGISTICS
          </span>
          <span className="text-xs font-bold text-slate-400">
            Live Operations Board
          </span>
        </div>
        <div className="flex items-center gap-3">
          {(searchTerm !== "" || activeSubCat !== "All") && (
            <button
              onClick={clearFilters}
              className="text-[10px] font-black text-emerald-600 uppercase border border-emerald-100 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-all"
            >
              ✕ Clear Filters
            </button>
          )}
          <input
            type="text"
            placeholder="Search assets..."
            className="w-64 pl-4 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] outline-none focus:border-emerald-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* ROW 1: VITALS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
              Departmental Staffing Matrix
            </h3>
            <div className="overflow-x-auto no-scrollbar">
              <div className="flex gap-4 pr-6">
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
                      className="min-w-[150px] flex-shrink-0 bg-slate-50 p-5 rounded-2xl border border-slate-100 group hover:border-emerald-200 transition-all"
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
        </div>

        {/* SHORTAGE ALERTS */}
        {criticalItems.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 bg-rose-500 rounded-full animate-ping" />{" "}
              Shortage Warnings
            </h3>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
              {criticalItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => scrollToSupplyChain(item.resource_type)}
                  className="min-w-[240px] cursor-pointer bg-rose-50 border border-rose-100 p-4 rounded-xl flex justify-between items-center shadow-sm hover:shadow-md transition-all active:scale-95"
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
              {equipment.map((item) => {
                const occupant = activeOccupants[item.id];
                const isOccupied = !!occupant;
                const isMaintenance = item.status === "OFFLINE";

                return (
                  <div
                    key={item.id}
                    className={`p-5 rounded-[2rem] border transition-all ${
                      isMaintenance
                        ? "bg-slate-50 border-slate-200 opacity-75"
                        : isOccupied
                          ? "bg-white border-rose-100 shadow-sm"
                          : "bg-white border-emerald-100 shadow-sm"
                    }`}
                  >
                    {/* TOP SECTION: UNIT INFO & ACTIONS */}
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            isMaintenance
                              ? "bg-slate-400"
                              : isOccupied
                                ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                                : "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                          }`}
                        />

                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                              {item.resource_type}
                            </h4>
                            <span className="text-[10px] bg-slate-900 text-white px-2 py-0.5 rounded-md font-black italic">
                              {item.unit_label || "UNIT-A"}
                            </span>
                          </div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                            {isMaintenance
                              ? "Under Maintenance"
                              : isOccupied
                                ? `User: ${occupant.name}`
                                : "Ready for Patient"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isMaintenance && !isOccupied && (
                          <button
                            onClick={() => setIsAssigning(item.id)}
                            className="bg-emerald-600 text-white text-[10px] font-black px-5 py-2 rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 active:scale-95"
                          >
                            USE UNIT
                          </button>
                        )}

                        {isOccupied && (
                          <button
                            onClick={() =>
                              handleRelease(occupant.user_id, item.id)
                            }
                            className="bg-rose-50 text-rose-600 border border-rose-100 text-[10px] font-black px-5 py-2 rounded-xl hover:bg-rose-600 hover:text-white transition-all active:scale-95"
                          >
                            DONE
                          </button>
                        )}

                        <button
                          onClick={() => handleToggle(item.id, item.status)}
                          className={`p-2 rounded-xl border transition-all ${
                            isMaintenance
                              ? "bg-slate-800 border-slate-800 text-white"
                              : "bg-white border-slate-200 text-slate-400 hover:border-slate-800 hover:text-slate-800"
                          }`}
                        >
                          🔧
                        </button>
                      </div>
                    </div>

                    {/* BOTTOM SECTION: PATIENT DATA & TIMER (HORIZONTAL LAYOUT) */}
                    {isOccupied && !isMaintenance && (
                      <div className="mt-4 pt-3 border-t border-slate-50 flex justify-between items-center animate-in fade-in slide-in-from-top-1">
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
                              Medical ID
                            </span>
                            <span className="text-[10px] font-bold text-slate-700 tracking-tight">
                              {occupant.medical_id}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-xl">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[10px] font-black text-emerald-700 uppercase tracking-tighter">
                            Active: {calculateDuration(occupant.assigned_at)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* SEARCH OVERLAY */}
                    {isAssigning === item.id && (
                      <div className="mt-4 p-4 bg-slate-100 rounded-2xl animate-in zoom-in duration-200">
                        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-[0.3em] mb-3">
                          Assign Patient to {item.unit_label}
                        </p>
                        <input
                          autoFocus
                          className="w-full bg-white text-slate-800 p-3 text-xs rounded-xl border border-slate-300 outline-none mb-2 placeholder:text-slate-400"
                          placeholder="Type Name or Medical ID..."
                          value={patientSearch}
                          onChange={(e) => searchPatients(e.target.value)}
                        />
                        <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                          {patientResults.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => handleAssign(p.id, item.id)}
                              className="w-full text-left p-3 text-[10px] font-black uppercase text-slate-700 bg-slate-200/50 border border-slate-300 rounded-xl hover:bg-emerald-200 hover:text-slate-900 hover:border-emerald-300 transition-all"
                            >
                              {p.first_name} {p.last_name} — {p.medical_id}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setIsAssigning(null)}
                          className="w-full mt-3 text-[9px] font-black text-slate-500 uppercase hover:text-rose-400 transition-colors"
                        >
                          Cancel Search
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Supply Chain Table */}
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
                      className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${activeSubCat === cat ? "bg-emerald-600 text-white shadow-md" : "bg-white text-slate-400 border border-slate-200"}`}
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
                          className={`text-[8px] font-black uppercase px-2 py-1 rounded border ${item.status === "AVAILABLE" ? "text-emerald-600 bg-emerald-50 border-emerald-100" : "text-rose-600 bg-rose-50 border-rose-100"}`}
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
