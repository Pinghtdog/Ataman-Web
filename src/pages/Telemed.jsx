import React, { useState, useEffect } from "react";
import { Video, Mic, PhoneOff, FileText, Send } from "lucide-react";
import { supabase } from "../supabaseClient";

const Telemed = () => {
  const [queue, setQueue] = useState([]);
  const [activePatient, setActivePatient] = useState(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const fetchQueue = async () => {
      const { data, error } = await supabase
        .from("telemed_sessions")
        .select(
          `
          id, 
          status, 
          meeting_link,
          patient:users (id, first_name, last_name, medical_conditions) 
        `,
        )
        .in("status", ["scheduled", "active"]);

      if (error) console.error(error);
      else setQueue(data);
    };

    fetchQueue();
    const subscription = supabase
      .channel("telemed_queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "telemed_sessions" },
        fetchQueue,
      )
      .subscribe();

    return () => supabase.removeChannel(subscription);
  }, []);

  const handleSaveNote = async () => {
    if (!activePatient) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("clinical_notes").insert({
      patient_id: activePatient.patient.id,
      doctor_id: user.id,
      subjective_notes: note,
      created_at: new Date().toISOString(),
    });

    if (!error) {
      alert("Note Saved!");
      setNote("");
    }
  };

  return (
    <div className="flex h-[calc(100vh-100px)] gap-6 p-6 bg-gray-50">
      {/* LEFT: Patient Queue */}
      <div className="w-1/3 flex flex-col gap-4">
        <div className="bg-[#00695C] text-white p-4 rounded-t-lg font-bold">
          Patient Queue ({queue.length})
        </div>

        <div className="flex flex-col gap-3">
          {queue.map((session) => (
            <div
              key={session.id}
              className="bg-white p-4 rounded-lg shadow border-l-4 border-[#00695C]"
            >
              <div className="flex justify-between items-start">
                <div>
                  {/* Access the joined user data */}
                  <h3 className="font-bold text-gray-800">
                    {session.patient?.first_name} {session.patient?.last_name}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {session.patient?.medical_conditions ||
                      "No stated conditions"}
                  </p>
                </div>
                <button
                  onClick={() => setActivePatient(session)}
                  className="bg-[#1565C0] text-white text-xs px-3 py-1 rounded font-bold"
                >
                  {session.status === "active" ? "RESUME" : "ACCEPT"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: Console */}
      <div className="w-2/3 flex flex-col gap-6">
        <div className="flex-1 bg-gray-900 rounded-lg flex items-center justify-center relative shadow-lg">
          {activePatient ? (
            <div className="text-center">
              <h2 className="text-white text-xl mb-4">
                Connected to {activePatient.patient.first_name}
              </h2>
              {/* Opens the meeting link stored in DB */}
              <a
                href={activePatient.meeting_link}
                target="_blank"
                rel="noreferrer"
                className="bg-green-600 text-white px-6 py-3 rounded-full font-bold hover:bg-green-500"
              >
                Launch Video Link
              </a>
            </div>
          ) : (
            <p className="text-gray-500">Select a patient</p>
          )}
        </div>

        {/* Notes */}
        <div className="h-1/3 bg-white rounded-lg shadow p-6 flex flex-col">
          <textarea
            className="flex-1 bg-gray-50 border p-3 rounded"
            placeholder="Type clinical notes (Subjective)..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          ></textarea>
          <div className="flex justify-end mt-4">
            <button
              onClick={handleSaveNote}
              className="bg-[#00695C] text-white px-4 py-2 rounded flex gap-2"
            >
              <Send size={16} /> Save Note
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Telemed;
