import React, { useState } from "react";
import { Video, Mic, PhoneOff, FileText, Send } from "lucide-react";

const Telemed = () => {
  // Mock Data (Replace with Supabase fetch later)
  const [queue, setQueue] = useState([
    {
      id: 1,
      name: "Miguel (Child)",
      condition: "Cough, Fever (3 days)",
      status: "waiting",
    },
    {
      id: 2,
      name: "Lola Rosa",
      condition: "Hypertension Follow-up",
      status: "waiting",
    },
  ]);

  const [activePatient, setActivePatient] = useState(null);

  return (
    <div className="flex h-[calc(100vh-100px)] gap-6 p-6 bg-gray-50">
      {/* LEFT: Patient Queue */}
      <div className="w-1/3 flex flex-col gap-4">
        <div className="bg-[#00695C] text-white p-4 rounded-t-lg font-bold">
          Patient Queue ({queue.length})
        </div>

        <div className="flex flex-col gap-3">
          {queue.map((patient) => (
            <div
              key={patient.id}
              className={`bg-white p-4 rounded-lg shadow border-l-4 ${activePatient?.id === patient.id ? "border-[#00695C]" : "border-gray-200"}`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-gray-800">{patient.name}</h3>
                  <p className="text-sm text-gray-500">{patient.condition}</p>
                </div>
                <button
                  onClick={() => setActivePatient(patient)}
                  className="bg-[#1565C0] hover:bg-blue-700 text-white text-xs px-3 py-1 rounded font-bold"
                >
                  ACCEPT
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: Video & Notes Console */}
      <div className="w-2/3 flex flex-col gap-6">
        {/* Video Area */}
        <div className="flex-1 bg-gray-900 rounded-lg flex items-center justify-center relative shadow-lg overflow-hidden">
          {activePatient ? (
            <div className="text-center">
              <div className="animate-pulse mb-4">
                <Video size={48} className="text-white mx-auto opacity-50" />
              </div>
              <h2 className="text-white text-xl">
                Connecting to {activePatient.name}...
              </h2>

              {/* Call Controls Overlay */}
              <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4">
                <button className="p-3 bg-gray-700 rounded-full text-white hover:bg-gray-600">
                  <Mic size={20} />
                </button>
                <button
                  className="p-3 bg-red-600 rounded-full text-white hover:bg-red-700"
                  onClick={() => setActivePatient(null)}
                >
                  <PhoneOff size={20} />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-gray-500">
              Select a patient from the queue to start
            </div>
          )}
        </div>

        {/* Clinical Notes Section */}
        <div className="h-1/3 bg-white rounded-lg shadow p-6 flex flex-col">
          <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
            <FileText size={18} /> Consultation Notes & Rx
          </h3>
          <textarea
            className="flex-1 bg-gray-50 border border-gray-200 rounded p-3 text-sm focus:outline-none focus:border-[#00695C]"
            placeholder="Type clinical notes here..."
            disabled={!activePatient}
          ></textarea>
          <div className="flex justify-end mt-4">
            <button className="bg-[#00695C] text-white px-4 py-2 rounded flex items-center gap-2 text-sm hover:bg-[#004D40]">
              <Send size={16} /> Issue e-Rx
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Telemed;
