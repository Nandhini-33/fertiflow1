import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect, useState } from "react";
import * as engine from "./engine";
import { buildSeed, DEMO_USERS } from "./seed";
import type { Activity, AppNotification, Department, DemoUser, Patient, Priority, Task, TreatmentType, WorkflowConfig, WorkflowState } from "./types";

type ActionResult = { ok: boolean; message: string; patientId?: string };

interface Store extends WorkflowState {
  user: DemoUser;
  setUser: (u: DemoUser) => void;
  start: (taskId: string) => ActionResult;
  complete: (taskId: string, optionalNote?: string) => ActionResult;
  note: (taskId: string, text: string) => ActionResult;
  reassign: (taskId: string, assignee: string) => ActionResult;
  saveSettings: (config: WorkflowConfig, departments: Department[]) => ActionResult;
  addCorrection: (handoverId: string, text: string) => ActionResult;
  addPatient: (data: { name: string; age: number; treatment: TreatmentType; note?: string; priority?: Priority }) => ActionResult;
  updatePatient: (id: string, updates: Partial<Patient>) => ActionResult;
  deletePatient: (id: string) => ActionResult;
  importPatients: (rows: Array<{ name: string; age: number; treatment: TreatmentType; note?: string }>) => { count: number; failed: number };
  markRead: (id: string) => void;
  markAllRead: () => void;
  tickDelays: () => void;
  resetDemo: () => void;
}

const pick = (s: Store): WorkflowState => ({
  departments: s.departments, config: s.config, patients: s.patients, tasks: s.tasks,
  handovers: s.handovers, notifications: s.notifications, activity: s.activity,
});

export const useFlow = create<Store>()(
  persist(
    (set, get) => {
      const run = (fn: (st: WorkflowState) => ReturnType<typeof engine.completeTask>): ActionResult => {
        const r = fn(pick(get()));
        set(r.state);
        return r.ok ? { ok: true, message: r.message } : { ok: false, message: r.error };
      };

      return {
        ...buildSeed(),
        user: DEMO_USERS[0]!,
        setUser: (user) => set({ user }),
        start: (id) => run((s) => engine.startTask(s, id, get().user, Date.now())),
        complete: (id, optionalNote) => {
          const now = Date.now();
          if (optionalNote && optionalNote.trim()) {
            engine.addNote(pick(get()), id, get().user, optionalNote.trim(), now);
          }
          return run((s) => engine.completeTask(s, id, get().user, now));
        },
        note: (id, text) => run((s) => engine.addNote(s, id, get().user, text, Date.now())),
        reassign: (id, a) => run((s) => engine.reassignTask(s, id, get().user, a, Date.now())),
        saveSettings: (config, departments) => {
          const { user } = get();
          if (!engine.canEditSettings(user)) return { ok: false, message: "Only administrators can change workflow rules." };
          for (const d of departments) {
            if (!(d.thresholdMinutes > 0) || !(d.escalationMinutes >= 0)) return { ok: false, message: `Invalid thresholds for ${d.name}.` };
          }
          const errors = engine.validateConfig(config, departments);
          if (errors.length) return { ok: false, message: errors[0] ?? "Invalid workflow configuration." };
          const a: Activity = { id: engine.uid("act"), at: Date.now(), actor: user.name, kind: "config", message: "Updated workflow configuration" };
          set({ config, departments, activity: [a, ...get().activity] });
          return { ok: true, message: "Workflow settings saved" };
        },
        addCorrection: (hid, text) => {
          const { user } = get();
          const clean = text.trim();
          if (!engine.canReassign(user)) return { ok: false, message: "Only supervisors, doctors and administrators can record corrections." };
          if (!clean) return { ok: false, message: "Correction text is required." };
          const h = get().handovers.find((x) => x.id === hid);
          if (!h) return { ok: false, message: "Handover not found." };
          const now = Date.now();
          set({
            handovers: get().handovers.map((x) => (x.id === hid ? { ...x, corrections: [...x.corrections, { at: now, by: user.name, text: clean }] } : x)),
            activity: [{ id: engine.uid("act"), at: now, patientId: h.patientId, actor: user.name, kind: "correction", message: `Correction recorded on handover: ${clean}` }, ...get().activity],
          });
          return { ok: true, message: "Correction recorded in audit history" };
        },

        addPatient: (data) => {
          const { user, patients, departments, config } = get();
          if (!engine.canEditSettings(user)) {
            return { ok: false, message: "Only administrators can add new patients." };
          }
          const cleanName = data.name.trim();
          if (!cleanName) return { ok: false, message: "Patient name is required." };
          if (!data.age || data.age < 18 || data.age > 60) return { ok: false, message: "Age must be between 18 and 60." };
          if (!data.treatment) return { ok: false, message: "Treatment type is required." };

          const newId = engine.generateNextPatientId(patients);
          const now = Date.now();
          const firstStep = config.steps[0] || { deptId: "consultation", taskTitle: "Initial consultation review" };
          const consultDept = departments.find((d) => d.id === "consultation") || departments[0]!;
          const doctorAssignee = consultDept.staff[0] || "Dr. Meera Iyer";

          const newPatient: Patient = {
            id: newId,
            label: cleanName,
            name: cleanName,
            age: data.age,
            treatment: data.treatment,
            note: data.note?.trim() || "",
            priority: data.priority || "normal",
            currentDept: firstStep.deptId,
            status: "active",
            createdAt: now,
          };

          const taskId = engine.uid("tsk");
          const newTask: Task = {
            id: taskId,
            patientId: newId,
            deptId: firstStep.deptId,
            title: firstStep.taskTitle,
            status: "incoming",
            priority: data.priority || "normal",
            assignee: doctorAssignee,
            createdAt: now,
            instructions: `Referral for ${cleanName} (${data.age}y, ${data.treatment}): ${data.note?.trim() || "New patient admission."}`,
            notes: [{ at: now, by: user.name, text: `Registered referral for ${data.treatment}.` }],
          };

          const newNotif: AppNotification = {
            id: engine.uid("ntf"),
            type: "assignment",
            patientId: newId,
            deptId: firstStep.deptId,
            taskId,
            message: `New patient ${newId} (${cleanName}) registered and assigned to Doctors for Consultation`,
            at: now,
            read: false,
          };

          const newAct: Activity = {
            id: engine.uid("act"),
            at: now,
            patientId: newId,
            actor: user.name,
            kind: "created",
            message: `Patient ${newId} (${cleanName}) admitted for ${data.treatment}`,
          };

          set({
            patients: [newPatient, ...patients],
            tasks: [newTask, ...get().tasks],
            notifications: [newNotif, ...get().notifications],
            activity: [newAct, ...get().activity],
          });

          return {
            ok: true,
            message: `Patient ${newId} added and sent to Doctors`,
            patientId: newId,
          };
        },

        updatePatient: (id, updates) => {
          const { user, patients } = get();
          if (!engine.canEditSettings(user)) return { ok: false, message: "Only administrators can edit patient profiles." };
          const target = patients.find((p) => p.id === id);
          if (!target) return { ok: false, message: "Patient not found." };

          set({
            patients: patients.map((p) => (p.id === id ? { ...p, ...updates } : p)),
            activity: [{ id: engine.uid("act"), at: Date.now(), patientId: id, actor: user.name, kind: "note", message: `Updated profile details for ${id}` }, ...get().activity],
          });
          return { ok: true, message: `Patient ${id} updated successfully` };
        },

        deletePatient: (id) => {
          const { user, patients, tasks } = get();
          if (!engine.canEditSettings(user)) return { ok: false, message: "Only administrators can delete patients." };
          const target = patients.find((p) => p.id === id);
          if (!target) return { ok: false, message: "Patient not found." };

          set({
            patients: patients.filter((p) => p.id !== id),
            tasks: tasks.filter((t) => t.patientId !== id),
            activity: [{ id: engine.uid("act"), at: Date.now(), patientId: id, actor: user.name, kind: "failure", message: `Removed patient record and open tasks for ${id}` }, ...get().activity],
          });
          return { ok: true, message: `Patient ${id} deleted` };
        },

        importPatients: (rows) => {
          let count = 0;
          let failed = 0;
          for (const r of rows) {
            const res = get().addPatient({
              name: r.name,
              age: r.age,
              treatment: r.treatment,
              ...(r.note ? { note: r.note } : {}),
            });
            if (res.ok) count++;
            else failed++;
          }
          return { count, failed };
        },

        markRead: (id) => set({ notifications: get().notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }),
        markAllRead: () => set({ notifications: get().notifications.map((n) => ({ ...n, read: true })) }),
        tickDelays: () => {
          const next = engine.evaluateDelays(pick(get()), Date.now());
          if (next) set(next);
        },
        resetDemo: () => set({ ...buildSeed(), user: get().user }),
      };
    },
    { name: "fertiflow-demo-v2", skipHydration: true },
  ),
);

export function useHydrateFlow() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.resolve(useFlow.persist.rehydrate()).then(() => setReady(true));
  }, []);
  return ready;
}

export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
