import React, { useState, useEffect, useRef } from "react";
import { Video, User, Send, Activity, PhoneOff } from "lucide-react";
import { supabase } from "../supabaseClient";
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt'; // <--- NEW IMPORT

// ⚠️ PASTE YOUR KEYS FROM ZEGOCLOUD CONSOLE HERE
const APP_ID = 1673152262; // (This should be a number, not a string)
const SERVER_SECRET = "a19851b6acec66db9bff65413ffc2c2c"; 

const Telemed = () => {
  const [queue, setQueue] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  
  // Ref for the video container
  const videoContainerRef = useRef(null);
  // Ref to store the Zego instance so we can destroy it later
  const zpRef = useRef(null);

  // 1. Fetch patients
  const fetchQueue = async () => {
    const { data, error } = await supabase
      .from("telemed_sessions")
      .select(`
        id, 
        status, 
        meeting_link,
        patient:users!patient_id (id, first_name, last_name, medical_conditions)
      `)
      .in("status", ["scheduled", "active", "PENDING", "SCHEDULED"]) 
      .order("id", { ascending: true });

    if (!error) setQueue(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchQueue();
    const channel = supabase.channel("telemed-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "telemed_sessions" }, fetchQueue)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // 2. HELPER: Generate a secure random Room ID
  const generateRoomId = () => {
    return 'ATAMAN-' + Math.random().toString(36).substring(2, 9);
  };

  // 3. Connect & Start Zego
  const handleAccept = async (session) => {
    let meetingLink = session.meeting_link;

    // A. If no room ID exists, create one
    if (!meetingLink || meetingLink === "NULL" || meetingLink.includes("jit.si")) {
      meetingLink = generateRoomId();
      
      // Save it to Supabase so the patient joins the same room
      await supabase
        .from("telemed_sessions")
        .update({ status: "active", meeting_link: meetingLink })
        .eq("id", session.id);
    }

    const updatedSession = { ...session, meeting_link: meetingLink };
    setActiveSession(updatedSession);

    // C. Initialize Zego UI Kit
    setTimeout(async () => {
      if (videoContainerRef.current) {
        // Generate a Kit Token (Client-side generation is fine for testing)
        // In a real app, you'd fetch this from your backend for security
        const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
          APP_ID, 
          SERVER_SECRET, 
          meetingLink, // Room ID
          Date.now().toString(), // Random User ID
          "Dr. Staff" // Your Name
        );

        const zp = ZegoUIKitPrebuilt.create(kitToken);
        zpRef.current = zp;

        zp.joinRoom({
          container: videoContainerRef.current,
          scenario: {
            mode: ZegoUIKitPrebuilt.VideoConference,
          },
          showPreJoinView: false, // <--- SKIPS THE LOBBY (Streamlined)
          showLeavingView: false,
          turnOnMicrophoneWhenJoining: true,
          turnOnCameraWhenJoining: true,
          showUserList: false,
          onLeaveRoom: () => handleEndCall() // Auto-close when you hang up
        });
      }
    }, 100);
  };

  const handleEndCall = async () => {
    // Destroy the Zego instance if it exists
    if (zpRef.current) {
      zpRef.current.destroy();
      zpRef.current = null;
    }

    // Update Database
    if (activeSession) {
      await supabase
        .from("telemed_sessions")
        .update({ status: "completed" })
        .eq("id", activeSession.id);
    }
    setActiveSession(null);
    window.location.reload(); // Quick refresh to clear video artifacts
  };

  const handleSaveNote = async () => {
    if (!activeSession || !note) return;
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from("clinical_notes").insert({
      patient_id: activeSession.patient.id,
      doctor_id: user.id,
      subjective_notes: note,
      created_at: new Date().toISOString(),
    });

    if (!error) {
      alert("Note saved to patient record.");
      setNote("");
    }
  };

  return (
    <div className="p-8 bg-[#F8FAFC] min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-800">Tele-Ataman Console</h1>
        <p className="text-gray-500 text-sm font-medium">Live Virtual Consultation Hub</p>
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* LEFT: QUEUE */}
        <div className="col-span-4 space-y-6">
          <div className="bg-[#00695C] p-8 rounded-[2rem] text-white shadow-xl relative overflow-hidden">
             <Video size={100} className="absolute -right-4 -top-4 opacity-10 rotate-12" />
             <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-70">Live Queue</h3>
             <div className="text-5xl font-black mt-2">{queue.length.toString().padStart(2, "0")}</div>
          </div>

          <div className="space-y-4">
            {queue.length === 0 ? (
              <div className="p-10 text-center bg-white rounded-[2rem] border border-dashed border-gray-200 text-gray-300 font-bold text-xs uppercase">
                No patients waiting
              </div>
            ) : (
              queue.map((session) => (
                <div key={session.id} className={`p-6 rounded-[2rem] border transition-all ${activeSession?.id === session.id ? "bg-white border-emerald-500 shadow-lg ring-2 ring-emerald-100" : "bg-white border-gray-100"}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 border border-gray-100">
                        <User size={18} />
                      </div>
                      <div>
                        <p className="font-black text-gray-800 text-sm uppercase">{session.patient?.first_name} {session.patient?.last_name}</p>
                        <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase">{session.patient?.medical_conditions || "Check-up"}</p>
                      </div>
                    </div>
                    {activeSession?.id !== session.id && (
                      <button onClick={() => handleAccept(session)} className="bg-[#00695C] text-white px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest hover:scale-105 transition-all shadow-md">
                        Connect
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT: VIDEO & NOTES */}
        <div className="col-span-8 space-y-6">
          {/* VIDEO CONTAINER */}
          <div className="aspect-video bg-gray-900 rounded-[3rem] shadow-2xl relative overflow-hidden border-[8px] border-white ring-1 ring-gray-100">
            {activeSession ? (
              // ZEGOCLOUD mounts here
              <div ref={videoContainerRef} className="w-full h-full" />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-600">
                <Video size={48} className="mb-4 opacity-20" />
                <p className="font-black uppercase text-[10px] tracking-widest opacity-50">Awaiting Connection</p>
              </div>
            )}
          </div>

          {/* NOTES */}
          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-gray-100">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><Activity size={14} /> Doctor's Notes</h3>
             </div>
             <textarea 
               value={note} onChange={(e) => setNote(e.target.value)}
               className="w-full bg-gray-50 rounded-[2rem] p-6 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-100 min-h-[120px]" 
               placeholder="Clinical observations..." 
             />
             <div className="flex justify-end mt-4">
               <button onClick={handleSaveNote} disabled={!activeSession} className="bg-gray-900 text-white px-8 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2 disabled:opacity-30">
                 <Send size={14} /> Save Record
               </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Telemed;