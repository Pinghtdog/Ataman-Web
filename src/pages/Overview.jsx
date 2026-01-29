import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { X, BedDouble, Loader2, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Overview = () => {
  const [beds, setBeds] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [selectedBed, setSelectedBed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [facilityId, setFacilityId] = useState(null);
  const navigate = useNavigate();

  const fetchAllData = async () => {
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

      const fId = staffRecord?.facility_id || 2;
      setFacilityId(fId);

      const { data: bedData } = await supabase
        .from("beds")
        .select(
          `*, users ( first_name, last_name, medical_conditions, birth_date )`,
        )
        .eq("facility_id", fId)
        .order("bed_label", { ascending: true });

      const { data: refData } = await supabase
        .from("referrals")
        .select(
          `*, users!patient_id ( first_name, last_name ), origin:facilities!origin_facility_id ( name )`,
        )
        .eq("destination_facility_id", fId)
        .eq("status", "PENDING")
        .order("created_at", { ascending: false });

      if (bedData) setBeds(bedData);
      if (refData) setReferrals(refData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    const bedChannel = supabase
      .channel("beds-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "beds" },
        fetchAllData,
      )
      .subscribe();
    const refChannel = supabase
      .channel("refs-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "referrals" },
        fetchAllData,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(bedChannel);
      supabase.removeChannel(refChannel);
    };
  }, []);

  const wardStats = beds.reduce((acc, bed) => {
    const type = bed.ward_type || "General";
    if (!acc[type]) acc[type] = { total: 0, occupied: 0 };
    acc[type].total++;
    if (bed.status === "occupied") acc[type].occupied++;
    return acc;
  }, {});

  const wardTypes = Object.keys(wardStats);

  const isAnyWardCritical = Object.values(wardStats).some(
    (s) => s.occupied / s.total >= 0.9,
  );
  const statusConfig = isAnyWardCritical
    ? {
        label: "STATUS: DIVERSION PROTOCOL ACTIVE",
        color: "bg-red-600",
        glow: "shadow-[0_0_15px_rgba(220,38,38,0.4)]",
      }
    : {
        label: "STATUS: NORMAL OPERATIONS",
        color: "bg-emerald-600",
        glow: "shadow-[0_0_15px_rgba(5,150,105,0.4)]",
      };

  if (loading) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-white font-sans text-emerald-600">
      <div className="relative mb-6 flex items-center justify-center">
        {/* Subtle Green Pulse */}
        <div className="absolute h-16 w-16 animate-ping rounded-full bg-emerald-100 opacity-75"></div>
        
        {/* Main Emerald Spinner */}
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600"></div>
      </div>

      <div className="space-y-2 text-center">
        <h2 className="text-lg font-bold tracking-tight">
          Syncing Overview...
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
    <div className="p-8 bg-[#F8FAFC] min-h-screen font-sans">
      {/* GLOWING DYNAMIC STATUS */}
      <div className="mb-8">
        <span
          className={`${statusConfig.color} ${statusConfig.glow} animate-pulse text-white px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest`}
        >
          {statusConfig.label}
        </span>
      </div>

      {/* COMPACT KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10 font">
        {wardTypes.map((type) => {
          const s = wardStats[type];
          const percent = Math.round((s.occupied / s.total) * 100);

          const colorClass =
            percent >= 90
              ? "bg-red-600"
              : percent >= 80
                ? "bg-orange-400"
                : "bg-emerald-500";
          const textClass =
            percent >= 90
              ? "text-red-600"
              : percent >= 80
                ? "text-orange-500"
                : "text-emerald-600";

          return (
            <div
              key={type}
              className="bg-white p-6 rounded-[1rem] shadow-sm border border-gray-100 flex flex-col justify-between h-32 relative overflow-hidden transition-all hover:translate-y-[-2px] hover:shadow-md"
            >
              {/* Left Side Color Strip */}
              <div
                className={`absolute left-0 top-0 bottom-0 w-2 ${colorClass}`}
              />

              <div>
                <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1 pl-1">
                  {type} Occupancy
                </h3>
                <div className="text-3xl font-bold text-gray-800 pl-1">
                  {percent}%
                </div>
              </div>

              <p className="text-[10px] font-medium text-gray-400 pl-1 uppercase tracking-tight">
                <span className={`font-bold ${textClass}`}>
                  {s.occupied} occupied
                </span>
                <span className="mx-1 opacity-30">/</span>
                {s.total} total
              </p>
            </div>
          );
        })}

        {/* Incoming Referrals Card */}
        <div className="bg-white p-6 rounded-[1rem] shadow-sm border border-gray-100 flex flex-col justify-between h-32 relative overflow-hidden transition-all hover:translate-y-[-2px] hover:shadow-md">
          <div className="absolute left-0 top-0 bottom-0 w-2 bg-yellow-400" />
          <div>
            <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1 pl-1">
              Incoming Referrals
            </h3>
            <div className="text-3xl font-bold text-gray-800 pl-1">
              {referrals.length}
            </div>
          </div>
          <p className="text-[10px] font-bold text-yellow-400 pl-1 uppercase tracking-tight">
            Action Required
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* BED TRACKER GRID */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[1rem] shadow-sm border border-gray-100 min-h-[400px]">
          <div className="flex justify-between items-center mb-8">
            <h4 className="font-bold text-gray-700 uppercase tracking-tight text-sm">
              Live Bed Tracker
            </h4>
            <div className="flex gap-4">
              <LegendItem color="bg-[#8b1a1a]" label="Occupied" />
              <LegendItem color="bg-orange-400" label="Pending" />
              <LegendItem color="bg-[#004d40]" label="Avail" />
            </div>
          </div>

          {wardTypes.map((type) => (
            <div key={type} className="mb-8 last:mb-0">
              <h5 className="text-[9px] font-semibold text-gray-700 uppercase tracking-[0.3em] mb-4 border-b border-gray-50 pb-1">
                {type} Section
              </h5>
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
                {beds
                  .filter((b) => b.ward_type === type)
                  .map((bed) => (
                    <div
                      key={bed.id}
                      onClick={() => setSelectedBed(bed)}
                      className={`aspect-[4/5] rounded-lg flex items-center justify-center text-[10px] font-bold cursor-pointer transition-transform hover:scale-110 text-white
                      ${bed.status === "occupied" ? "bg-[#8b1a1a]" : bed.status === "cleaning" ? "bg-orange-400" : "bg-[#004d40]"}`}
                    >
                      {bed.bed_label}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {/* REFERRAL STREAM */}
        <div className="bg-white p-8 rounded-[1rem] shadow-sm border border-gray-100 h-fit">
          <h4 className="font-bold text-gray-700 uppercase tracking-tight text-sm mb-8 text-center">
            Referral Stream
          </h4>
          <div className="space-y-4">
            {referrals.map((ref) => (
              <div
                key={ref.id}
                onClick={() =>
                  navigate("/referrals", { state: { autoOpenId: ref.id } })
                }
                className="p-5 bg-gray-50 rounded-[1rem] border border-gray-100 relative overflow-hidden group hover:border-emerald-500 hover:shadow-md cursor-pointer transition-all active:scale-95"
              >
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1 ${ref.ai_priority_score >= 0.8 ? "bg-red-500" : "bg-[#00695C]"}`}
                />
                <div className="flex justify-between items-start mb-1">
                  <p className="text-xs font-bold text-gray-800 uppercase">
                    {ref.users?.first_name} {ref.users?.last_name}
                  </p>
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-white border border-gray-100 text-gray-400">
                    ESI {ref.ai_priority_score >= 0.8 ? "1" : "4"}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest leading-none">
                  From: {ref.origin?.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MODAL */}
      {selectedBed && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedBed(null)}
        >
          <div
            className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-xl animate-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-gray-800 uppercase tracking-tighter">
                Bed {selectedBed.bed_label}
              </h2>
              <button onClick={() => setSelectedBed(null)}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between border-b pb-2">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                  Status
                </span>
                <span
                  className={`text-[10px] font-bold uppercase ${selectedBed.status === "occupied" ? "text-red-600" : "text-emerald-600"}`}
                >
                  {selectedBed.status}
                </span>
              </div>
              {selectedBed.status === "occupied" && (
                <p className="text-sm font-bold text-gray-800 leading-tight">
                  {selectedBed.users?.first_name} {selectedBed.users?.last_name}
                </p>
              )}
            </div>
            <button
              onClick={() => setSelectedBed(null)}
              className="w-full mt-8 py-3 bg-gray-900 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const LegendItem = ({ color, label }) => (
  <div className="flex items-center gap-1.5">
    <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
    <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-tight">
      {label}
    </span>
  </div>
);

export default Overview;
