import React, { useState } from "react";
import { Search, FileText, Pill, User } from "lucide-react";
import { supabase } from "../supabaseClient";

const Charting = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [patient, setPatient] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSearchError("");
    setPatient(null);
    setHistory([]);

    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .or(`last_name.ilike.%${searchTerm}%,philhealth_id.eq.${searchTerm}`)
        .limit(1)
        .single();

      if (error) throw error;

      if (data) {
        setPatient(data);
        fetchHistory(data.id);
      }
    } catch (err) {
      console.error(err);
      setSearchError(
        "Patient not found. Try entering a Last Name or PhilHealth ID.",
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (patientId) => {
    const { data: notes } = await supabase
      .from("clinical_notes")
      .select("id, created_at, assessment, doctor_id")
      .eq("patient_id", patientId);

    const { data: meds } = await supabase
      .from("prescriptions")
      .select("id, created_at, medication_name, dosage")
      .eq("user_id", patientId);

    const combined = [
      ...(notes?.map((n) => ({
        ...n,
        type: "Note",
        title: "Consultation",
        desc: n.assessment,
      })) || []),
      ...(meds?.map((m) => ({
        ...m,
        type: "Rx",
        title: "Prescription",
        desc: `${m.medication_name} - ${m.dosage}`,
      })) || []),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    setHistory(combined);
  };

  const getAge = (dob) => {
    if (!dob) return "N/A";
    const ageDifMs = Date.now() - new Date(dob).getTime();
    const ageDate = new Date(ageDifMs);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Patient Records</h2>

      {/* SEARCH BAR */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-8 max-w-3xl">
        <div className="relative flex-1">
          <input
            type="text"
            className="w-full p-3 pl-4 border border-gray-300 rounded-l shadow-sm focus:outline-none focus:border-[#00695C]"
            placeholder="Search by PhilHealth ID or Last Name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="bg-[#374151] text-white px-6 py-3 rounded-r font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {searchError && (
        <div className="p-4 mb-6 bg-red-100 text-red-700 rounded border border-red-200">
          {searchError}
        </div>
      )}

      {/* PATIENT PROFILE CARD */}
      {patient && (
        <div className="bg-white rounded-lg shadow p-6 mb-8 border border-gray-200 animate-fade-in">
          <div className="flex justify-between items-start">
            <div className="flex gap-4">
              <div className="w-16 h-16 bg-[#E0F2F1] rounded-full flex items-center justify-center text-[#00695C] font-bold text-xl">
                <User size={32} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  {patient.first_name} {patient.last_name}
                </h3>
                <p className="text-gray-500 text-sm">
                  {patient.gender} • {getAge(patient.birth_date)} Years Old •{" "}
                  {patient.blood_type || "Unknown Type"}
                </p>
                <p className="text-gray-500 text-sm">
                  {patient.barangay || "No Address"}
                </p>
                <p className="text-red-500 text-sm mt-1">
                  Allergies: {patient.allergies || "None"}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 items-end">
              {patient.philhealth_id && (
                <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded">
                  PHILHEALTH: {patient.philhealth_id}
                </span>
              )}
              <span className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded">
                VERIFIED RESIDENT
              </span>
            </div>
          </div>
        </div>
      )}

      {/* HISTORY TABLE */}
      {patient && (
        <div>
          <h3 className="font-bold text-gray-800 mb-4">
            Ataman Interaction History
          </h3>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {history.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No medical history found for this patient.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#374151] text-white text-xs uppercase tracking-wider">
                    <th className="p-4">Date</th>
                    <th className="p-4">Type</th>
                    <th className="p-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="p-4 text-gray-600 text-sm">
                        {new Date(row.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4 font-bold text-sm">
                        <span
                          className={`flex items-center gap-2 ${row.type === "Rx" ? "text-purple-600" : "text-[#00695C]"}`}
                        >
                          {row.type === "Rx" ? (
                            <Pill size={16} />
                          ) : (
                            <FileText size={16} />
                          )}
                          {row.title}
                        </span>
                      </td>
                      <td className="p-4 text-gray-600 text-sm">{row.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Charting;
