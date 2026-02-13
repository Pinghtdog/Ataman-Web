import React, { useState, useEffect } from "react";
import {
  UserPlus,
  Search,
  CheckCircle,
  Printer,
  Clock,
  Loader2,
  Sparkles,
  BrainCircuit,
  ArrowRight,
  MapPin,
  User,
  X,
  Activity,
  Zap,
  Building2,
  ChevronRight,
  Share2,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import Groq from "groq-sdk";

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY_ASSISTED_BOOKING;
const groq = new Groq({ apiKey: GROQ_API_KEY, dangerouslyAllowBrowser: true });

const AssistedBooking = () => {
  const [loading, setLoading] = useState(false);
  const [bookingStatus, setBookingStatus] = useState("idle");
  const [myFacility, setMyFacility] = useState({
    id: null,
    name: "Loading Center...",
    latitude: null,
    longitude: null,
  });

  const [residentSearch, setResidentSearch] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedResident, setSelectedResident] = useState(null);
  const [complaint, setComplaint] = useState("");

  const [hospitals, setHospitals] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(null);

  // haversine formula
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return "---";
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c).toFixed(1);
  };

  const initPortal = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: staff } = await supabase
        .from("facility_staff")
        .select("facility_id, facilities(*)")
        .eq("user_id", user.id)
        .maybeSingle();

      if (staff) setMyFacility({ id: staff.facility_id, ...staff.facilities });

      const { data: facs } = await supabase
        .from("facilities")
        .select("*")
        .eq("type", "hospital");

      if (facs) {
        const hospitalIds = facs.map((h) => h.id);
        const [bedsRes, resourcesRes] = await Promise.all([
          supabase.from("beds").select("*").in("facility_id", hospitalIds),
          supabase
            .from("facility_resources")
            .select("*")
            .in("facility_id", hospitalIds),
        ]);

        const combined = facs.map((h) => ({
          ...h,
          beds: bedsRes.data?.filter((b) => b.facility_id === h.id) || [],
          facility_resources:
            resourcesRes.data?.filter((r) => r.facility_id === h.id) || [],
        }));
        setHospitals(combined);
      }
    } catch (err) {
      console.error("Initialization Error:", err);
    }
  };

  useEffect(() => {
    initPortal();
  }, []);

  useEffect(() => {
    const findResidents = async () => {
      if (residentSearch.length < 2 || selectedResident) return;
      const { data } = await supabase
        .from("users")
        .select("*")
        .or(
          `first_name.ilike.%${residentSearch}%,last_name.ilike.%${residentSearch}%,philhealth_id.eq.${residentSearch}`,
        )
        .limit(5);
      setSuggestions(data || []);
    };
    const timer = setTimeout(findResidents, 300);
    return () => clearTimeout(timer);
  }, [residentSearch, selectedResident]);

  useEffect(() => {
    if (complaint.length > 15 && selectedResident) {
      handleAIAnalysis();
    }
  }, [complaint]);

  const handleAIAnalysis = async () => {
    if (!complaint.trim() || !selectedResident) return;
    setIsAnalyzing(true);

    try {
      const facilityContext = hospitals.map((h) => ({
        name: h.name,
        available_beds: h.beds.filter((b) => b.status === "available").length,
        online_equipment: h.facility_resources
          .filter((r) => r.status === "ONLINE")
          .map((r) => r.resource_type)
          .join(", "),
        distance: `${calculateDistance(myFacility.latitude, myFacility.longitude, h.latitude, h.longitude)} KM`,
      }));

      const prompt = `You are a Naga City Medical Triage AI. 
      Patient: ${selectedResident.first_name} ${selectedResident.last_name}
      Complaint: "${complaint}"
      Current Hospital Context (Beds/Equipment/Distance): ${JSON.stringify(facilityContext)}
      
      Rank the top 3 best-suited hospitals. 
      Return ONLY a JSON array: [{"name": "Hospital Name", "reason": "1 sentence medical reason", "score": 95, "urgency": "High"}]`;

      const chat = await groq.chat.completions.create({
        messages: [{ role: "system", content: prompt }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
      });

      const cleanJson = chat.choices[0].message.content.replace(
        /```json|```/g,
        "",
      );
      setRecommendations(JSON.parse(cleanJson));
    } catch (e) {
      console.error("AI Analysis Failed", e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFinalize = async () => {
    if (!selectedTarget) return;
    setLoading(true);

    const hospitalRecord = hospitals.find(
      (h) => h.name === selectedTarget.name,
    );
    const refID = `AT-${Math.floor(Math.random() * 9000) + 1000}`;

    const { error } = await supabase.from("referrals").insert({
      reference_number: refID,
      patient_id: selectedResident.id,
      origin_facility_id: myFacility.id,
      destination_facility_id: hospitalRecord?.id || 1,
      chief_complaint: complaint,
      status: "PENDING",
    });

    if (!error) setBookingStatus("success");
    else alert("Database Error: " + error.message);
    setLoading(false);
  };

  if (bookingStatus === "success") {
    return (
      <div className="p-10 bg-[#F8FAFC] min-h-screen flex items-center justify-center font-sans">
        <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-gray-100 text-center max-w-lg animate-in zoom-in duration-300">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 border border-emerald-100">
            <Share2 size={32} />
          </div>
          <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter italic">
            Handshake Active
          </h2>
          <p className="text-slate-400 mt-4 text-sm font-medium italic">
            Digital transfer initiated for {selectedResident.first_name}.
          </p>
          <div className="mt-10 p-8 bg-slate-900 rounded-[2.5rem] text-white">
            <p className="text-[10px] font-bold text-teal-400 uppercase tracking-widest mb-2">
              Reference ID
            </p>
            <p className="text-5xl font-black tracking-tighter italic">
              #{Math.floor(Math.random() * 8999) + 1000}
            </p>
          </div>
          <div className="mt-10 flex gap-4">
            <button
              onClick={() => window.print()}
              className="flex-1 bg-white border-2 border-slate-200 text-slate-700 py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
            >
              {" "}
              <Printer size={16} /> Print Slip{" "}
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex-1 bg-[#00695C] text-white py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-lg"
            >
              {" "}
              Next Patient{" "}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-10 bg-[#F8FAFC] min-h-screen font-sans">
      <div className="mb-12">
        <h1 className="text-4xl font-black text-slate-800 tracking-tighter leading-none uppercase text-primary">
          Assisted Intake Portal
        </h1>
        <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-[0.2em] mt-2">
          {myFacility.name} Clinical Node
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* SECTION 1: INTAKE */}
        <div className="lg:col-span-5 space-y-8">
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100">
            <div className="flex items-center gap-4 mb-10 border-b border-gray-50 pb-6">
              <div className="p-4 bg-emerald-50 text-emerald-600 rounded-[1.5rem] shadow-sm font-black italic">
                ID
              </div>
              <h3 className="text-lg font-bold text-gray-800 uppercase tracking-tight italic">
                Resident Search
              </h3>
            </div>

            <div className="space-y-8 relative">
              <div className="relative flex items-center bg-gray-50 rounded-2xl">
                <Search className="absolute left-6 text-gray-300" size={20} />
                <input
                  type="text"
                  placeholder="Type Name..."
                  className="w-full bg-transparent border-none p-5 pl-16 text-sm font-bold text-gray-700 outline-none"
                  value={residentSearch}
                  onChange={(e) => {
                    setResidentSearch(e.target.value);
                    setSelectedResident(null);
                  }}
                />
              </div>
              {suggestions.length > 0 && (
                <div className="absolute top-16 left-0 right-0 bg-white rounded-3xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
                  {suggestions.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedResident(p);
                        setResidentSearch(`${p.first_name} ${p.last_name}`);
                        setSuggestions([]);
                      }}
                      className="p-5 hover:bg-emerald-50 cursor-pointer border-b last:border-0 border-gray-50 flex justify-between items-center transition-colors"
                    >
                      <div>
                        <p className="text-sm font-bold text-gray-800 uppercase">
                          {p.first_name} {p.last_name}
                        </p>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">
                          {p.philhealth_id || "ID UNSET"}
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-gray-300" />
                    </div>
                  ))}
                </div>
              )}

              <div
                className={`transition-all duration-500 ${selectedResident ? "opacity-100" : "opacity-20 pointer-events-none"}`}
              >
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 px-2 italic">
                  Presenting Symptoms (Complaint)
                </label>
                <textarea
                  rows="6"
                  placeholder="Describe the current clinical manifestation..."
                  className="w-full bg-gray-50 border-none rounded-[2rem] p-7 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-primary/20 outline-none resize-none italic shadow-inner"
                  value={complaint}
                  onChange={(e) => setComplaint(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: AI ASSISTED NETWORK ROUTING */}
        <div className="lg:col-span-7 space-y-6">
          {!selectedResident || recommendations.length === 0 ? (
            <div className="h-[600px] flex flex-col items-center justify-center border-2 border-dashed border-gray-100 rounded-[3.5rem] p-10 text-center opacity-40">
              <div className="w-20 h-20 bg-gray-50 rounded-[2.5rem] flex items-center justify-center mb-6 animate-pulse">
                <BrainCircuit size={40} className="text-gray-200" />
              </div>
              <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em]">
                Awaiting Clinical Stream...
              </p>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-right-10 duration-700 space-y-6">
              <div className="flex items-center gap-3 px-4">
                <Zap size={16} className="text-orange-400 fill-orange-400" />
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                  Smart Network Recommendations
                </h3>
              </div>

              <div className="space-y-4">
                {isAnalyzing ? (
                  <div className="p-20 text-center flex flex-col items-center gap-4 bg-white rounded-[3rem] border border-gray-100 shadow-sm">
                    <Loader2
                      size={32}
                      className="animate-spin text-primary opacity-20"
                    />
                    <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                      Groq-Llama analyzing Naga City Hub...
                    </p>
                  </div>
                ) : (
                  recommendations.map((recItem, i) => {
                    const hospitalData = hospitals.find(
                      (h) => h.name === recItem.name,
                    );
                    const isSelected = selectedTarget?.name === recItem.name;
                    const distance = calculateDistance(
                      myFacility.latitude,
                      myFacility.longitude,
                      hospitalData?.latitude,
                      hospitalData?.longitude,
                    );

                    return (
                      <div
                        key={i}
                        onClick={() => setSelectedTarget(recItem)}
                        className={`bg-white p-8 rounded-[2.5rem] border-2 transition-all cursor-pointer group relative overflow-hidden ${isSelected ? "border-[#00695C] shadow-2xl shadow-emerald-900/10 scale-[1.02]" : "border-transparent shadow-sm hover:border-gray-200"}`}
                      >
                        {i === 0 && (
                          <div className="absolute top-0 right-0 bg-emerald-500 text-white px-6 py-1.5 rounded-bl-[1.5rem] text-[8px] font-black uppercase tracking-widest shadow-lg">
                            Primary AI Match
                          </div>
                        )}

                        <div className="flex justify-between items-start mb-6">
                          <div className="flex items-center gap-4">
                            <div
                              className={`p-4 rounded-2xl ${isSelected ? "bg-emerald-500 text-white" : "bg-gray-50 text-gray-400 border border-gray-100"}`}
                            >
                              <Building2 size={24} />
                            </div>
                            <div>
                              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                {recItem.urgency} Priority Level
                              </p>
                              <h4 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter leading-none mt-1">
                                {recItem.name}
                              </h4>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-black text-emerald-600 leading-none">
                              {recItem.score}%
                            </p>
                            <p className="text-[8px] font-bold text-gray-300 uppercase tracking-tighter mt-1">
                              Match Score
                            </p>
                          </div>
                        </div>

                        <div className="bg-gray-50/50 p-5 rounded-[1.5rem] border border-gray-100 mb-6">
                          <p className="text-[10px] font-bold text-slate-500 leading-relaxed italic">
                            "{recItem.reason}"
                          </p>
                        </div>

                        <div className="grid grid-cols-3 gap-6 text-center">
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1">
                              Ward Status
                            </span>
                            <span className="text-[10px] font-bold text-slate-700">
                              {hospitalData?.beds?.filter(
                                (b) => b.status === "available",
                              ).length || 0}{" "}
                              Available Beds
                            </span>
                          </div>
                          <div className="flex flex-col border-x border-gray-100 px-4">
                            <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1">
                              Equipment
                            </span>
                            <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tighter truncate">
                              {hospitalData?.facility_resources?.length || 0}{" "}
                              Critical Assets
                            </span>
                          </div>
                          <div className="flex flex-col text-right">
                            <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1">
                              Distance
                            </span>
                            <span className="text-[10px] font-bold text-slate-700 uppercase italic">
                              {distance !== "---" ? `${distance} KM` : "N/A"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <button
                onClick={handleFinalize}
                disabled={loading || !selectedTarget}
                className="w-full bg-slate-900 text-white py-6 rounded-[2.5rem] font-black text-[11px] uppercase tracking-[0.4em] shadow-2xl hover:bg-[#00695C] transition-all flex items-center justify-center gap-4 active:scale-[0.98] border-b-4 border-slate-950 mt-4 disabled:opacity-20"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <ArrowRight size={20} />
                )}
                Execute Clinical Referral
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssistedBooking;
