import React, { useState, useEffect, useRef } from "react";
import {
  Video,
  User,
  Send,
  Activity,
  PhoneOff,
  Mic,
  MicOff,
  BrainCircuit,
  History,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { ZegoUIKitPrebuilt } from "@zegocloud/zego-uikit-prebuilt";
import { GoogleGenerativeAI } from "@google/generative-ai";

const APP_ID = 1673152262;
const SERVER_SECRET = "a19851b6acec66db9bff65413ffc2c2c";
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";

const Telemed = () => {
  const [queue, setQueue] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  const videoContainerRef = useRef(null);
  const zpRef = useRef(null);
  const recognitionRef = useRef(null);

  const fetchData = async () => {
    const { data: qData } = await supabase
      .from("telemed_sessions")
      .select(
        `id, status, meeting_link, patient:users!patient_id (id, first_name, last_name, medical_conditions)`,
      )
      .in("status", ["scheduled", "active", "PENDING"])
      .order("id", { ascending: true });

    const { data: hData } = await supabase
      .from("telemed_sessions")
      .select(`id, ended_at, patient:users!patient_id (first_name, last_name)`)
      .eq("status", "completed")
      .order("ended_at", { ascending: false })
      .limit(4);

    if (qData) setQueue(qData);
    if (hData) setSessionHistory(hData);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("telemed-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "telemed_sessions" },
        fetchData,
      )
      .subscribe();

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.onresult = (event) => {
        let current = "";
        for (let i = 0; i < event.results.length; i++) {
          current += event.results[i][0].transcript + " ";
        }
        setTranscript(current);
      };
    }

    return () => supabase.removeChannel(channel);
  }, []);

  const handleAccept = async (session) => {
    let roomId = session.meeting_link || `ATAMAN-${session.id.slice(0, 5)}`;
    await supabase
      .from("telemed_sessions")
      .update({ status: "active", meeting_link: roomId })
      .eq("id", session.id);
    setActiveSession({ ...session, meeting_link: roomId });

    setTimeout(() => {
      if (videoContainerRef.current) {
        const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
          APP_ID,
          SERVER_SECRET,
          roomId,
          Date.now().toString(),
          "Dr. Staff",
        );
        const zp = ZegoUIKitPrebuilt.create(kitToken);
        zpRef.current = zp;
        zp.joinRoom({
          container: videoContainerRef.current,
          scenario: { mode: ZegoUIKitPrebuilt.OneONoneCall },
          showPreJoinView: false,
          onLeaveRoom: () => handleEndCall(),
        });
      }
    }, 100);
  };

  const handleAISummarize = async () => {
    if (!transcript) return;
    setIsGeneratingAI(true);
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `Medical scribe: Summarize into SOAP format: "${transcript}"`;
      const result = await model.generateContent(prompt);
      setNote(result.response.text());
    } catch (e) {
      console.error(e);
    }
    setIsGeneratingAI(false);
  };

  const handleEndCall = async () => {
    if (zpRef.current) zpRef.current.destroy();
    if (isListening) recognitionRef.current.stop();
    setIsListening(false);
    if (activeSession) {
      await supabase
        .from("telemed_sessions")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", activeSession.id);
    }
    setActiveSession(null);
  };

  if (loading)
    return (
      <div className="h-screen flex items-center justify-center text-gray-400 font-medium text-[10px] tracking-widest uppercase">
        Syncing Virtual Hub...
      </div>
    );

  return (
    <div className="p-10 bg-[#F8FAFC] min-h-screen font-sans">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">
          Tele-Ataman Console
        </h1>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.2em] mt-1">
          Live Clinical Interface
        </p>
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* LEFT PANEL: QUEUE (Col 3) */}
        <div className="col-span-3 space-y-6">
          <div className="bg-[#00695C] p-6 rounded-[2rem] text-white shadow-lg flex items-center justify-between">
            <div>
              <h3 className="text-[9px] font-semibold uppercase tracking-widest opacity-70">
                Waiting
              </h3>
              <div className="text-4xl font-bold">
                {queue.length.toString().padStart(2, "0")}
              </div>
            </div>
            <div className="p-3 bg-white/10 rounded-2xl">
              <Video size={20} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm min-h-[300px]">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6 px-2">
              Patient Queue
            </h4>
            <div className="space-y-3">
              {queue.map((s) => (
                <div
                  key={s.id}
                  className={`p-4 rounded-2xl border transition-all ${activeSession?.id === s.id ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-transparent"}`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs font-bold text-gray-800 uppercase">
                        {s.patient.first_name}
                      </p>
                      <p className="text-[9px] font-medium text-gray-400 uppercase tracking-tighter">
                        {s.patient.medical_conditions || "Checkup"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleAccept(s)}
                      className="p-2 bg-white rounded-xl shadow-sm hover:text-primary transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 px-2">
              Recent
            </h4>
            {sessionHistory.map((h) => (
              <div
                key={h.id}
                className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 px-2"
              >
                <span className="text-[10px] font-semibold text-gray-600 uppercase">
                  {h.patient.first_name}
                </span>
                <span className="text-[8px] text-gray-300">
                  {new Date(h.ended_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT CONTENT: VIDEO & WORKSPACE (Col 9) */}
        <div className="col-span-9 flex flex-col gap-6">
          {/* LARGE HERO VIDEO */}
          <div className="bg-gray-900 rounded-[3rem] shadow-2xl relative overflow-hidden border-[8px] border-white aspect-video lg:aspect-auto lg:h-[500px]">
            {activeSession ? (
              <div ref={videoContainerRef} className="w-full h-full" />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-700 space-y-4">
                <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center animate-pulse">
                  <Video size={32} className="text-gray-600" />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-[0.4em] opacity-40 text-center">
                  Establish Link to Begin Consultation
                </p>
              </div>
            )}
          </div>

          {/* WORKSPACE ROW */}
          <div className="grid grid-cols-2 gap-6 h-[300px]">
            {/* TRANSCRIPTION BOX */}
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Mic size={14} className="text-emerald-500" /> Live
                  Transcription
                </h3>
                <button
                  onClick={() => {
                    if (isListening) {
                      recognitionRef.current.stop();
                      setIsListening(false);
                    } else {
                      setTranscript("");
                      recognitionRef.current.start();
                      setIsListening(true);
                    }
                  }}
                  className={`p-2 rounded-xl transition-all ${isListening ? "bg-red-500 text-white" : "bg-gray-100 text-gray-400"}`}
                >
                  {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto text-xs font-medium text-gray-500 italic leading-relaxed bg-gray-50/50 p-4 rounded-2xl">
                {transcript || "Waiting for audio input..."}
              </div>
              <button
                onClick={handleAISummarize}
                disabled={!transcript || isGeneratingAI}
                className="mt-4 w-full py-3 bg-emerald-50 text-emerald-600 rounded-xl font-bold text-[9px] uppercase tracking-widest hover:bg-emerald-100 disabled:opacity-30 flex justify-center items-center gap-2"
              >
                {isGeneratingAI ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <BrainCircuit size={14} />
                )}
                {isGeneratingAI ? "Processing..." : "Generate AI Note"}
              </button>
            </div>

            {/* AI NOTE / CHARTING BOX */}
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col relative overflow-hidden">
              <div className="absolute right-0 top-0 p-8 opacity-5 pointer-events-none">
                <Activity size={80} />
              </div>
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <BrainCircuit size={14} className="text-primary" /> Clinical
                Note
              </h3>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="flex-1 bg-gray-50/50 rounded-2xl p-4 text-xs font-medium text-gray-700 outline-none focus:ring-1 focus:ring-primary/20 resize-none border-none"
                placeholder="Review and finalize medical documentation..."
              />
              <button
                onClick={() => {
                  supabase.from("clinical_notes").insert({
                    patient_id: activeSession.patient.id,
                    subjective_notes: note,
                    created_at: new Date(),
                  });
                  alert("Pushed to Patient Record");
                  handleEndCall();
                }}
                disabled={!activeSession || !note}
                className="mt-4 w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-[9px] uppercase tracking-widest hover:bg-black disabled:opacity-20 flex justify-center items-center gap-2 transition-all shadow-lg"
              >
                <Send size={12} /> Commit to Central Record
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Telemed;
