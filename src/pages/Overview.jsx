import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { X, BedDouble, AlertCircle, Loader2 } from "lucide-react";

const Overview = () => {
  const [beds, setBeds] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [selectedBed, setSelectedBed] = useState(null);
  const [loading, setLoading] = useState(true);
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

      const fId = staffRecord?.facility_id || 2; // Fallback to 2 if not found
      setFacilityId(fId);

      const { data: bedData } = await supabase
        .from("beds")
        .select(
          `*, users ( first_name, last_name, medical_conditions, birth_date, gender, blood_type )`,
        )
        .eq("facility_id", fId)
        .order("bed_label", { ascending: true });

      const { data: refData } = await supabase
        .from("referrals")
        .select(
          `
          id, chief_complaint, ai_priority_score, doctor_name, created_at,
          users!patient_id (first_name, last_name, medical_id),
          origin:facilities!origin_facility_id (name)
        `,
        )
        // .eq("destination_facility_id", fId) // Only show referrals destined for US
        .eq("status", "PENDING")
        .order("created_at", { ascending: false });

      if (bedData) setBeds(bedData);
      if (refData) setReferrals(refData);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const bedChan = supabase
      .channel("beds-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "beds" },
        fetchData,
      )
      .subscribe();
    const refChan = supabase
      .channel("refs-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "referrals" },
        fetchData,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(bedChan);
      supabase.removeChannel(refChan);
    };
  }, []);

  const getWardStats = () => {
    const wards = {};
    beds.forEach((bed) => {
      const type = bed.ward_type || "Uncategorized";
      if (!wards[type]) wards[type] = { total: 0, occupied: 0 };
      wards[type].total++;
      if (bed.status === "occupied") wards[type].occupied++;
    });
    return wards;
  };

  const wardStats = getWardStats();
  const wardTypes = Object.keys(wardStats);

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center h-screen text-gray-400 gap-4">
        <Loader2 className="animate-spin" size={40} />
        <p className="font-black uppercase tracking-widest text-xs">
          Syncing Command Center...
        </p>
      </div>
    );

  return (
    <div className="p-8 bg-[#F8FAFC] min-h-screen">
      {/* STATUS HEADER */}
      <div className="flex items-center gap-3 mb-8">
        <span className="bg-emerald-500 text-white px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-100">
          Status: Normal Operations
        </span>
      </div>

      {/* KPI ROW */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        {/* Dynamic Occupancy Cards */}
        {wardTypes.map((type) => {
          const stats = wardStats[type];
          const percent = Math.round((stats.occupied / stats.total) * 100);
          return (
            <div
              key={type}
              className="bg-white p-6 rounded-[2rem] shadow-sm border-l-8 border-emerald-500"
            >
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                {type} Occupancy
              </h3>
              <div className="text-4xl font-black text-gray-800">
                {percent}%
              </div>
              <p className="text-[9px] font-bold text-gray-400 mt-2 uppercase">
                {stats.occupied} / {stats.total} Beds
              </p>
            </div>
          );
        })}

        {/* Incoming Referrals Card */}
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border-l-8 border-orange-400">
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
            Incoming Referrals
          </h3>
          <div className="text-4xl font-black text-gray-800">
            {referrals.length}
          </div>
          <p className="text-[9px] font-bold text-orange-500 mt-2 uppercase">
            Action Required
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* LIVE BED TRACKER */}
        <div className="lg:col-span-2 bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100 min-h-[400px]">
          <div className="flex justify-between items-center mb-10">
            <h4 className="font-black text-gray-800 uppercase tracking-tight text-lg">
              Live Asset Tracker
            </h4>
            <div className="flex gap-4">
              <LegendItem color="bg-red-600" label="Occupied" />
              <LegendItem color="bg-orange-400" label="Cleaning" />
              <LegendItem color="bg-[#004D40]" label="Avail" />
            </div>
          </div>

          {beds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-300">
              <BedDouble size={48} className="mb-4 opacity-20" />
              <p className="font-bold text-sm uppercase tracking-widest">
                No beds registered for Facility #{facilityId}
              </p>
              <p className="text-xs mt-2">
                Add beds in the Admin Dashboard to see them here.
              </p>
            </div>
          ) : (
            wardTypes.map((type) => (
              <div key={type} className="mb-12 last:mb-0">
                <h5 className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.3em] mb-6 border-b border-gray-50 pb-2">
                  {type} Section
                </h5>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
                  {beds
                    .filter((b) => b.ward_type === type)
                    .map((bed) => (
                      <div
                        key={bed.id}
                        onClick={() => setSelectedBed(bed)}
                        className={`aspect-square rounded-2xl flex items-center justify-center text-[10px] font-black cursor-pointer transition-all hover:scale-110 shadow-sm text-white
                        ${bed.status === "occupied" ? "bg-red-600" : bed.status === "cleaning" ? "bg-orange-400" : "bg-[#004D40]"}`}
                      >
                        {bed.bed_label}
                      </div>
                    ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* REFERRAL STREAM */}
        <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-gray-100 h-fit">
          <h4 className="font-black text-gray-800 uppercase tracking-tight mb-8">
            Referral Stream
          </h4>
          <div className="space-y-4">
            {referrals.length === 0 ? (
              <p className="py-20 text-center text-gray-300 font-bold text-xs uppercase tracking-widest">
                Clear for now
              </p>
            ) : (
              referrals.map((ref) => (
                <div
                  key={ref.id}
                  className="p-5 bg-gray-50 rounded-[2rem] border border-gray-100 relative overflow-hidden group hover:border-emerald-500 transition-all"
                >
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-1.5 ${ref.ai_priority_score >= 0.8 ? "bg-red-500" : "bg-[#00695C]"}`}
                  />
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-black text-gray-800 uppercase truncate">
                      {ref.users?.first_name} {ref.users?.last_name}
                    </span>
                    <span
                      className={`text-[8px] font-black px-2 py-0.5 rounded-full ${ref.ai_priority_score >= 0.8 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"}`}
                    >
                      ESI {ref.ai_priority_score >= 0.8 ? "1" : "4"}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase mb-2">
                    From: {ref.origin?.name}
                  </p>
                  <p className="text-[11px] text-gray-500 leading-relaxed italic">
                    "{ref.chief_complaint}"
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* BED MODAL */}
      {selectedBed && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedBed(null)}
        >
          <div
            className="bg-white rounded-[3rem] p-10 w-full max-w-sm shadow-2xl animate-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">
                Asset {selectedBed.bed_label}
              </h2>
              <button
                onClick={() => setSelectedBed(null)}
                className="text-gray-300 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="flex justify-between border-b border-gray-50 pb-4">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Current Status
                </span>
                <span
                  className={`text-[10px] font-black uppercase ${selectedBed.status === "occupied" ? "text-red-500" : "text-emerald-500"}`}
                >
                  {selectedBed.status}
                </span>
              </div>

              {selectedBed.status === "occupied" ? (
                <>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                      Patient
                    </label>
                    <p className="text-lg font-black text-gray-800">
                      {selectedBed.users?.first_name}{" "}
                      {selectedBed.users?.last_name}
                    </p>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                      Condition
                    </label>
                    <p className="text-sm text-gray-500 leading-relaxed italic font-medium">
                      "
                      {selectedBed.users?.medical_conditions ||
                        "Stable / No conditions listed"}
                      "
                    </p>
                  </div>
                </>
              ) : (
                <div className="py-10 text-center bg-gray-50 rounded-3xl text-gray-400 font-bold text-xs uppercase tracking-widest">
                  Ready for assignment
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedBed(null)}
              className="w-full mt-10 py-4 bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-black transition-all shadow-lg shadow-gray-200"
            >
              Close Console
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const LegendItem = ({ color, label }) => (
  <div className="flex items-center gap-2">
    <div className={`w-3 h-3 rounded-md ${color}`} />
    <span className="text-[10px] font-black text-gray-300 uppercase tracking-tight">
      {label}
    </span>
  </div>
);

export default Overview;
