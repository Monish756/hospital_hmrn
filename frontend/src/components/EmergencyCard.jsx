import { QRCodeSVG } from "qrcode.react";

/** Printable emergency card. `token` (patient view) embeds the QR break-glass link. */
export default function EmergencyCard({ patient, allergies = [], medications = [], token }) {
  const qrValue = token ? `${window.location.origin}/doctor/emergency?token=${token}` : null;
  return (
    <div className="emergency-card">
      <div className="ec-head">
        <h3>HMRN EMERGENCY CARD</h3>
        <span className="mono">{patient.hmrn_id}</span>
      </div>
      <div className="ec-body">
        <div>
          <div className="ec-field"><div className="k">Name</div><div className="v">{patient.full_name}</div></div>
          <div className="ec-field"><div className="k">Age / Gender</div><div className="v">{patient.age ?? "—"} / {patient.gender || "—"}</div></div>
          <div className="ec-field"><div className="k">Blood group</div><div className="v"><span className="blood">{patient.blood_group || "Unknown"}</span></div></div>
          <div className="ec-field"><div className="k">Allergies</div>
            <div className="v" style={{ color: allergies.length ? "var(--hmrn-emergency)" : undefined }}>
              {allergies.length ? allergies.map((a) => `${a.allergen}${a.severity ? ` (${a.severity})` : ""}`).join(", ") : "None recorded"}
            </div></div>
          <div className="ec-field"><div className="k">Current medications</div>
            <div className="v small">{medications.length ? medications.map((m) => `${m.name}${m.dosage ? ` ${m.dosage}` : ""}`).join(", ") : "None recorded"}</div></div>
          {patient.chronic_conditions && <div className="ec-field"><div className="k">Conditions</div><div className="v small">{patient.chronic_conditions}</div></div>}
          {patient.emergency_notes && <div className="ec-field"><div className="k">Emergency notes</div><div className="v small">{patient.emergency_notes}</div></div>}
          <div className="ec-field"><div className="k">Emergency contact</div>
            <div className="v small">{patient.emergency_contact_name || "—"}{patient.emergency_contact_relation ? ` (${patient.emergency_contact_relation})` : ""} {patient.emergency_contact_phone && `· ${patient.emergency_contact_phone}`}</div></div>
          {patient.organ_donor && <span className="badge success">Organ donor</span>}
        </div>
        {qrValue && (
          <div className="ec-qr">
            <QRCodeSVG value={qrValue} size={132} level="M" />
            <div className="small muted">Scan for<br />emergency access</div>
          </div>
        )}
      </div>
    </div>
  );
}
