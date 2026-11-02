import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Nav, Loading } from "./components/ui";
import Landing from "./pages/Landing";
import { Login, Register } from "./pages/Auth";
import PatientDashboard from "./pages/PatientDashboard";
import PatientTimeline from "./pages/PatientTimeline";
import Scanner from "./pages/Scanner";
import { PatientEmergencyCardPage, PatientAssistantPage, PatientAccessPage, PatientProfilePage } from "./pages/PatientMisc";
import { DoctorPortal, EmergencyAccess, DoctorPatientView, DoctorProfilePage } from "./pages/Doctor";

function Guard({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={user.role === "patient" ? "/patient" : "/doctor"} replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app">
          <Nav />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/patient" element={<Guard role="patient"><PatientDashboard /></Guard>} />
            <Route path="/patient/timeline" element={<Guard role="patient"><PatientTimeline /></Guard>} />
            <Route path="/patient/scanner" element={<Guard role="patient"><Scanner /></Guard>} />
            <Route path="/patient/assistant" element={<Guard role="patient"><PatientAssistantPage /></Guard>} />
            <Route path="/patient/emergency-card" element={<Guard role="patient"><PatientEmergencyCardPage /></Guard>} />
            <Route path="/patient/access" element={<Guard role="patient"><PatientAccessPage /></Guard>} />
            <Route path="/patient/profile" element={<Guard role="patient"><PatientProfilePage /></Guard>} />
            <Route path="/doctor" element={<Guard role="doctor"><DoctorPortal /></Guard>} />
            <Route path="/doctor/emergency" element={<Guard role="doctor"><EmergencyAccess /></Guard>} />
            <Route path="/doctor/patient/:id" element={<Guard role="doctor"><DoctorPatientView /></Guard>} />
            <Route path="/doctor/profile" element={<Guard role="doctor"><DoctorProfilePage /></Guard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <footer className="footer">HMRN — Health Memory Recovery Network · Supports clinical decisions; never replaces them.</footer>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
