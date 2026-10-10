import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canReassign, deptName } from "@/lib/workflow/engine";
import { useFlow } from "@/lib/workflow/store";
import type { Handover } from "@/lib/workflow/types";
import { fmtTime, Pill } from "./ui";

export function HandoverNote({ h }: { h: Handover }) {
  const s = useFlow();
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const status = h.status === "success" ? <Pill tone="green">Handed over</Pill> : h.status === "failed" ? <Pill tone="red">Failed</Pill> : <Pill tone="pink">Workflow completed</Pill>;
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex justify-between gap-3 py-0.5"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>;
  return (
    <article className="rounded-xl border bg-card p-4 text-sm">
      <div className="mb-2 flex items-center justify-between"><span className="font-mono font-bold">{h.patientId}</span>{status}</div>
      <dl className="text-xs">
        <Row k="Completed department" v={deptName(s, h.fromDept)} />
        <Row k="Completed task" v={h.completedTaskTitle} />
        <Row k="Completed at" v={fmtTime(h.completedAt)} />
        <Row k="Completed by" v={h.completedBy} />
        <Row k="Receiving department" v={h.toDept ? deptName(s, h.toDept) : "—"} />
        <Row k="New task" v={h.newTaskTitle ?? "—"} />
        <Row k="Stages" v={`${deptName(s, h.fromDept)} → ${h.toDept ? deptName(s, h.toDept) : "End"}`} />
      </dl>
      {h.instructions && <p className="mt-2 rounded-lg bg-muted p-2 text-xs">{h.instructions}</p>}
      {h.error && <p className="mt-2 rounded-lg bg-danger-soft p-2 text-xs text-destructive">{h.error}</p>}
      {h.corrections.length > 0 && (
        <ul className="mt-2 space-y-1 border-t pt-2 text-xs">
          {h.corrections.map((c, i) => <li key={i}><span className="font-semibold">Correction</span> by {c.by}, {fmtTime(c.at)}: {c.text}</li>)}
        </ul>
      )}
      {canReassign(s.user) && (editing ? (
        <div className="mt-2 flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe correction" className="h-8 text-xs" />
          <Button size="sm" onClick={() => { const r = s.addCorrection(h.id, text); r.ok ? toast.success(r.message) : toast.error(r.message); if (r.ok) { setText(""); setEditing(false); } }}>Save</Button>
        </div>
      ) : (
        <button className="mt-2 text-xs font-semibold text-primary hover:underline" onClick={() => setEditing(true)}>Record correction</button>
      ))}
    </article>
  );
}
