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
  ShieldCheck,
  ScanFace,
  Stethoscope,
  ChevronRight,
  Share2,
  ListFilter,
  ClipboardList,
  AlertCircle,
  UserCheck,
  Phone,
  CalendarDays,
  Award,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { useNavigate, useLocation } from "react-router-dom";

const AssistedBooking = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // System States
  const [loading, setLoading] = useState(false);
  const [bookingStatus, setBookingStatus] = useState("idle");
  const [step, setStep] = useState(1);
  const [myFacility, setMyFacility] = useState({
    id: null,
    name: "Loading Center...",
    short_code: "NAGA",
  });

  // Search & Registry States
  const [residentSearch, setResidentSearch] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedResident, setSelectedResident] = useState(null);
  const [outpatientReferrals, setOutpatientReferrals] = useState([]);

  // Clinician & Queue States
  const [availableDoctors, setAvailableDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [facilityQueueCount, setFacilityQueueCount] = useState(0);

  // 1. DATA INITIALIZATION
  const fetchData = async () => {
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

      if (staff) {
        setMyFacility({
          id: staff.facility_id,
          name: staff.facilities.name,
          short_code: staff.facilities.short_code,
          opening: staff.facilities.opening_time,
          closing: staff.facilities.closing_time,
          total_queue: staff.facilities.current_queue_length,
        });

        // Get Live Queue Count for Token generation
        const { count } = await supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("facility_id", staff.facility_id)
          .eq("status", "pending");
        setFacilityQueueCount(count || 0);

        // Fetch Doctors + Their Specialties
        const { data: docs } = await supabase
          .from("facility_staff")
          .select(
            `
            user_id, role, 
            users(first_name, last_name),
            telemed_doctors!user_id(specialty, current_wait_minutes, is_online)
          `,
          )
          .eq("facility_id", staff.facility_id)
          .eq("role", "DOCTOR");
        setAvailableDoctors(docs || []);

        // Fetch Referrals
        const { data: refs } = await supabase
          .from("referrals")
          .select(
            "*, users!patient_id(*), origin:facilities!origin_facility_id(name)",
          )
          .eq("destination_facility_id", staff.facility_id)
          .eq("status", "PENDING")
          .limit(5);
        setOutpatientReferrals(refs || []);
      }
    } catch (err) {
      console.error("Initialization Error:", err);
    }
  };

  useEffect(() => {
    fetchData();
    if (location.state?.intakeComplete) {
      setSelectedResident(location.state.patient);
      setStep(4);
    }
  }, [location.state]);

  // 2. RESIDENT SEARCH (Fixed Searching Logic)
  useEffect(() => {
    const findResidents = async () => {
      if (residentSearch.length < 2 || selectedResident) return;
      const { data } = await supabase
        .from("users")
        .select("*")
        .or(
          `first_name.ilike.%${residentSearch}%,last_name.ilike.%${residentSearch}%,philhealth_id.eq.${residentSearch},medical_id.eq.${residentSearch}`,
        )
        .limit(5);
      setSuggestions(data || []);
    };
    const timer = setTimeout(findResidents, 300);
    return () => clearTimeout(timer);
  }, [residentSearch, selectedResident]);

  // 3. WORKFLOW HANDLERS
  const handleLivenessProtocol = () => {
    // Copy to clipboard for staff convenience
    navigator.clipboard.writeText(selectedResident.philhealth_id);
    window.open("https://pcu.philhealth.gov.ph/consent", "_blank");
    setStep(2);
  };

  const verifyPhilHealth = async () => {
    setLoading(true);
    await supabase
      .from("users")
      .update({
        is_philhealth_verified: true,
        philhealth_verified_at: new Date().toISOString(),
      })
      .eq("id", selectedResident.id);
    setStep(3);
    setLoading(false);
  };

  const finalizeHandover = async () => {
    if (!selectedDoctor || !selectedResident) return;
    setLoading(true);

    // Generate specific Priority Token: [HOSP-CODE]-[QUEUE-POS]
    const queuePos = (facilityQueueCount + 1).toString().padStart(3, "0");
    const refToken = `${myFacility.short_code}-${queuePos}`;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("bookings").insert({
      user_id: selectedResident.id,
      facility_id: myFacility.id,
      status: "pending",
      priority_token: refToken,
      nature_of_visit: "Assisted Intake",
      assisted_by: user.id,
      appointment_time: new Date().toISOString(),
    });

    if (!error) {
      // Increment Facility Queue Length
      await supabase
        .from("facilities")
        .update({ current_queue_length: facilityQueueCount + 1 })
        .eq("id", myFacility.id);
      setBookingStatus("success");
    } else {
      alert("Handshake Error: " + error.message);
    }
    setLoading(false);
  };

  if (bookingStatus === "success")
    return (
      <div className="p-10 bg-[#F8FAFC] h-screen flex items-center justify-center font-sans">
        <div className="bg-white p-14 rounded-[3.5rem] shadow-2xl text-center max-w-lg border border-emerald-100 animate-in zoom-in duration-500">
          <div className="w-24 h-24 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-emerald-100 shadow-inner">
            <UserCheck size={48} />
          </div>
          <h2 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter">
            Handshake Confirmed
          </h2>
          <p className="text-slate-400 mt-4 text-sm font-medium leading-relaxed italic px-6">
            Patient successfully synchronized with{" "}
            <b>Dr. {selectedDoctor?.users.last_name}</b>'s queue.
          </p>

          <div className="mt-10 p-10 bg-slate-900 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
            <div className="absolute right-0 top-0 p-4 opacity-10">
              <Printer size={100} />
            </div>
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-3 leading-none italic">
              Electronic Priority Token
            </p>
            <p className="text-5xl font-black tracking-tighter italic">
              {(facilityQueueCount + 1).toString().padStart(3, "0")}
            </p>
            <p className="text-[9px] font-bold text-slate-500 mt-4 uppercase tracking-widest">
              {myFacility.name}
            </p>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="w-full mt-10 py-5 bg-primary text-white rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-emerald-900/20"
          >
            Terminate Session & Reset Node
          </button>
        </div>
      </div>
    );

  return (
    <div className="p-10 bg-[#F8FAFC] min-h-screen font-sans flex flex-col">
      <div className="mb-10 flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase leading-none text-primary italic">
            Assisted Entry
          </h1>
          <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-[0.2em] mt-3 italic leading-none">
            / {myFacility.name} / Operational node
          </p>
        </div>
        <div className="flex gap-4 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex flex-col text-right border-r border-slate-50 pr-4">
            <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">
              Facility Hours
            </span>
            <span className="text-[10px] font-bold text-slate-600">
              {myFacility.opening} - {myFacility.closing}
            </span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">
              Active Load
            </span>
            <span className="text-[10px] font-bold text-emerald-600 italic uppercase">
              Pos: {facilityQueueCount + 1}
            </span>
          </div>
        </div>
      </div>

      {/* TRACKER */}
      <div className="flex items-center gap-6 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 mb-8 shrink-0 overflow-x-auto no-scrollbar">
        <Step num={1} label="ID Match" active={step === 1} done={step > 1} />
        <div className="w-10 h-px bg-slate-100 shrink-0" />
        <Step num={2} label="Biometric" active={step === 2} done={step > 2} />
        <div className="w-10 h-px bg-slate-100 shrink-0" />
        <Step num={3} label="Vitals" active={step === 3} done={step > 3} />
        <div className="w-10 h-px bg-slate-100 shrink-0" />
        <Step num={4} label="Dispatch" active={step === 4} done={step > 4} />
      </div>

      <div className="grid grid-cols-12 gap-8 flex-1 min-h-0">
        {/* LEFT PANEL */}
        <div className="col-span-8 flex flex-col gap-6 overflow-y-auto no-scrollbar pb-10">
          <div className="grid grid-cols-2 gap-6 leading-none">
            {/* 1. SUBJECT SEARCH */}
            <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col">
              <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-8 italic">
                1. Resident Identification
              </h3>
              <div className="relative">
                <div className="flex items-center bg-gray-50 rounded-2xl p-1 focus-within:ring-2 ring-primary/10 transition-all">
                  <Search className="ml-5 text-slate-300 font-bold" size={20} />
                  <input
                    type="text"
                    placeholder="Scan or Type Name..."
                    className="w-full bg-transparent p-5 text-sm font-bold outline-none uppercase"
                    value={residentSearch}
                    onChange={(e) => {
                      setResidentSearch(e.target.value);
                      setSelectedResident(null);
                    }}
                  />
                </div>
                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-3xl shadow-2xl border border-slate-100 z-50 overflow-hidden">
                    {suggestions.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          setSelectedResident(p);
                          setResidentSearch(`${p.first_name} ${p.last_name}`);
                          setSuggestions([]);
                          setStep(2);
                        }}
                        className="p-6 hover:bg-emerald-50 cursor-pointer flex justify-between items-center border-b last:border-0 border-gray-50 group"
                      >
                        <div className="flex items-center gap-5">
                          <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 font-black italic border border-slate-100">
                            {p.first_name[0]}
                          </div>
                          <p className="text-sm font-bold text-slate-700 uppercase tracking-tighter">
                            {p.first_name} {p.last_name}
                          </p>
                        </div>
                        <ChevronRight
                          size={14}
                          className="text-slate-300 group-hover:text-primary"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {selectedResident && (
                <div className="mt-8 p-6 bg-emerald-50 rounded-[2rem] border border-emerald-100 flex items-center justify-between animate-in slide-in-from-top-2">
                  <div>
                    <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-1 italic">
                      Link Secured
                    </p>
                    <p className="text-base font-bold text-slate-800 uppercase italic leading-none">
                      {selectedResident.first_name} {selectedResident.last_name}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedResident(null)}
                    className="text-red-300 hover:text-red-500 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              )}
            </div>

            {/* 2. VERIFICATION */}
            <div
              className={`bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 h-full flex flex-col transition-all ${selectedResident ? "opacity-100" : "opacity-20 pointer-events-none"}`}
            >
              <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-8 italic">
                2. Biometric Handshake
              </h3>
              <div className="space-y-4">
                <button
                  onClick={handleLivenessProtocol}
                  className="w-full flex items-center justify-between p-5 bg-gray-50 rounded-2xl border border-slate-100 hover:border-primary transition-all group"
                >
                  <div className="flex items-center gap-4 text-xs uppercase font-black tracking-widest italic text-slate-600">
                    <ScanFace
                      size={22}
                      className="text-slate-400 group-hover:text-primary"
                    />
                    Liveness Scan
                  </div>
                  <ChevronRight size={14} className="text-slate-300" />
                </button>
                <button
                  onClick={verifyPhilHealth}
                  className="w-full flex items-center justify-between p-5 bg-emerald-50 rounded-2xl border border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all group"
                >
                  <div className="flex items-center gap-4 text-xs uppercase font-black tracking-widest italic text-emerald-600 group-hover:text-white">
                    <ShieldCheck size={22} />
                    Verify YAKAP
                  </div>
                  {step > 2 ? (
                    <CheckCircle
                      size={16}
                      fill="white"
                      className="text-emerald-600"
                    />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* LOWER GRID */}
          <div className="grid grid-cols-2 gap-6">
            {/* STEP 3 */}
            <div
              className={`bg-white p-12 rounded-[3.5rem] shadow-sm border border-slate-100 flex flex-col items-center text-center transition-all ${step === 3 ? "opacity-100 border-primary shadow-xl ring-8 ring-primary/5" : "opacity-20"}`}
            >
              <div className="p-8 bg-emerald-50 text-emerald-600 rounded-[2.5rem] mb-8 shadow-inner animate-pulse">
                <Stethoscope size={48} />
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase mb-2 italic">
                Clinical Intake
              </h3>
              <p className="text-xs text-slate-400 font-medium italic mb-10 leading-relaxed px-8">
                Synchronize physical vitals in Digital Charting to unlock
                clinician queue.
              </p>
              <button
                onClick={() =>
                  navigate("/charting", {
                    state: { intakeMode: true, patient: selectedResident },
                  })
                }
                className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-bold uppercase text-[9px] tracking-[0.3em] shadow-lg hover:bg-black transition-all"
              >
                Launch Registry Node
              </button>
            </div>

            {/* STEP 4: ENHANCED DOCTOR LIST */}
            <div
              className={`bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-100 flex flex-col transition-all ${step === 4 ? "opacity-100 border-emerald-500 shadow-xl" : "opacity-20 pointer-events-none"}`}
            >
              <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-8 px-2 italic">
                4. Tactical Clinician Dispatch
              </h3>
              <div className="space-y-4 flex-1 overflow-y-auto no-scrollbar mb-8 px-1 max-h-[220px]">
                {availableDoctors.length > 0 ? (
                  availableDoctors.map((doc) => (
                    <div
                      key={doc.user_id}
                      onClick={() => setSelectedDoctor(doc)}
                      className={`p-5 rounded-3xl border-2 transition-all cursor-pointer flex flex-col ${selectedDoctor?.user_id === doc.user_id ? "border-primary bg-emerald-50 shadow-md scale-105" : "border-slate-50 bg-gray-50"}`}
                    >
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center font-black text-primary text-[10px] italic border border-slate-100 shadow-sm leading-none">
                            MD
                          </div>
                          <span className="text-[11px] font-black text-slate-800 uppercase tracking-tighter leading-none">
                            Dr. {doc.users.last_name}
                          </span>
                        </div>
                        {selectedDoctor?.user_id === doc.user_id && (
                          <CheckCircle
                            size={18}
                            fill="#0D9488"
                            className="text-white animate-in zoom-in"
                          />
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-white/50">
                        <div className="flex items-center gap-1.5 text-[8px] font-black text-slate-400 uppercase tracking-widest">
                          <Award size={10} className="text-primary" />{" "}
                          {doc.telemed_doctors?.[0]?.specialty || "GENERALIST"}
                        </div>
                        <div className="flex items-center gap-1.5 text-[8px] font-black text-emerald-600 uppercase tracking-widest justify-end italic">
                          <Clock size={10} />{" "}
                          {doc.telemed_doctors?.[0]?.current_wait_minutes || 0}m
                          Wait
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[10px] text-gray-300 font-bold uppercase text-center py-20 italic">
                    No Doctors Synced
                  </p>
                )}
              </div>
              <button
                onClick={finalizeHandover}
                disabled={!selectedDoctor || loading}
                className="w-full py-6 bg-primary text-white rounded-[2rem] font-black uppercase tracking-widest text-[10px] shadow-2xl flex justify-center items-center gap-4 active:scale-95 disabled:opacity-20"
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Share2 size={18} />
                )}{" "}
                Finalize Handover
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: REFERRAL INBOX */}
        <div className="col-span-4 bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden leading-none">
          <div className="flex items-center justify-between mb-10 shrink-0 px-2 leading-none font-bold text-slate-400 uppercase text-[11px] tracking-widest italic">
            <div className="flex items-center gap-3 text-slate-800 italic">
              <ClipboardList size={20} className="text-primary" /> Referral
              Stream
            </div>
            <span className="bg-primary text-white px-2 py-0.5 rounded-lg text-[8px] font-black shadow-lg">
              LIVE
            </span>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar space-y-5 pr-2 pb-6">
            {outpatientReferrals.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-20 px-10">
                <Share2 size={48} className="mb-6" />
                <p className="text-[11px] font-black text-slate-800 uppercase tracking-widest italic">
                  Registry stream dormant
                </p>
              </div>
            ) : (
              outpatientReferrals.map((ref) => (
                <div
                  key={ref.id}
                  className="p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 hover:border-primary transition-all group relative overflow-hidden shadow-inner"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary opacity-20 group-hover:opacity-100" />
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-xs font-black text-slate-800 uppercase leading-none">
                        {ref.users?.first_name} {ref.users?.last_name}
                      </p>
                      <p className="text-[9px] font-bold text-primary uppercase mt-1.5 tracking-widest">
                        From: {ref.origin?.name}
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] italic text-slate-400 line-clamp-2 leading-relaxed mb-6 font-medium">
                    "{ref.chief_complaint}"
                  </p>
                  <button
                    onClick={() => {
                      setSelectedResident(ref.users);
                      setStep(2);
                    }}
                    className="w-full py-3.5 bg-white border border-slate-200 rounded-[1.2rem] text-[9px] font-black uppercase tracking-[0.2em] hover:bg-slate-900 hover:text-white transition-all shadow-sm active:scale-95"
                  >
                    Initiate Handshake
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="mt-6 p-6 bg-slate-900 text-white rounded-[2.5rem] shadow-xl relative overflow-hidden italic">
            <AlertCircle
              className="absolute -right-4 -top-4 opacity-10"
              size={100}
            />
            <p className="text-[9px] font-bold uppercase tracking-widest text-primary leading-relaxed relative z-10">
              Secure data node active. External facilities currently
              transmitting clinical packets to this station.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Step = ({ num, label, active, done }) => (
  <div
    className={`flex items-center gap-4 shrink-0 transition-all ${active ? "scale-105" : ""}`}
  >
    <div
      className={`w-11 h-11 rounded-[1.2rem] flex items-center justify-center font-black text-sm shadow-sm transition-all ${done ? "bg-emerald-500 text-white" : active ? "bg-primary text-white shadow-emerald-900/20 shadow-lg" : "bg-slate-50 text-slate-300"}`}
    >
      {done ? "✓" : num}
    </div>
    <span
      className={`text-[11px] font-black uppercase tracking-widest leading-none ${active ? "text-primary" : "text-slate-300 italic"}`}
    >
      {label}
    </span>
  </div>
);

export default AssistedBooking;
