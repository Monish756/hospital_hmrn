// Thin REST client. Cookies carry the server-side session (credentials: "include").
async function request(path, { method = "GET", body, form } = {}) {
  const opts = { method, credentials: "include", headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, opts);
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

export const api = {
  // auth
  me: () => request("/auth/me"),
  login: (b) => request("/auth/login", { method: "POST", body: b }),
  register: (b) => request("/auth/register", { method: "POST", body: b }),
  logout: () => request("/auth/logout", { method: "POST" }),
  changePassword: (b) => request("/auth/change-password", { method: "POST", body: b }),
  // patient
  patientMe: () => request("/patients/me"),
  updatePatient: (b) => request("/patients/me", { method: "PUT", body: b }),
  rotateToken: () => request("/patients/me/rotate-emergency-token", { method: "POST" }),
  dashboard: () => request("/patients/me/dashboard"),
  record: (pid) => request(`/patients/${pid}/record`),
  addAllergy: (b) => request("/patients/me/allergies", { method: "POST", body: b }),
  updateAllergy: (id, b) => request(`/patients/me/allergies/${id}`, { method: "PUT", body: b }),
  deleteAllergy: (id) => request(`/patients/me/allergies/${id}`, { method: "DELETE" }),
  addMedication: (b) => request("/patients/me/medications", { method: "POST", body: b }),
  updateMedication: (id, b) => request(`/patients/me/medications/${id}`, { method: "PUT", body: b }),
  deleteMedication: (id) => request(`/patients/me/medications/${id}`, { method: "DELETE" }),
  addEvent: (b) => request("/patients/me/events", { method: "POST", body: b }),
  updateEvent: (id, b) => request(`/patients/me/events/${id}`, { method: "PUT", body: b }),
  deleteEvent: (id) => request(`/patients/me/events/${id}`, { method: "DELETE" }),
  myGrants: () => request("/patients/me/access"),
  approveGrant: (id) => request(`/patients/me/access/${id}/approve`, { method: "POST" }),
  revokeGrant: (id) => request(`/patients/me/access/${id}/revoke`, { method: "POST" }),
  myAudit: () => request("/patients/me/audit"),
  // documents
  uploadDocument: (form) => request("/documents/upload", { method: "POST", form }),
  documents: () => request("/documents"),
  document: (id) => request(`/documents/${id}`),
  documentFileUrl: (id) => `/api/documents/${id}/file`,
  reprocessDocument: (id) => request(`/documents/${id}/reprocess`, { method: "POST" }),
  confirmDocument: (id, b) => request(`/documents/${id}/confirm`, { method: "POST", body: b }),
  deleteDocument: (id) => request(`/documents/${id}`, { method: "DELETE" }),
  // doctor
  doctorMe: () => request("/doctors/me"),
  updateDoctor: (b) => request("/doctors/me", { method: "PUT", body: b }),
  doctorPatients: () => request("/doctors/me/patients"),
  lookup: (hmrn_id) => request("/doctors/lookup", { method: "POST", body: { hmrn_id } }),
  requestAccess: (b) => request("/doctors/request-access", { method: "POST", body: b }),
  emergencyAccess: (b) => request("/doctors/emergency-access", { method: "POST", body: b }),
  emergencySummary: (pid) => request(`/doctors/patients/${pid}/emergency-summary`),
  // assistant
  assistantHistory: (pid) => request(`/assistant/history${pid ? `?patient_id=${pid}` : ""}`),
  assistantChat: (b) => request("/assistant/chat", { method: "POST", body: b }),
  clearAssistant: (pid) => request(`/assistant/history${pid ? `?patient_id=${pid}` : ""}`, { method: "DELETE" }),
};

export const EVENT_TYPES = ["diagnosis", "surgery", "hospitalization", "prescription", "lab_result",
  "vaccination", "consultation", "injury", "other"];
export const SEVERITIES = ["mild", "moderate", "severe", "life-threatening"];
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"];

export const fmtDate = (s) => (s ? new Date(s).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }) : "—");
export const fmtDateTime = (s) => (s ? new Date(s + (s.endsWith("Z") ? "" : "Z")).toLocaleString("en-IN") : "—");
export const label = (s) => (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
