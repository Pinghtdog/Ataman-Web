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
  Info,
  X,
  FileText,
  Calendar,
  Clock,
  Maximize2,
  Minimize2,
  Phone,
  ChevronDown,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { ZegoUIKitPrebuilt } from "@zegocloud/zego-uikit-prebuilt";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";

const APP_ID = 1673152262;
const SERVER_SECRET = "a19851b6acec66db9bff65413ffc2c2c";
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY_TELEMEDICINE;

const Telemed = () => {
  const [queue, setQueue] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedPatientId, setExpandedPatientId] = useState(null);
  const [showAcceptConfirm, setShowAcceptConfirm] = useState(null);

  const [isRegistryCollapsed, setIsRegistryCollapsed] = useState(false);

  const [isVideoMinimized, setIsVideoMinimized] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [historyNote, setHistoryNote] = useState(null);
  const [loadingHistoryNote, setLoadingHistoryNote] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  const videoContainerRef = useRef(null);
  const zpRef = useRef(null);
  const recognitionRef = useRef(null);

  const groq = new Groq({
    apiKey: GROQ_API_KEY,
    dangerouslyAllowBrowser: true,
  });

  const fetchData = async () => {
    const { data: qData } = await supabase
      .from("telemed_sessions")
      .select(
        `id, status, meeting_link, patient:users!patient_id (id, first_name, last_name, medical_conditions, philhealth_id)`,
      )
      .in("status", ["scheduled", "active", "PENDING"])
      .order("id", { ascending: true });

    const { data: hData } = await supabase
      .from("telemed_sessions")
      .select(
        `id, ended_at, patient:users!patient_id (id, first_name, last_name, medical_conditions)`,
      )
      .eq("status", "completed")
      .order("ended_at", { ascending: false })
      .limit(6);

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
      recognitionRef.current.lang = "en-US";
      recognitionRef.current.onresult = (event) => {
        let fullText = "";
        for (let i = 0; i < event.results.length; i++) {
          fullText += event.results[i][0].transcript + " ";
        }
        setTranscript(fullText);
      };
    }
    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    if (activeSession && videoContainerRef.current && !zpRef.current) {
      const initZego = async () => {
        const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
          APP_ID,
          SERVER_SECRET,
          activeSession.meeting_link,
          "staff-node-01",
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
      };
      initZego();
    }
  }, [activeSession]);

  const executeAcceptance = async () => {
    if (!showAcceptConfirm) return;
    const session = showAcceptConfirm;
    let roomId = session.meeting_link || `ATAMAN-${session.id.slice(0, 5)}`;
    await supabase
      .from("telemed_sessions")
      .update({ status: "active", meeting_link: roomId })
      .eq("id", session.id);
    setActiveSession({ ...session, meeting_link: roomId });
    setShowAcceptConfirm(null);
  };

  const handleEndCall = async () => {
    if (zpRef.current) {
      zpRef.current.destroy();
      zpRef.current = null;
    }
    if (isListening) recognitionRef.current.stop();
    setIsListening(false);
    if (activeSession) {
      await supabase
        .from("telemed_sessions")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", activeSession.id);
    }
    setActiveSession(null);
    setTranscript("");
    setNote("");
    fetchData();
  };

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setTranscript("");
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const handleAISummarize = async () => {
    if (!transcript || transcript.trim().length < 10)
      return alert("Transcript too short.");
    setIsGeneratingAI(true);
    try {
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are a highly skilled Medical Scribe. 
          Your task is to take a messy, conversational transcript between a doctor and a patient and organize it into a professional medical SOAP note.
          
          RULES:
          1. Use professional medical terminology.
          2. Filter out small talk (like 'how is the weather').
          3. Structure the output clearly as:
             - SUBJECTIVE: Chief complaint, history of illness, symptoms.
             - OBJECTIVE: Mentioned vitals, physical findings.
             - ASSESSMENT: Differential diagnosis or primary concern.
             - PLAN: Prescriptions, lab tests, and follow-ups.
          4. If a medication is mentioned, ensure the dosage is noted.`,
          },
          { role: "user", content: `Transcript: "${transcript}"` },
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
      });
      setNote(chatCompletion.choices[0]?.message?.content || "");
    } catch (error) {
      console.error(error);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleViewHistory = async (session) => {
    setSelectedHistory(session);
    setLoadingHistoryNote(true);
    const { data } = await supabase
      .from("clinical_notes")
      .select("*")
      .eq("patient_id", session.patient.id)
      .order("created_at", { ascending: false })
      .limit(1);
    setHistoryNote(data?.[0] || null);
    setLoadingHistoryNote(false);
  };

  const handleSaveNote = async () => {
    if (!activeSession || !note) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("clinical_notes").insert({
      patient_id: activeSession.patient.id,
      doctor_id: user.id,
      subjective_notes: note,
      created_at: new Date().toISOString(),
    });
    alert("Record Committed Successfully.");
  };

  if (loading)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-white font-sans text-emerald-600">
        <div className="relative mb-6 flex items-center justify-center">
          <div className="absolute h-16 w-16 animate-ping rounded-full bg-emerald-100 opacity-75"></div>
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600"></div>
        </div>
        <h2 className="text-lg font-bold tracking-tight">
          Syncing Consultation Queues..
        </h2>
      </div>
    );

  return (
    <div className="p-10 bg-[#F8FAFC] min-h-screen font-sans h-screen flex flex-col">
      <div className="mb-10 shrink-0">
        <h1 className="text-4xl font-black text-slate-800 tracking-tighter leading-none text-primary">
          Tele-Ataman Hub
        </h1>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.2em] mt-2 italic">
          / Operational Node / Clinical Interface
        </p>
      </div>

      <div className="grid grid-cols-12 gap-10 flex-1 min-h-0">
        {/* LEFT PANEL */}
        <div className="col-span-4 flex flex-col gap-6 min-h-0">
          <div className="relative shrink-0">
            {activeSession && (
              <div className="absolute inset-0 bg-emerald-500/20 rounded-[2.5rem] animate-ping" />
            )}
            <div
              className={`relative z-10 p-8 rounded-[2.5rem] text-white shadow-2xl flex items-center justify-between transition-all duration-700 overflow-hidden ${activeSession ? "bg-emerald-600 shadow-emerald-500/40" : "bg-[#00695C]"}`}
            >
              <div className="absolute -right-6 -top-6 opacity-10">
                <Video size={140} strokeWidth={1} />
              </div>
              <div className="relative z-10">
                <h3 className="text-[9px] font-bold uppercase tracking-widest opacity-60 mb-2 leading-none">
                  {activeSession
                    ? "Encrypted Link Active"
                    : "Consultation Queue"}
                </h3>
                <div className="text-6xl font-black tabular-nums tracking-tighter italic leading-none">
                  {queue.length.toString().padStart(2, "0")}
                </div>
              </div>
              <Activity
                size={28}
                className={activeSession ? "animate-pulse" : "opacity-20"}
              />
            </div>
          </div>

          {/* --- COLLAPSIBLE REGISTRY --- */}
          <div
            className={`bg-white p-8 rounded-[1rem] border border-slate-200 shadow-sm flex flex-col overflow-hidden transition-all duration-500 ${isRegistryCollapsed ? "min-h-0" : "min-h-[350px] flex-1"}`}
          >
            <div
              onClick={() => setIsRegistryCollapsed(!isRegistryCollapsed)}
              className="flex justify-between items-center cursor-pointer group mb-4 shrink-0"
            >
              <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest group-hover:text-primary transition-colors">
                Registry{" "}
                <span className="ml-2 text-slate-200">
                  {queue.length} Patients
                </span>
              </h4>
              <ChevronDown
                size={14}
                className={`text-slate-300 transition-transform duration-300 ${isRegistryCollapsed ? "" : "rotate-180"}`}
              />
            </div>

            <div
              className={`space-y-3 overflow-y-auto no-scrollbar pr-1 transition-all duration-500 ${isRegistryCollapsed ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100 flex-1"}`}
            >
              {queue.map((s, index) => (
                <div
                  key={s.id}
                  onClick={() =>
                    setExpandedPatientId(
                      expandedPatientId === s.id ? null : s.id,
                    )
                  }
                  className={`group px-5 py-4 rounded-[1.5rem] border transition-all duration-300 ${activeSession?.id === s.id ? "bg-emerald-50 border-emerald-300 shadow-lg" : "bg-white border-slate-100 hover:border-emerald-200"}`}
                >
                  <div className="flex justify-between items-center gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div
                        className={`w-11 h-11 rounded-[1rem] shrink-0 flex items-center justify-center transition-colors ${activeSession?.id === s.id ? "bg-emerald-500 text-white shadow-lg" : "bg-slate-50 text-slate-300 border border-slate-100"}`}
                      >
                        <User size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-800 uppercase tracking-tighter leading-tight">
                          {s.patient.first_name} {s.patient.last_name}
                        </p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 italic truncate">
                          {s.patient.medical_conditions || "Routine checkup"}
                        </p>
                      </div>
                    </div>
                    {index === 0 && !activeSession && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAcceptConfirm(s);
                        }}
                        className="shrink-0 w-10 h-10 rounded-2xl bg-emerald-600 text-white shadow-xl hover:bg-slate-900 transition-all active:scale-90 flex items-center justify-center"
                      >
                        <Phone size={16} fill="currentColor" />
                      </button>
                    )}
                  </div>
                  {expandedPatientId === s.id && (
                    <div className="mt-5 pt-5 border-t border-slate-100 animate-in fade-in slide-in-from-top-1 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
                          System ID
                        </span>
                        <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">
                          {s.patient.philhealth_id || "NOT LINKED"}
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-700 font-medium bg-emerald-50/50 p-4 rounded-2xl border border-emerald-50 leading-relaxed italic">
                        "
                        {s.patient.medical_conditions ||
                          "Patient awaiting initial clinical assessment"}
                        "
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div
            className={`bg-white p-8 rounded-[1rem] border border-slate-200 shadow-sm shrink-0 transition-all duration-500 ${isRegistryCollapsed ? "flex-1 overflow-hidden flex flex-col" : "h-fit"}`}
          >
            <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-6 px-2 flex items-center gap-2 uppercase">
              <History size={14} /> Records History
            </h4>
            <div
              className={`space-y-2 overflow-y-auto no-scrollbar ${isRegistryCollapsed ? "flex-1" : ""}`}
            >
              {sessionHistory.map((h) => (
                <div
                  key={h.id}
                  onClick={() => handleViewHistory(h)}
                  className="flex justify-between items-center p-3.5 bg-slate-50 rounded-2xl cursor-pointer hover:bg-emerald-50 border border-transparent transition-all group"
                >
                  <span className="text-[11px] font-black text-slate-600 uppercase group-hover:text-emerald-700">
                    {h.patient.first_name} {h.patient.last_name[0]}.
                  </span>
                  <ChevronRight size={14} className="text-gray-300 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT CONTENT */}
        <div className="col-span-8 flex flex-col gap-8 min-h-0">
          <div
            className={`bg-slate-900 rounded-[2.5rem] shadow-2xl relative overflow-hidden border-[12px] border-white transition-all duration-500 ease-in-out shrink-0 ${isVideoMinimized ? "h-[240px]" : "h-[450px]"}`}
          >
            {activeSession ? (
              <>
                <div ref={videoContainerRef} className="w-full h-full" />
                <div className="absolute top-8 right-8 flex gap-3 z-[100]">
                  <button
                    onClick={() => setIsVideoMinimized(!isVideoMinimized)}
                    className="p-3 bg-white/20 hover:bg-white/40 text-white rounded-2xl backdrop-blur-md transition-all shadow-lg"
                  >
                    {isVideoMinimized ? (
                      <Maximize2 size={20} />
                    ) : (
                      <Minimize2 size={20} />
                    )}
                  </button>
                  <button
                    onClick={handleEndCall}
                    className="p-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl shadow-xl transition-all border-b-2 border-rose-900"
                  >
                    <PhoneOff size={20} />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-700 space-y-6">
                <div className="w-24 h-24 bg-slate-800 rounded-[2.5rem] flex items-center justify-center shadow-inner">
                  <Video size={40} className="opacity-20" />
                </div>
                <p className="text-[12px] font-black uppercase tracking-[0.6em] opacity-30">
                  Clinician Portal Standby
                </p>
              </div>
            )}
          </div>

          <div
            className={`grid gap-8 transition-all duration-500 shrink-0 pb-10 ${isVideoMinimized ? "grid-cols-2 h-[650px]" : "grid-cols-2 h-[380px]"}`}
          >
            <div className="bg-white p-10 rounded-[1rem] shadow-sm border border-slate-200 flex flex-col group uppercase min-h-0">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 leading-none">
                  <Mic size={16} className="text-emerald-500" /> Scribe feed
                </h3>
                <button
                  onClick={toggleListening}
                  className={`p-3 rounded-2xl transition-all shadow-xl ${isListening ? "bg-rose-500 text-white animate-pulse" : "bg-slate-50 text-slate-400"}`}
                >
                  {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto text-[14px] font-medium text-slate-500 italic leading-relaxed bg-slate-50 p-8 rounded-[1rem] custom-scrollbar border border-transparent group-hover:border-emerald-100 transition-all">
                {transcript || "Waiting for clinical handshake..."}
              </div>
              <button
                onClick={handleAISummarize}
                disabled={!transcript || isGeneratingAI}
                className="mt-8 w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-30 flex justify-center items-center gap-3 shadow-lg"
              >
                {isGeneratingAI ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <BrainCircuit size={16} />
                )}{" "}
                summary process
              </button>
            </div>

            <div className="bg-white p-10 rounded-[1rem] shadow-sm border border-slate-200 flex flex-col relative overflow-hidden group uppercase min-h-0">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2 leading-none uppercase">
                <FileText size={16} className="text-slate-900" /> note
                disposition
              </h3>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="flex-1 bg-gray-50 rounded-[1rem] p-8 text-[14px] font-medium text-slate-700 outline-none focus:ring-2 focus:ring-slate-100 resize-none border-none transition-all placeholder:italic"
                placeholder="Medical summary content..."
              />
              <button
                onClick={handleSaveNote}
                disabled={!activeSession || !note}
                className="mt-8 w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[#004D40] disabled:opacity-20 flex justify-center items-center gap-3 shadow-xl"
              >
                <Send size={14} /> Commit to Permanent Record
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* --- MODALS --- */}
      {showAcceptConfirm && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[250] p-4"
          onClick={() => setShowAcceptConfirm(null)}
        >
          <div
            className="bg-white rounded-[1rem] shadow-2xl w-full max-w-sm p-10 text-center animate-in zoom-in border border-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-[1rem] flex items-center justify-center mx-auto mb-6 border border-emerald-100 shadow-inner">
              <Phone size={32} fill="currentColor" className="animate-pulse" />
            </div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight leading-tight">
              Secure Handshake
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1 mb-6 italic">
              Clinical Protocol 402-A
            </p>
            <p className="text-sm font-medium text-slate-500 leading-relaxed px-2">
              Establish link with{" "}
              <span className="text-slate-900 font-bold underline decoration-emerald-500 underline-offset-8 uppercase italic">
                {showAcceptConfirm.patient.first_name}{" "}
                {showAcceptConfirm.patient.last_name}
              </span>
              ?
            </p>
            <div className="grid grid-cols-2 gap-4 mt-10">
              <button
                onClick={() => setShowAcceptConfirm(null)}
                className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest rounded-2xl hover:bg-slate-50 transition-all"
              >
                Abort
              </button>
              <button
                onClick={executeAcceptance}
                className="py-4 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-emerald-900/20 hover:bg-emerald-700 transition-all active:scale-95 border-b-4 border-emerald-900"
              >
                Establish Link
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedHistory && (
        <div
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[200] p-4"
          onClick={() => setSelectedHistory(null)}
        >
          <div
            className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-lg p-12 animate-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-10 border-b border-slate-50 pb-8">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-emerald-50 rounded-3xl text-emerald-600">
                  <History size={24} />
                </div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter italic">
                  Archive Node
                </h2>
              </div>
              <button
                onClick={() => setSelectedHistory(null)}
                className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
              >
                <X size={28} />
              </button>
            </div>
            <div className="space-y-8">
              <div className="flex items-center gap-5 p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 shadow-inner">
                <div className="w-14 h-14 bg-white rounded-3xl flex items-center justify-center text-emerald-600 border border-emerald-100 font-black tracking-tighter text-xl italic shadow-sm">
                  {selectedHistory.patient.first_name[0]}
                  {selectedHistory.patient.last_name[0]}
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1 leading-none">
                    Subject Profile
                  </p>
                  <p className="text-xl font-black text-slate-800 uppercase leading-none italic">
                    {selectedHistory.patient.first_name}{" "}
                    {selectedHistory.patient.last_name}
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-3">
                  <FileText size={14} className="text-emerald-500" /> Recorded
                  Clinical Data
                </p>
                <div className="bg-white p-8 rounded-[3rem] border border-slate-100 min-h-[220px] shadow-sm overflow-y-auto max-h-[350px]">
                  {loadingHistoryNote ? (
                    <div className="flex flex-col items-center justify-center h-full py-10 gap-3 opacity-30">
                      <Loader2
                        className="animate-spin text-emerald-400"
                        size={24}
                      />
                      <p className="text-[10px] font-black uppercase tracking-widest tracking-[0.2em]">
                        Synchronizing...
                      </p>
                    </div>
                  ) : historyNote ? (
                    <p className="text-[14px] font-medium text-slate-600 leading-relaxed italic italic">
                      "{historyNote.subjective_notes}"
                    </p>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full py-10 opacity-20 text-center">
                      <Info size={40} className="mb-3" />
                      <p className="text-[10px] font-black uppercase tracking-widest uppercase">
                        Digital record empty
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelectedHistory(null)}
              className="w-full mt-10 py-5 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-3xl shadow-xl shadow-slate-900/20 active:scale-[0.98] transition-all uppercase"
            >
              Terminate View
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Telemed;
