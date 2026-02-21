import React, { useState, useEffect } from "react";
import {
  Search,
  CheckCircle,
  ShieldCheck,
  ScanFace,
  Stethoscope,
  ChevronRight,
  Share2,
  ClipboardList,
  UserCheck,
  Clock,
  Loader2,
  X,
  QrCode,
  User,
  ArrowRight,
  Activity,
  MapPin,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { useNavigate, useLocation } from "react-router-dom";
import { Scanner } from "@yudiel/react-qr-scanner";

const AssistedBooking = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(false);
  const [bookingStatus, setBookingStatus] = useState("idle");
  const [step, setStep] = useState(1);
  const [myFacility, setMyFacility] = useState({
    id: null,
    name: "Loading...",
    short_code: "NAGA",
  });

  const [residentSearch, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedResident, setSelectedResident] = useState(null);

  // Streams
  const [outpatientReferrals, setOutpatientReferrals] = useState([]);
  const [appBookings, setAppBookings] = useState([]);

  const [availableDoctors, setAvailableDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [facilityQueueCount, setFacilityQueueCount] = useState(0);

  const [showScanner, setShowScanner] = useState(false);
  const [triageData, setTriageData] = useState(null);

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
        });

        // 1. Get current queue length
        const { count } = await supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("facility_id", staff.facility_id)
          .eq("status", "pending");
        setFacilityQueueCount(count || 0);

        // 2. Fetch available doctors safely
        const { data: docs } = await supabase
          .from("facility_staff")
          .select(`user_id, role`)
          .eq("facility_id", staff.facility_id)
          .eq("role", "DOCTOR");

        if (docs && docs.length > 0) {
          const docUserIds = docs.map((d) => d.user_id);
          const { data: docUsers } = await supabase
            .from("users")
            .select("id, first_name, last_name")
            .in("id", docUserIds);
          const { data: telemedDocs } = await supabase
            .from("telemed_doctors")
            .select("user_id, id, specialty, current_wait_minutes")
            .in("user_id", docUserIds);

          const mergedDocs = docs.map((d) => ({
            ...d,
            users: docUsers?.find((u) => u.id === d.user_id) || {
              first_name: "Unknown",
              last_name: "Doctor",
            },
            telemed_profile: telemedDocs?.find((t) => t.user_id === d.user_id),
          }));
          setAvailableDoctors(mergedDocs);
        } else {
          setAvailableDoctors([]);
        }

        // 3. Fetch Outpatient Referrals
        const { data: refs } = await supabase
          .from("referrals")
          .select(
            "*, users!patient_id(*), origin:facilities!origin_facility_id(name)",
          )
          .eq("destination_facility_id", staff.facility_id)
          .eq("status", "PENDING")
          .limit(10);
        setOutpatientReferrals(refs || []);

        // 4. Fetch App Bookings (Smart Triage)
        const { data: incomingAppBookings } = await supabase
          .from("bookings")
          .select("*, users(*)")
          .eq("facility_id", staff.facility_id)
          .eq("status", "pending")
          .is("assisted_by", null) // Ensures it hasn't been processed by staff yet
          .limit(10);
        setAppBookings(incomingAppBookings || []);
      }
    } catch (err) {
      console.error("Fetch Data Error:", err);
    }
  };

  useEffect(() => {
    document.title = "Assisted Booking | ATAMAN";
    fetchData();
    if (location.state?.intakeComplete) {
      setSelectedResident(location.state.patient);
      setStep(4); // Jump straight to dispatch after charting
    }
  }, [location.state]);

  const handleFullReset = () => {
    setBookingStatus("idle");
    setStep(1);
    setSelectedResident(null);
    setSearchTerm("");
    setSelectedDoctor(null);
    setTriageData(null);
    navigate(location.pathname, { replace: true, state: {} });
    fetchData();
  };

  const handleSelectPatient = async (patientData, nextStep = 2) => {
    // Ensure we are working with a single object, not an array
    const pData = Array.isArray(patientData) ? patientData[0] : patientData;
    setSelectedResident(pData);
    setStep(nextStep);

    // Fetch their latest AI Triage from the mobile app
    const { data } = await supabase
      .from("triage_results")
      .select("*")
      .eq("user_id", pData.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setTriageData(data);
  };

  // SEARCH & SCAN LOGIC
  const handleSearch = async (e, directTerm = null) => {
    if (e) e.preventDefault();
    const term = directTerm || residentSearch;
    const cleanTerm = term?.trim();
    if (!cleanTerm) return;

    setLoading(true);

    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        cleanTerm,
      );
    let query = supabase.from("users").select("*");

    if (isUUID) {
      query = query.eq("id", cleanTerm);
    } else {
      query = query.or(
        `first_name.ilike.%${cleanTerm}%,last_name.ilike.%${cleanTerm}%,philhealth_id.eq.${cleanTerm},medical_id.eq.${cleanTerm}`,
      );
    }

    const { data, error } = await query;

    if (!error && data && data.length > 0) {
      if (data.length === 1) {
        handleSelectPatient(data[0], 2);
      } else {
        setSuggestions(data);
      }
    } else {
      alert("No resident found matching those details.");
    }

    setLoading(false);
    setShowScanner(false);
  };

  const handleQrScan = (detectedCodes) => {
    if (
      detectedCodes &&
      detectedCodes.length > 0 &&
      detectedCodes[0]?.rawValue
    ) {
      const rawValue = detectedCodes[0].rawValue;
      try {
        const qrData = JSON.parse(rawValue);
        handleSearch(null, qrData.id || qrData.data || rawValue);
      } catch (e) {
        handleSearch(null, rawValue);
      }
    }
  };

  const handleLivenessProtocol = () => {
    window.open("https://pcu.philhealth.gov.ph/consent", "_blank");
    setStep(2);
  };

  const verifyPhilHealth = async () => {
    setLoading(true);
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 3); // 3-day lifespan

    await supabase
      .from("users")
      .update({
        is_philhealth_verified: true,
        philhealth_verified_at: new Date().toISOString(),
        philhealth_valid_until: validUntil.toISOString(),
      })
      .eq("id", selectedResident.id);

    setStep(3); // Move to Awaiting Vitals
    setLoading(false);
  };

  const finalizeHandover = async () => {
    if (!selectedDoctor || !selectedResident) return;
    setLoading(true);

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
      assigned_doctor_id: selectedDoctor.telemed_profile?.id,
      appointment_time: new Date().toISOString(),
    });

    if (!error) {
      // If this was an app booking, we need to mark the old app booking as completed/merged
      // so it leaves the "Expected App Walk-ins" stream.
      const appBookingMatches = appBookings.filter(
        (b) => b.user_id === selectedResident.id,
      );
      for (const oldBooking of appBookingMatches) {
        await supabase
          .from("bookings")
          .update({ status: "completed" })
          .eq("id", oldBooking.id);
      }
      setBookingStatus("success");
    } else {
      alert("Handshake Error: " + error.message);
    }
    setLoading(false);
  };

  if (bookingStatus === "success") {
    return (
      <div className="p-10 bg-[#F8FAFC] h-screen flex items-center justify-center font-sans">
        <div className="bg-white p-14 rounded-[3.5rem] shadow-2xl text-center max-w-lg border border-emerald-100 animate-in zoom-in duration-500">
          <div className="w-24 h-24 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner">
            <UserCheck size={48} />
          </div>
          <h2 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter">
            Handover Complete
          </h2>
          <p className="text-slate-400 mt-4 text-sm font-medium italic">
            Patient successfully queued to{" "}
            <b className="text-slate-700">
              Dr. {selectedDoctor?.users.last_name}
            </b>
            .
          </p>
          <button
            onClick={handleFullReset}
            className="w-full mt-10 py-5 bg-[#00695C] text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-900 transition-all shadow-xl active:scale-95"
          >
            Process Next Patient
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-10 bg-[#F8FAFC] min-h-screen font-sans flex flex-col">
      {/* HEADER */}
      <div className="mb-10 flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-4xl font-black text-slate-800 uppercase tracking-tighter italic leading-none">
            Assisted Booking
          </h1>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.3em] mt-3">
            {myFacility?.name || "Facility Node"} / Intake Workflow
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white px-5 py-2.5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#00695C] animate-pulse"></div>
            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
              Intake Active
            </span>
          </div>
        </div>
      </div>

      {/* IDLE STATE / SEARCH & QUEUE */}
      {!selectedResident && (
        <div className="animate-in slide-in-from-top-4 duration-500 space-y-8 flex-1">
          {/* TOP CONTROL BAR: SEARCH + SCANNER */}
          <div className="flex gap-4 items-stretch max-w-4xl">
            <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100 flex items-center gap-4 flex-1 focus-within:ring-2 ring-[#00695C]/20 transition-all">
              <div className="bg-slate-50 p-3 rounded-xl text-slate-400">
                <Search size={20} />
              </div>
              <form onSubmit={handleSearch} className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Search by Name or Medical ID..."
                  className="w-full bg-transparent outline-none text-sm font-bold text-slate-700 placeholder:text-slate-300 placeholder:font-medium uppercase"
                  value={residentSearch}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-6 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden">
                    {suggestions.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          handleSelectPatient(p, 2);
                          setSearchTerm(`${p.first_name} ${p.last_name}`);
                          setSuggestions([]);
                        }}
                        className="p-4 hover:bg-emerald-50 cursor-pointer flex justify-between items-center border-b border-gray-50 last:border-0 group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center font-black text-slate-400">
                            {p.first_name[0]}
                          </div>
                          <p className="text-xs font-bold text-slate-700 uppercase">
                            {p.first_name} {p.last_name}
                          </p>
                        </div>
                        <ChevronRight
                          size={14}
                          className="text-slate-300 group-hover:text-[#00695C]"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </form>
              <button
                onClick={(e) => handleSearch(e)}
                className="bg-slate-900 text-white px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#00695C] transition-all shadow-lg active:scale-95"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  "Locate"
                )}
              </button>
            </div>

            <button
              onClick={() => setShowScanner(true)}
              className="bg-white px-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-1 hover:border-[#00695C] hover:shadow-md transition-all group"
            >
              <QrCode
                size={24}
                className="text-slate-400 group-hover:text-[#00695C] transition-colors"
              />
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-300 group-hover:text-[#00695C]">
                Scan
              </span>
            </button>
          </div>

          {/* APP BOOKINGS / SMART TRIAGE STREAM */}
          <div className="pt-4">
            <div className="flex justify-between items-center mb-4 px-2">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Activity size={14} className="text-[#00695C]" /> Expected App
                Walk-ins ({appBookings.length})
              </h3>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-6 custom-scrollbar">
              {appBookings.length === 0 ? (
                <div className="w-full p-8 border-2 border-dashed border-slate-200 rounded-[2rem] text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                  No pending app bookings
                </div>
              ) : (
                appBookings.map((booking) => {
                  const pUser = Array.isArray(booking.users)
                    ? booking.users[0]
                    : booking.users;
                  return (
                    <div
                      key={booking.id}
                      onClick={() => handleSelectPatient(pUser, 2)}
                      className="min-w-[320px] bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-lg hover:border-[#00695C] cursor-pointer transition-all group relative overflow-hidden"
                    >
                      <div
                        className={`absolute left-0 top-0 bottom-0 w-1.5 ${booking.triage_priority === "Red" ? "bg-rose-500" : "bg-emerald-400"}`}
                      />

                      <div className="flex justify-between items-start mb-4 pl-2">
                        <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5">
                          APP TRIAGE
                        </span>
                        <span className="bg-slate-50 text-slate-400 px-2 py-1 rounded-md text-[9px] font-bold uppercase">
                          <Clock size={12} />
                        </span>
                      </div>
                      <div className="mb-4 pl-2">
                        <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight truncate">
                          {pUser?.first_name} {pUser?.last_name}
                        </h4>
                        <p
                          className={`text-[10px] font-bold uppercase tracking-widest mt-1 truncate ${booking.triage_priority === "Red" ? "text-rose-500" : "text-emerald-500"}`}
                        >
                          Priority: {booking.triage_priority || "Standard"}
                        </p>
                      </div>
                      <div className="flex justify-between items-center pt-4 border-t border-slate-50 pl-2">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[180px] italic">
                          "
                          {booking.chief_complaint ||
                            booking.triage_result ||
                            "Awaiting details..."}
                          "
                        </span>
                        <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-[#00695C] group-hover:text-white transition-colors">
                          <ChevronRight size={16} />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* OUTPATIENT STREAM (HORIZONTAL QUEUE) */}
          <div className="pt-2">
            <div className="flex justify-between items-center mb-4 px-2">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <ClipboardList size={14} className="text-[#00695C]" />{" "}
                Outpatient Referral Stream ({outpatientReferrals.length})
              </h3>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-6 custom-scrollbar">
              {outpatientReferrals.length === 0 ? (
                <div className="w-full p-8 border-2 border-dashed border-slate-200 rounded-[2rem] text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                  No active incoming referrals
                </div>
              ) : (
                outpatientReferrals.map((ref) => {
                  const rUser = Array.isArray(ref.users)
                    ? ref.users[0]
                    : ref.users;
                  return (
                    <div
                      key={ref.id}
                      onClick={() => handleSelectPatient(rUser, 2)}
                      className="min-w-[320px] bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-lg hover:border-[#00695C] cursor-pointer transition-all group relative overflow-hidden"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-orange-400" />

                      <div className="flex justify-between items-start mb-4 pl-2">
                        <span className="bg-orange-50 text-orange-600 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5">
                          EXTERNAL
                        </span>
                        <span className="bg-slate-50 text-slate-400 px-2 py-1 rounded-md text-[9px] font-bold uppercase">
                          <Clock size={12} />
                        </span>
                      </div>
                      <div className="mb-4 pl-2">
                        <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight truncate">
                          {rUser?.first_name} {rUser?.last_name}
                        </h4>
                        <p className="text-[10px] font-bold text-[#00695C] uppercase tracking-widest mt-1 truncate">
                          From: {ref.origin?.name}
                        </p>
                      </div>
                      <div className="flex justify-between items-center pt-4 border-t border-slate-50 pl-2">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[180px] italic">
                          "{ref.chief_complaint}"
                        </span>
                        <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-[#00695C] group-hover:text-white transition-colors">
                          <ChevronRight size={16} />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE WORKSPACE */}
      {selectedResident && (
        <div className="animate-in slide-in-from-bottom-8 duration-700 flex-1 flex flex-col min-h-0">
          <button
            onClick={handleFullReset}
            className="mb-6 flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-800 transition-colors w-max"
          >
            <X size={14} /> Close Workspace
          </button>

          <div className="grid grid-cols-12 gap-8 flex-1 min-h-0">
            {/* LEFT PANEL: PATIENT INFO & VERIFICATION */}
            <div className="col-span-4 space-y-6">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 text-center relative overflow-hidden">
                <div className="w-24 h-24 bg-slate-50 rounded-3xl mx-auto flex items-center justify-center text-slate-300 mb-6 border border-slate-100">
                  <User size={48} />
                </div>
                <h2 className="text-2xl font-black text-slate-800 uppercase leading-none">
                  {selectedResident.first_name} {selectedResident.last_name}
                </h2>
                <div className="flex justify-center gap-2 mt-3 mb-6">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md">
                    {selectedResident.gender || "N/A"}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md">
                    {selectedResident.medical_id || "NO ID"}
                  </span>
                </div>
                {selectedResident.is_philhealth_verified && (
                  <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                    <ShieldCheck size={14} /> Verified YAKAP
                  </div>
                )}
              </div>

              <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden">
                <ScanFace
                  className="absolute -right-6 -top-6 text-white/5 rotate-12"
                  size={150}
                />
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2 relative z-10">
                  Verification Protocol
                </h3>
                <div className="space-y-3 relative z-10">
                  <button
                    onClick={handleLivenessProtocol}
                    className="w-full p-4 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white flex items-center justify-between transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <ScanFace size={16} className="text-emerald-400" />{" "}
                      Liveness Scan
                    </div>
                    {step > 1 ? (
                      <CheckCircle size={16} className="text-emerald-400" />
                    ) : (
                      <ArrowRight size={14} />
                    )}
                  </button>
                  <button
                    onClick={verifyPhilHealth}
                    disabled={step < 2}
                    className="w-full p-4 bg-emerald-600 hover:bg-emerald-500 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white flex items-center justify-between transition-all disabled:opacity-30 disabled:hover:bg-emerald-600"
                  >
                    <div className="flex items-center gap-3">
                      <ShieldCheck size={16} /> Verify YAKAP (3-Day)
                    </div>
                    {step > 2 ? (
                      <CheckCircle size={16} className="text-white" />
                    ) : (
                      <ArrowRight size={14} />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT PANEL: CHARTING & DISPATCH */}
            <div className="col-span-8 flex flex-col gap-6 min-h-0">
              {/* STEP 2: CHARTING */}
              <div
                className={`bg-white p-10 rounded-[2.5rem] shadow-sm border transition-all ${step === 3 ? "border-[#00695C] shadow-lg ring-4 ring-emerald-50" : "border-slate-100 opacity-50 pointer-events-none"}`}
              >
                {/* AI Triage Display (Only shows if app data exists) */}
                {triageData && (
                  <div className="mb-8 p-6 bg-slate-900 rounded-[1.5rem] text-white shadow-inner relative overflow-hidden animate-in fade-in zoom-in duration-300">
                    <div className="absolute -right-4 -top-4 opacity-10">
                      <Activity size={100} />
                    </div>
                    <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2 relative z-10">
                      Mobile App AI Triage
                    </h4>
                    <div className="grid grid-cols-2 gap-4 relative z-10">
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase font-bold mb-1">
                          Priority
                        </p>
                        <p
                          className={`text-sm font-black uppercase tracking-widest ${triageData.category === "Red" || triageData.category === "Emergency" ? "text-rose-500" : triageData.category === "Yellow" || triageData.category === "Urgent" ? "text-amber-400" : "text-emerald-400"}`}
                        >
                          {triageData.category ||
                            triageData.urgency ||
                            "Standard"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase font-bold mb-1">
                          Reported Symptoms
                        </p>
                        <p className="text-xs font-medium text-slate-200 italic line-clamp-2">
                          "
                          {triageData.raw_symptoms ||
                            triageData.chief_complaint}
                          "
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-3">
                      <Stethoscope className="text-[#00695C]" /> Awaiting Vitals
                    </h3>
                    <p className="text-xs text-slate-400 font-medium italic mt-2">
                      Status locked. Open Charting Node to log physical vitals.
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      navigate("/charting", {
                        state: { intakeMode: true, patient: selectedResident },
                      })
                    }
                    disabled={step < 3}
                    className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[#00695C] flex items-center gap-2 shadow-xl disabled:opacity-50 transition-all active:scale-95"
                  >
                    Launch Charting Node
                  </button>
                </div>
              </div>

              {/* STEP 3: DISPATCH */}
              <div
                className={`bg-white p-10 rounded-[2.5rem] shadow-sm border transition-all flex-1 flex flex-col min-h-0 ${step === 4 ? "border-[#00695C] shadow-lg" : "border-slate-100 opacity-40 pointer-events-none"}`}
              >
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 px-1 flex items-center gap-2">
                  Clinician Dispatch
                </h3>

                <div className="grid grid-cols-2 gap-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  {availableDoctors.length > 0 ? (
                    availableDoctors.map((doc) => (
                      <div
                        key={doc.user_id}
                        onClick={() => setSelectedDoctor(doc)}
                        className={`p-5 rounded-2xl border-2 cursor-pointer flex flex-col justify-between transition-all group ${selectedDoctor?.user_id === doc.user_id ? "border-[#00695C] bg-emerald-50 scale-[1.02] shadow-md" : "border-slate-100 bg-gray-50 hover:border-emerald-200"}`}
                      >
                        <div className="flex justify-between items-start">
                          <p className="text-sm font-black text-slate-800 uppercase">
                            Dr. {doc.users.last_name}
                          </p>
                          {selectedDoctor?.user_id === doc.user_id && (
                            <CheckCircle size={16} className="text-[#00695C]" />
                          )}
                        </div>
                        <div className="flex justify-between items-end mt-4 pt-3 border-t border-slate-200/50">
                          <span className="text-[9px] font-bold text-slate-500 uppercase">
                            {doc.telemed_profile?.specialty || "General"}
                          </span>
                          <span className="text-[9px] font-black text-[#00695C] flex items-center gap-1">
                            <Clock size={10} />{" "}
                            {doc.telemed_profile?.current_wait_minutes || 0}m
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-2 text-center py-10 text-[10px] font-bold text-slate-300 uppercase italic">
                      No Doctors Synced To This Facility
                    </div>
                  )}
                </div>

                <div className="mt-8 pt-6 border-t border-slate-50 flex justify-end gap-4 shrink-0">
                  <button
                    onClick={handleFullReset}
                    className="px-8 py-4 rounded-2xl text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:bg-slate-50 transition-colors"
                  >
                    Abort
                  </button>
                  <button
                    onClick={finalizeHandover}
                    disabled={!selectedDoctor || loading}
                    className="bg-[#00695C] text-white px-12 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-900 disabled:opacity-30 flex justify-center items-center gap-3 shadow-xl shadow-emerald-900/10 active:scale-95 transition-all"
                  >
                    {loading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Share2 size={16} />
                    )}{" "}
                    Handover to Queue
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR SCANNER MODAL */}
      {showScanner && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-2xl z-[300] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in border border-white/10">
            <div className="p-8 border-b flex justify-between items-center bg-gray-50 uppercase font-bold text-[10px] tracking-widest text-slate-400">
              Scan ID{" "}
              <button
                onClick={() => setShowScanner(false)}
                className="hover:text-rose-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-2 bg-black h-[400px]">
              <Scanner
                onScan={handleQrScan}
                components={{ audio: false, finder: true }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssistedBooking;
