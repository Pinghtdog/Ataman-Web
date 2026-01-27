import React, { useState } from "react";
import { supabase } from "../supabaseClient";
import { CheckCircle, AlertTriangle } from "lucide-react";
// import './Overview.css';

const AdminDashboard = () => {
  const [newBedLabel, setNewBedLabel] = useState("");
  const [wardType, setWardType] = useState("General");
  const [facilityId, setFacilityId] = useState(2);

  // popup modal state
  const [modal, setModal] = useState({ show: false, type: "", message: "" });

  const handleAddBed = async (e) => {
    e.preventDefault();

    // insert bed
    const { error } = await supabase.from("beds").insert([
      {
        bed_label: newBedLabel,
        status: "available",
        ward_type: wardType,
        facility_id: facilityId,
      },
    ]);
    //modal handling
    if (error) {
      setModal({
        show: true,
        type: "error",
        message: "Error adding bed: " + error.message,
      });
    } else {
      setModal({
        show: true,
        type: "success",
        message: `Bed ${newBedLabel} added successfully!`,
      });
      setNewBedLabel(""); // Clear input
    }
  };

  const closeModal = () => {
    setModal({ ...modal, show: false });
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Admin Settings</h2>

      <div className="section-container" style={{ maxWidth: "500px" }}>
        <h4 className="section-title">Add New Bed</h4>

        <form
          onSubmit={handleAddBed}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "15px",
            marginTop: "20px",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "5px",
                fontWeight: "600",
                fontSize: "0.9rem",
              }}
            >
              Bed Label
            </label>
            <input
              type="text"
              placeholder="e.g. ER-05"
              value={newBedLabel}
              onChange={(e) => setNewBedLabel(e.target.value)}
              className="modal-input"
              required
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "5px",
                fontWeight: "600",
                fontSize: "0.9rem",
              }}
            >
              Ward Section
            </label>
            <select
              value={wardType}
              onChange={(e) => setWardType(e.target.value)}
              className="modal-input"
              style={{ backgroundColor: "white" }}
            >
              <option value="ER">Emergency Room</option>
              <option value="General">General Ward</option>
            </select>
          </div>

          <button className="btn-confirm" style={{ marginTop: "10px" }}>
            + Add Bed to System
          </button>
        </form>
      </div>

      {modal.show && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div
            className="modal-box"
            style={{ maxWidth: "400px", textAlign: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: "60px",
                height: "60px",
                background: modal.type === "success" ? "#D1FAE5" : "#FEE2E2",
                borderRadius: "50%",
                color: modal.type === "success" ? "#059669" : "#DC2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 15px auto",
              }}
            >
              {modal.type === "success" ? (
                <CheckCircle size={32} />
              ) : (
                <AlertTriangle size={32} />
              )}
            </div>

            <h3
              className="modal-title"
              style={{ justifyContent: "center", fontSize: "1.25rem" }}
            >
              {modal.type === "success" ? "Success!" : "Error"}
            </h3>

            <p
              style={{
                color: "#666",
                fontSize: "0.95rem",
                margin: "10px 0 25px 0",
              }}
            >
              {modal.message}
            </p>

            <button
              className="btn-confirm"
              style={{
                width: "100%",
                backgroundColor:
                  modal.type === "success" ? "#059669" : "#DC2626",
                border: "none",
              }}
              onClick={closeModal}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
