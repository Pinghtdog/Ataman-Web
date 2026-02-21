import React, { useState, useEffect, useRef } from "react";
import {
  Video,
  Send,
  PhoneOff,
  Mic,
  MicOff,
  BrainCircuit,
  Loader2,
  FileText,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { ZegoUIKitPrebuilt } from "@zegocloud/zego-uikit-prebuilt";
import Groq from "groq-sdk";

const APP_ID = 1673152262; // Your Zego App ID
const SERVER_SECRET = import.meta.env.VITE_SERVER_SECRET;
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY_TELEMEDICINE;

const TelemedWindow = ({ session, onClose, onComplete }) => {
  const [note, setNote] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const videoContainerRef = useRef(null);
  const zpRef = useRef(null);
  const recognitionRef = useRef(null);

  const groq = new Groq({
    apiKey: GROQ_API_KEY,
    dangerouslyAllowBrowser: true,
  });

  // 1. Initialize ZegoCloud Video and Speech Recognition
  useEffect(() => {
    let isMounted = true;

    const initZego = async () => {
      if (!session || !videoContainerRef.current || zpRef.current) return;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const doctorUserId = user?.id || `doc-${Date.now()}`;

        // FIX 1: Force Room ID to be the Session ID to guarantee Flutter & React sync perfectly.
        const roomId = session.id;

        await supabase
          .from("telemed_sessions")
          .update({ status: "active", meeting_link: roomId })
          .eq("id", session.id);

        const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
          APP_ID,
          SERVER_SECRET,
          roomId,
          doctorUserId,
          "Attending Physician",
        );

        const zp = ZegoUIKitPrebuilt.create(kitToken);
        zpRef.current = zp;

        zp.joinRoom({
          container: videoContainerRef.current,
          scenario: { mode: ZegoUIKitPrebuilt.OneONoneCall },
          showPreJoinView: false,
          turnOnMicrophoneWhenJoining: true,
          turnOnCameraWhenJoining: true,
          // FIX 2: Do NOT call destroy() here. Just tell React to unmount.
          onLeaveRoom: () => {
            if (isMounted) onClose();
          },
        });
      } catch (err) {
        console.error("Zego Init Error:", err);
      }
    };

    initZego();

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

    // FIX 3: This is the ONLY place destroy() is allowed to happen.
    return () => {
      isMounted = false;
      if (zpRef.current) {
        zpRef.current.destroy();
        zpRef.current = null;
      }
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, [session]);

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
            content: `You are a highly skilled Medical Scribe. Take this raw transcript and organize it into a professional medical SOAP note. Filter out small talk.`,
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

  const handleSaveNote = async () => {
    if (!note) return alert("Note is empty.");
    setIsSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("clinical_notes").insert({
      patient_id: session.patient.id,
      doctor_id: user.id,
      subjective_notes: note,
      nature_of_visit: "Telemedicine",
      created_at: new Date().toISOString(),
    });

    if (!error) {
      await supabase
        .from("telemed_sessions")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", session.id);

      alert("Telemedicine Record Committed.");
      onComplete(); // Tells Consultations to close the UI
    } else {
      alert("Failed to save note: " + error.message);
    }
    setIsSaving(false);
  };

  if (!session) return null;

  return (
    <div className="fixed inset-0 bg-[#F8FAFC] z-[500] flex flex-col font-sans animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-slate-900 text-white px-8 py-4 flex justify-between items-center shrink-0 shadow-md z-10">
        <div className="flex items-center gap-4">
          <div className="bg-emerald-500 p-2 rounded-xl animate-pulse">
            <Video size={20} />
          </div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-widest italic leading-none">
              Tele-Ataman Link
            </h2>
            <p className="text-[10px] text-emerald-400 font-bold tracking-widest mt-1">
              CONNECTED: {session.patient?.first_name}{" "}
              {session.patient?.last_name}
            </p>
          </div>
        </div>
        {/* Custom End Button simply triggers onClose, letting React cleanup handle the Zego destruction */}
        <button
          onClick={onClose}
          className="bg-rose-600 hover:bg-rose-700 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all"
        >
          <PhoneOff size={14} /> End Session
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-[3] bg-black relative border-r border-slate-800 h-full w-full">
          <div ref={videoContainerRef} className="absolute inset-0" />
        </div>

        <div className="flex-[2] bg-white flex flex-col shadow-[-10px_0_20px_rgba(0,0,0,0.05)] z-10 h-full">
          <div className="flex-1 flex flex-col border-b border-slate-100 p-6 min-h-0">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Mic size={16} className="text-emerald-500" /> Live AI Scribe
              </h3>
              <button
                onClick={toggleListening}
                className={`p-2.5 rounded-xl transition-all shadow-sm ${isListening ? "bg-rose-500 text-white animate-pulse" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
              >
                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            </div>

            <div className="flex-1 bg-slate-50 rounded-[1.5rem] p-6 overflow-y-auto text-sm font-medium text-slate-600 italic custom-scrollbar border border-slate-100 mb-4">
              {transcript ||
                "Activate microphone to begin live transcription..."}
            </div>

            <button
              onClick={handleAISummarize}
              disabled={!transcript || isGeneratingAI}
              className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-30 flex justify-center items-center gap-3 shrink-0 transition-all active:scale-95"
            >
              {isGeneratingAI ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <BrainCircuit size={16} />
              )}{" "}
              Synthesize Clinical Note
            </button>
          </div>

          <div className="flex-1 flex flex-col p-6 min-h-0">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 shrink-0">
              <FileText size={16} className="text-[#00695C]" /> Final
              Disposition
            </h3>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-[1.5rem] p-6 text-sm font-medium text-slate-700 outline-none focus:border-[#00695C] resize-none transition-all"
              placeholder="Structured clinical summary..."
            />
            <button
              onClick={handleSaveNote}
              disabled={!note || isSaving}
              className="mt-4 w-full py-4 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-black disabled:opacity-30 flex justify-center items-center gap-3 shrink-0 transition-all active:scale-95"
            >
              {isSaving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}{" "}
              Save & Complete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TelemedWindow;
