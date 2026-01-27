import React, { useState, useEffect } from "react";
import { Video, User, Send, Activity, Loader2, PhoneOff } from "lucide-react";
import { supabase } from "../supabaseClient";

const Telemed = () => {
  const [queue, setQueue] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);

  // 1. Fetch live queue from Supabase
  const fetchQueue = async () => {
    const { data, error } = await supabase
      .from("telemed_sessions")
      .select(
        `
        id, 
        status, 
        meeting_link,
        patient:users!patient_id (id, first_name, last_name, medical_conditions)
      `,
      )
      .in("status", ["scheduled", "active"])
      .order("id", { ascending: true });

    if (!error) setQueue(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchQueue();

    // Real-time subscription: Update queue when sessions are created or updated
    const channel = supabase
      .channel("telemed-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "telemed_sessions" },
        fetchQueue,
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // 2. Start Call (Update status to active)
  const handleAccept = async (session) => {
    const { error } = await supabase
      .from("telemed_sessions")
      .update({ status: "active" })
      .eq("id", session.id);

    if (!error) setActiveSession(session);
  };

  // 3. Save Clinical Notes
  const handleSaveNote = async () => {
    if (!activeSession || !note) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("clinical_notes").insert({
      patient_id: activeSession.patient.id,
      doctor_id: user.id,
      subjective_notes: note,
      created_at: new Date().toISOString(),
    });

    if (!error) {
      alert("Note successfully added to Patient Record.");
      setNote("");
    }
  };

  // 4. End Call
  const handleEndCall = async () => {
    if (!activeSession) return;
    await supabase
      .from("telemed_sessions")
      .update({ status: "completed" })
      .eq("id", activeSession.id);
    setActiveSession(null);
  };

  if (loading)
    return (
      <div className="p-10 text-center font-black text-gray-400 animate-pulse">
        ESTABLISHING SECURE CONNECTION...
      </div>
    );

  return (
    <div className="p-10 bg-[#F8FAFC] min-h-screen">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">
          Tele-Ataman Console
        </h1>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mt-1">
          Live Virtual Consultation Hub
        </p>
      </div>

      <div className="grid grid-cols-12 gap-10">
        {/* LEFT SIDE: QUEUE (Referral Center Style) */}
        <div className="col-span-4 space-y-6">
          <div className="bg-[#00695C] p-8 rounded-[2.5rem] text-white shadow-xl shadow-emerald-900/20 relative overflow-hidden">
            <div className="absolute right-[-10px] top-[-10px] opacity-10 rotate-12">
              <Video size={120} />
            </div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-70">
              Live Patient Queue
            </h3>
            <div className="text-5xl font-black mt-2">
              {queue.length.toString().padStart(2, "0")}
            </div>
          </div>

          <div className="space-y-4">
            {queue.length === 0 ? (
              <div className="p-10 text-center bg-white rounded-[2rem] border border-dashed border-gray-200 text-gray-300 font-bold text-xs uppercase tracking-widest">
                No patients waiting
              </div>
            ) : (
              queue.map((session) => (
                <div
                  key={session.id}
                  className={`p-6 rounded-[2rem] border transition-all ${activeSession?.id === session.id ? "bg-white border-[#00695C] shadow-lg ring-2 ring-emerald-500/10" : "bg-white border-gray-100"}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 border border-gray-100">
                        <User size={18} />
                      </div>
                      <div>
                        <p className="font-black text-gray-800 text-sm uppercase leading-none">
                          {session.patient?.first_name}{" "}
                          {session.patient?.last_name}
                        </p>
                        <p className="text-[9px] font-bold text-gray-400 mt-2 uppercase tracking-widest">
                          {session.patient?.medical_conditions || "Follow-up"}
                        </p>
                      </div>
                    </div>
                    {activeSession?.id !== session.id && (
                      <button
                        onClick={() => handleAccept(session)}
                        className="bg-primary text-white px-5 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest hover:scale-105 transition-all shadow-md"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT SIDE: VIDEO & NOTES */}
        <div className="col-span-8 space-y-8">
          {/* VIDEO FRAME */}
          <div className="aspect-video bg-gray-900 rounded-[3rem] shadow-2xl flex flex-col items-center justify-center relative overflow-hidden border-[12px] border-white">
            {activeSession ? (
              <div className="w-full h-full relative">
                <iframe
                  src={activeSession.meeting_link}
                  allow="camera; microphone; fullscreen; display-capture"
                  className="w-full h-full border-none"
                  title="Telemed Call"
                />
                <button
                  onClick={handleEndCall}
                  className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white p-4 rounded-full shadow-2xl hover:bg-red-700 transition-all group"
                >
                  <PhoneOff
                    size={24}
                    className="group-hover:scale-110 transition-transform"
                  />
                </button>
              </div>
            ) : (
              <>
                <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                  <Video size={32} className="text-gray-600 animate-pulse" />
                </div>
                <p className="text-gray-500 font-black uppercase text-[10px] tracking-[0.4em]">
                  Awaiting clinical selection...
                </p>
              </>
            )}
          </div>

          {/* NOTES AREA */}
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-8 border-b border-gray-50 pb-4">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] flex items-center gap-2">
                <Activity size={14} className="text-primary" /> Clinical
                Assessment
              </h3>
              {activeSession && (
                <span className="text-[10px] font-black text-primary uppercase bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100">
                  Charting for: {activeSession.patient.first_name}
                </span>
              )}
            </div>

            <textarea
              className="w-full bg-gray-50 border-none rounded-[2rem] p-8 text-sm font-bold text-gray-600 focus:ring-2 focus:ring-primary min-h-[150px] outline-none transition-all placeholder:text-gray-300"
              placeholder="Enter subjective notes and observations here..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={!activeSession}
            />

            <div className="flex justify-end mt-8">
              <button
                onClick={handleSaveNote}
                disabled={!activeSession || !note}
                className="bg-primary text-white px-12 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-emerald-900/20 hover:bg-black hover:shadow-none transition-all flex items-center gap-3 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Send size={16} /> Push to Patient Record
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Telemed;
