import React, { useState } from "react";
import { Search, QrCode } from "lucide-react";

const Charting = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showResult, setShowResult] = useState(false);

  // Mock Data
  const patientData = {
    name: "Juan Dela Cruz",
    details: "Male • 34 Years Old",
    location: "Brgy. Concepcion Pequeña",
    tags: ["VERIFIED INDIGENT", "PHILHEALTH ACTIVE"],
  };

  const history = [
    {
      date: "Oct 24, 2023",
      type: "Tele-Consult",
      typeColor: "text-[#00695C]",
      facility: "Dr. Santos (NCGH)",
      notes: "Prescribed Amoxicillin for URTI.",
    },
    {
      date: "Sep 10, 2023",
      type: "Vaccination",
      typeColor: "text-purple-700",
      facility: "Concepcion BHC",
      notes: "Flu Vaccine (Batch #FL-20)",
    },
  ];

  const handleSearch = (e) => {
    e.preventDefault();
    setShowResult(true); // Simulate finding a patient
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Patient Records</h2>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-8 max-w-3xl">
        <div className="relative flex-1">
          <input
            type="text"
            className="w-full p-3 pl-4 border border-gray-300 rounded-l shadow-sm focus:outline-none focus:border-[#00695C]"
            placeholder="Search by PhilHealth ID, Name, or QR Code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="bg-[#374151] text-white px-6 py-3 rounded-r font-medium hover:bg-gray-800"
        >
          Search
        </button>
      </form>

      {/* Patient Profile Card (Conditional) */}
      {showResult && (
        <div className="bg-white rounded-lg shadow p-6 mb-8 border border-gray-200">
          <div className="flex justify-between items-start">
            <div className="flex gap-4">
              <div className="w-16 h-16 bg-[#E0F2F1] rounded-full flex items-center justify-center text-[#00695C] font-bold text-xl">
                JD
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  {patientData.name}
                </h3>
                <p className="text-gray-500 text-sm">{patientData.details}</p>
                <p className="text-gray-500 text-sm">{patientData.location}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 items-end">
              <span className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded">
                {patientData.tags[0]}
              </span>
              <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded">
                {patientData.tags[1]}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Interaction History Table */}
      {showResult && (
        <div>
          <h3 className="font-bold text-gray-800 mb-4">
            Ataman Interaction History
          </h3>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#374151] text-white text-xs uppercase tracking-wider">
                  <th className="p-4">Date</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Facility/Doctor</th>
                  <th className="p-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="p-4 text-gray-600 text-sm">{row.date}</td>
                    <td className={`p-4 font-bold text-sm ${row.typeColor}`}>
                      {row.type}
                    </td>
                    <td className="p-4 text-gray-600 text-sm">
                      {row.facility}
                    </td>
                    <td className="p-4 text-gray-600 text-sm">{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Charting;
