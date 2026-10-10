import type {
  Activity,
  AppNotification,
  Department,
  DeptId,
  DemoUser,
  Handover,
  Patient,
  Task,
  WorkflowConfig,
  WorkflowState,
} from "./types";

let counter = 0;
export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const MIN = 60_000;

export function deptName(state: Pick<WorkflowState, "departments">, id: DeptId | null | undefined) {
  if (!id) return "—";
  return state.departments.find((d) => d.id === id)?.name ?? id;
}

export function getDept(state: Pick<WorkflowState, "departments">, id: DeptId): Department {
  const d = state.departments.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown department ${id}`);
  return d;
}

/** Waiting time = time since the task arrived in its department. */
export function waitingMs(task: Task, now: number) {
  const end = task.completedAt ?? now;
  return Math.max(0, end - task.createdAt);
}

export function isOverdue(state: Pick<WorkflowState, "departments">, task: Task, now: number) {
  if (task.status === "completed") return false;
  const d = getDept(state, task.deptId);
  return waitingMs(task, now) > d.thresholdMinutes * MIN;
}

export function exceededMs(state: Pick<WorkflowState, "departments">, task: Task, now: number) {
  const d = getDept(state, task.deptId);
  return Math.max(0, waitingMs(task, now) - d.thresholdMinutes * MIN);
}

export function stageOrder(config: WorkflowConfig): DeptId[] {
  // Walk from first step following `next` links.
  if (!config.steps.length) return [];
  const order: DeptId[] = [];
  let cur: DeptId | null = config.steps[0]!.deptId;
  const seen = new Set<DeptId>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    order.push(cur);
    cur = config.steps.find((s) => s.deptId === cur)?.next ?? null;
  }
  return order;
}

export function validateConfig(config: WorkflowConfig, departments: Department[]): string[] {
  const errors: string[] = [];
  const ids = new Set(departments.map((d) => d.id));
  const stepIds = new Set<DeptId>();
  for (const s of config.steps) {
    if (stepIds.has(s.deptId)) errors.push(`${s.deptId} appears more than once.`);
    stepIds.add(s.deptId);
    if (!ids.has(s.deptId)) errors.push(`Unknown department ${s.deptId}.`);
    if (s.next && !ids.has(s.next)) errors.push(`Unknown next department ${s.next}.`);
    if (s.next === s.deptId) errors.push(`${s.deptId} cannot hand over to itself.`);
    if (!s.taskTitle.trim()) errors.push(`Task title for ${s.deptId} is required.`);
  }
  // cycle detection
  for (const s of config.steps) {
    const seen = new Set<DeptId>();
    let cur: DeptId | null = s.deptId;
    while (cur) {
      if (seen.has(cur)) {
        errors.push("The workflow contains a loop. Circular workflows are not allowed.");
        return Array.from(new Set(errors));
      }
      seen.add(cur);
      cur = config.steps.find((x) => x.deptId === cur)?.next ?? null;
    }
  }
  return Array.from(new Set(errors));
}

export function pickAssignee(state: WorkflowState, deptId: DeptId) {
  const d = getDept(state, deptId);
  if (!d.staff.length) return null;
  const load = (name: string) =>
    state.tasks.filter((t) => t.assignee === name && t.status !== "completed").length;
  return [...d.staff].sort((a, b) => load(a) - load(b))[0];
}

export function isNearTarget(state: Pick<WorkflowState, "departments">, task: Task, now: number) {
  if (task.status === "completed") return false;
  if (isOverdue(state, task, now)) return false;
  const d = getDept(state, task.deptId);
  const wait = waitingMs(task, now);
  return wait >= d.thresholdMinutes * MIN * 0.75;
}

export function isUserInDept(user: DemoUser, deptId: DeptId): boolean {
  if (user.role === "admin") return true;
  if (user.allowedDepts?.includes(deptId)) return true;
  if (user.deptId === deptId) return true;
  if (user.role === "doctor" && (deptId === "consultation" || deptId === "procedures")) return true;
  if (user.role === "nurse" && (deptId === "sample" || deptId === "followup")) return true;
  if (user.role === "lab" && deptId === "laboratory") return true;
  if (user.role === "embryology" && deptId === "embryology") return true;
  if (user.role === "staff" && user.deptId === deptId) return true;
  return false;
}

export function canActOnTask(user: DemoUser, task: Task): boolean {
  if (user.role === "admin") return true;
  return isUserInDept(user, task.deptId);
}
export const canReassign = (user: DemoUser) =>
  user.role === "admin" || user.role === "supervisor" || user.role === "doctor";
export const canEditSettings = (user: DemoUser) => user.role === "admin";

export function generateNextPatientId(patients: Patient[]): string {
  let maxNum = 1050;
  for (const p of patients) {
    const match = p.id.match(/^P-(\d+)$/i);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `P-${maxNum + 1}`;
}

type Result = { ok: true; state: WorkflowState; message: string } | { ok: false; state: WorkflowState; error: string };

const act = (a: Omit<Activity, "id">): Activity => ({ id: uid("act"), ...a });
const notif = (n: Omit<AppNotification, "id" | "read">): AppNotification => ({ id: uid("ntf"), read: false, ...n });

export function startTask(state: WorkflowState, taskId: string, user: DemoUser, now: number): Result {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, state, error: "Task not found." };
  if (!canActOnTask(user, task)) return { ok: false, state, error: "You are not authorised to act on this department's tasks." };
  if (task.status !== "incoming") return { ok: false, state, error: "Only incoming tasks can be started." };
  return {
    ok: true,
    message: `${task.patientId} task started`,
    state: {
      ...state,
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, status: "in_progress", startedAt: now, assignee: user.role === "staff" ? user.name : t.assignee } : t)),
      activity: [act({ at: now, patientId: task.patientId, actor: user.name, kind: "start", message: `Started “${task.title}” in ${deptName(state, task.deptId)}` }), ...state.activity],
    },
  };
}

export function addNote(state: WorkflowState, taskId: string, user: DemoUser, text: string, now: number): Result {
  const task = state.tasks.find((t) => t.id === taskId);
  const clean = text.trim();
  if (!task) return { ok: false, state, error: "Task not found." };
  if (!clean) return { ok: false, state, error: "Note cannot be empty." };
  if (clean.length > 500) return { ok: false, state, error: "Note must be under 500 characters." };
  if (!canActOnTask(user, task) && !canReassign(user)) return { ok: false, state, error: "You are not authorised to add notes here." };
  return {
    ok: true,
    message: "Note added",
    state: {
      ...state,
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, notes: [...t.notes, { at: now, by: user.name, text: clean }] } : t)),
      activity: [act({ at: now, patientId: task.patientId, actor: user.name, kind: "note", message: `Added a note to “${task.title}”` }), ...state.activity],
    },
  };
}

export function reassignTask(state: WorkflowState, taskId: string, user: DemoUser, assignee: string, now: number): Result {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, state, error: "Task not found." };
  if (!canReassign(user)) return { ok: false, state, error: "Only supervisors and administrators can reassign tasks." };
  if (task.status === "completed") return { ok: false, state, error: "Completed tasks cannot be reassigned." };
  if (!getDept(state, task.deptId).staff.includes(assignee)) return { ok: false, state, error: "Staff member is not in this department." };
  if (assignee === task.assignee) return { ok: false, state, error: "Task is already assigned to this person." };
  return {
    ok: true,
    message: `Reassigned to ${assignee}`,
    state: {
      ...state,
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, assignee } : t)),
      notifications: [notif({ at: now, type: "reassignment", patientId: task.patientId, deptId: task.deptId, taskId, message: `“${task.title}” reassigned from ${task.assignee} to ${assignee}` }), ...state.notifications],
      activity: [act({ at: now, patientId: task.patientId, actor: user.name, kind: "reassign", message: `Reassigned “${task.title}” from ${task.assignee} to ${assignee}` }), ...state.activity],
    },
  };
}

/**
 * The automatic handover engine. Pure & atomic: either a fully consistent new
 * state is returned, or the original state (plus a failure audit record).
 */
export function completeTask(state: WorkflowState, taskId: string, user: DemoUser, now: number): Result {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, state, error: "Task not found." };
  if (!canActOnTask(user, task)) return { ok: false, state, error: "You are not authorised to complete this department's tasks." };
  if (task.status === "completed") return { ok: false, state, error: "This task is already completed. No duplicate handover was created." };
  const patient = state.patients.find((p) => p.id === task.patientId);
  if (!patient) return { ok: false, state, error: "Patient workflow not found." };
  if (patient.currentDept !== task.deptId || patient.status !== "active")
    return { ok: false, state, error: "This task is not the patient's active workflow step." };

  const step = state.config.steps.find((s) => s.deptId === task.deptId);
  const fail = (error: string): Result => {
    const h: Handover = {
      id: uid("hnd"), patientId: task.patientId, fromDept: task.deptId, toDept: step?.next ?? null,
      completedTaskId: task.id, completedTaskTitle: task.title, completedAt: now, completedBy: user.name,
      instructions: step?.instructions ?? "", status: "failed", error, corrections: [],
    };
    return {
      ok: false,
      error,
      state: {
        ...state,
        handovers: [h, ...state.handovers],
        notifications: [notif({ at: now, type: "handover_failed", patientId: task.patientId, deptId: task.deptId, taskId: task.id, message: `Handover failed: ${error}` }), ...state.notifications],
        activity: [act({ at: now, patientId: task.patientId, actor: "FertiFlow engine", kind: "failure", message: `Handover from ${deptName(state, task.deptId)} failed — ${error}` }), ...state.activity],
      },
    };
  };

  if (!step) return fail(`No workflow step is configured for ${deptName(state, task.deptId)}.`);

  const completedTask: Task = { ...task, status: "completed", completedAt: now, completedBy: user.name, startedAt: task.startedAt ?? now };

  // End of workflow
  if (!step.next) {
    if (!state.config.allowCompletionAtEnd) return fail("Workflow completion is not permitted by the current configuration.");
    const h: Handover = {
      id: uid("hnd"), patientId: task.patientId, fromDept: task.deptId, toDept: null, completedTaskId: task.id,
      completedTaskTitle: task.title, completedAt: now, completedBy: user.name, instructions: step.instructions,
      status: "workflow_completed", corrections: [],
    };
    return {
      ok: true,
      message: `${task.patientId} workflow completed`,
      state: {
        ...state,
        tasks: state.tasks.map((t) => (t.id === task.id ? completedTask : t)),
        patients: state.patients.map((p) => (p.id === patient.id ? { ...p, status: "completed", completedAt: now } : p)),
        handovers: [h, ...state.handovers],
        notifications: [notif({ at: now, type: "workflow_complete", patientId: task.patientId, deptId: task.deptId, message: `${task.patientId} has completed the full workflow.` }), ...state.notifications],
        activity: [
          act({ at: now, patientId: task.patientId, actor: "FertiFlow engine", kind: "handover", message: `Workflow completed after ${deptName(state, task.deptId)}` }),
          act({ at: now, patientId: task.patientId, actor: user.name, kind: "complete", message: `Completed “${task.title}” in ${deptName(state, task.deptId)}` }),
          ...state.activity,
        ],
      },
    };
  }

  if (!step.enabled) return fail(`The transition ${deptName(state, task.deptId)} → ${deptName(state, step.next)} is disabled.`);
  const nextStep = state.config.steps.find((s) => s.deptId === step.next);
  if (!nextStep) return fail(`${deptName(state, step.next)} has no configured workflow step.`);
  const assignee = pickAssignee(state, step.next);
  if (!assignee) return fail(`${deptName(state, step.next)} has no staff available to receive the task.`);
  // duplicate guard: never create a second open task for the same patient/department
  if (state.tasks.some((t) => t.patientId === task.patientId && t.deptId === step.next && t.status !== "completed"))
    return { ok: false, state, error: "An open task already exists for the receiving department. No duplicate was created." };

  const newTask: Task = {
    id: uid("tsk"), patientId: task.patientId, deptId: step.next, title: nextStep.taskTitle, status: "incoming",
    priority: task.priority, assignee, createdAt: now, prevDept: task.deptId, instructions: step.instructions, notes: [],
  };
  const h: Handover = {
    id: uid("hnd"), patientId: task.patientId, fromDept: task.deptId, toDept: step.next, completedTaskId: task.id,
    completedTaskTitle: task.title, newTaskId: newTask.id, newTaskTitle: newTask.title, completedAt: now,
    completedBy: user.name, instructions: step.instructions, status: "success", corrections: [],
  };
  const from = deptName(state, task.deptId);
  const to = deptName(state, step.next);
  return {
    ok: true,
    message: `${task.patientId} handed over to ${to}`,
    state: {
      ...state,
      tasks: [newTask, ...state.tasks.map((t) => (t.id === task.id ? completedTask : t))],
      patients: state.patients.map((p) => (p.id === patient.id ? { ...p, currentDept: step.next! } : p)),
      handovers: [h, ...state.handovers],
      notifications: [
        notif({ at: now, type: "assignment", patientId: task.patientId, deptId: step.next, taskId: newTask.id, message: `New task “${newTask.title}” assigned to ${assignee}` }),
        notif({ at: now, type: "handover", patientId: task.patientId, deptId: step.next, taskId: newTask.id, message: `Automatic handover received from ${from}` }),
        ...state.notifications,
      ],
      activity: [
        act({ at: now, patientId: task.patientId, actor: "FertiFlow engine", kind: "handover", message: `Automatic handover ${from} → ${to}; “${newTask.title}” created for ${assignee}` }),
        act({ at: now, patientId: task.patientId, actor: user.name, kind: "complete", message: `Completed “${task.title}” in ${from}` }),
        ...state.activity,
      ],
    },
  };
}

/** Marks overdue/escalation alerts once per task. Overdue itself is always computed from timestamps. */
export function evaluateDelays(state: WorkflowState, now: number): WorkflowState | null {
  let changed = false;
  const notifications = [...state.notifications];
  const activity = [...state.activity];
  const tasks = state.tasks.map((t) => {
    if (t.status === "completed") return t;
    const d = getDept(state, t.deptId);
    const wait = waitingMs(t, now);
    let next = t;
    if (!t.overdueNotified && wait > d.thresholdMinutes * MIN) {
      changed = true;
      next = { ...next, overdueNotified: true };
      notifications.unshift(notif({ at: now, type: "overdue", patientId: t.patientId, deptId: t.deptId, taskId: t.id, message: `“${t.title}” exceeded the ${d.thresholdMinutes} min threshold in ${d.name}` }));
      activity.unshift(act({ at: now, patientId: t.patientId, actor: "Delay monitor", kind: "overdue", message: `Marked overdue in ${d.name}` }));
    }
    if (state.config.escalationEnabled && !t.escalated && wait > (d.thresholdMinutes + d.escalationMinutes) * MIN) {
      changed = true;
      next = { ...next, escalated: true };
      notifications.unshift(notif({ at: now, type: "escalation", patientId: t.patientId, deptId: t.deptId, taskId: t.id, message: `Escalated to supervisor: “${t.title}” delayed beyond escalation limit` }));
      activity.unshift(act({ at: now, patientId: t.patientId, actor: "Delay monitor", kind: "escalation", message: `Escalated to supervisor (${d.name})` }));
    }
    return next;
  });
  return changed ? { ...state, tasks, notifications, activity } : null;
}
