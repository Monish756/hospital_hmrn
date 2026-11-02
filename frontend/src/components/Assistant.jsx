import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { Alert } from "./ui";

/** AI assistant chat grounded in the patient's confirmed health memory. */
export default function Assistant({ patientId }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const logRef = useRef(null);

  useEffect(() => { api.assistantHistory(patientId).then(setMsgs).catch((e) => setErr(e.message)); }, [patientId]);
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [msgs]);

  const send = async (e) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    setInput(""); setErr(""); setBusy(true);
    setMsgs((m) => [...m, { id: `u${Date.now()}`, role: "user", content: q }]);
    try {
      const d = await api.assistantChat({ message: q, patient_id: patientId });
      setMsgs((m) => [...m, { id: `a${Date.now()}`, role: "assistant", content: d.reply }]);
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  const clear = async () => { await api.clearAssistant(patientId); setMsgs([]); };

  return (
    <div className="card">
      <div className="card-head">
        <div><h2>AI Health Assistant</h2><p className="muted">Explains your records in plain language. It never prescribes or approves treatment — that stays with your doctor.</p></div>
        <button className="btn ghost sm" onClick={clear}>Clear chat</button>
      </div>
      <Alert kind="error">{err}</Alert>
      <div className="chat">
        <div className="chat-log" ref={logRef}>
          {!msgs.length && <div className="msg assistant">Hi! Ask me things like "What medications am I on?", "Explain my last lab report", or "When was my surgery?"</div>}
          {msgs.map((m) => <div key={m.id} className={`msg ${m.role}`}>{m.content}</div>)}
          {busy && <div className="msg assistant"><span className="spinner" /></div>}
        </div>
        <form className="chat-input" onSubmit={send}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about this health memory…" disabled={busy} />
          <button className="btn" disabled={busy || !input.trim()}>Send</button>
        </form>
      </div>
    </div>
  );
}
