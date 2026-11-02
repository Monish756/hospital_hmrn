import { render, screen } from "@testing-library/react";
import EmergencyCard from "../components/EmergencyCard";
import Timeline from "../components/Timeline";

const patient = { hmrn_id: "HMRN-TEST1234", full_name: "Asha Kumar", age: 34, gender: "female", blood_group: "B+",
  emergency_contact_name: "Ravi", emergency_contact_phone: "+91 90000 00000" };

test("emergency card shows identity, blood group and allergies", () => {
  render(<EmergencyCard patient={patient} allergies={[{ id: 1, allergen: "Penicillin", severity: "severe" }]}
    medications={[{ id: 1, name: "Metformin", dosage: "500mg" }]} token="abc" />);
  expect(screen.getByText("HMRN-TEST1234")).toBeInTheDocument();
  expect(screen.getByText("B+")).toBeInTheDocument();
  expect(screen.getByText(/Penicillin \(severe\)/)).toBeInTheDocument();
  expect(screen.getByText(/Metformin 500mg/)).toBeInTheDocument();
  expect(document.querySelector("svg")).not.toBeNull(); // QR rendered
});

test("timeline groups events by year", () => {
  render(<Timeline events={[
    { id: 1, event_type: "surgery", title: "Appendectomy", event_date: "2020-01-15", created_at: "2026-01-01T00:00:00", source: "patient" },
    { id: 2, event_type: "lab_result", title: "HbA1c", event_date: "2024-06-01", created_at: "2026-01-01T00:00:00", source: "document", source_document_id: 7 },
  ]} />);
  expect(screen.getByText("2020")).toBeInTheDocument();
  expect(screen.getByText("2024")).toBeInTheDocument();
  expect(screen.getByText("Appendectomy")).toBeInTheDocument();
  expect(screen.getByText("document #7")).toBeInTheDocument();
});
