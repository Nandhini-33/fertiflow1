import { deptName, exceededMs, getDept, isOverdue, waitingMs } from "../workflow/engine";
import type { DemoUser, Patient, Task, WorkflowState } from "../workflow/types";

export interface AIResponse {
  text: string;
  tamilText?: string;
  spokenText: string;
  proposedAction?: {
    patientId: string;
    patientName: string;
    taskId: string;
    deptId: string;
    deptName: string;
    nextDeptName?: string;
    title: string;
    note: string;
  };
  clarificationPrompt?: string;
  isError?: boolean;
}

export const AI_SAFETY_DISCLAIMER =
  "AI helps with administrative coordination and summaries of recorded information only. Clinical decisions stay with qualified healthcare professionals.";

/**
 * Intelligent local NLP & real-data query engine.
 * Processes voice & text queries against the actual Zustand workflow state.
 */
export function processAssistantQuery(
  query: string,
  state: WorkflowState,
  user: DemoUser,
  language: "en-IN" | "ta-IN" = "en-IN",
  now: number = Date.now(),
): AIResponse {
  const q = query.trim().toLowerCase();

  if (!q) {
    return {
      text: "Please ask a question or state an update (e.g., 'How many tasks are overdue?' or 'Prepare a handover summary for P-1042').",
      spokenText: "Please ask a question or state a patient update.",
    };
  }

  // Filter tasks visible to this user role
  const isAllAccess = user.role === "admin";
  const visibleTasks = state.tasks.filter((t) => {
    if (isAllAccess) return true;
    if (user.allowedDepts?.includes(t.deptId)) return true;
    if (user.deptId === t.deptId) return true;
    if (user.role === "doctor" && (t.deptId === "consultation" || t.deptId === "procedures")) return true;
    if (user.role === "nurse" && (t.deptId === "sample" || t.deptId === "followup")) return true;
    if (user.role === "lab" && t.deptId === "laboratory") return true;
    if (user.role === "embryology" && t.deptId === "embryology") return true;
    return false;
  });

  const allOpenTasks = state.tasks.filter((t) => t.status !== "completed");
  const visibleOpenTasks = visibleTasks.filter((t) => t.status !== "completed");
  const overdueTasks = (isAllAccess ? allOpenTasks : visibleOpenTasks).filter((t) => isOverdue(state, t, now));

  // 1. Detect Quick Update commands (e.g. "P-1042 embryology done, 9 mature eggs, grade A")
  const updateMatch = q.match(/(p-\d{3,4})[\s:,]+(.+)/i);
  const doneKeywords = ["done", "completed", "finish", "finished", "முடிந்தது", "முடிந்தது"];
  const hasDoneKeyword = doneKeywords.some((w) => q.includes(w));

  if (updateMatch || (hasDoneKeyword && q.includes("p-"))) {
    return handleQuickUpdate(query, state, user, now);
  }

  // 2. "How many tasks are overdue?" / "overdue"
  if (q.includes("overdue") || q.includes("delay") || q.includes("தாமதம்") || q.includes("தாமதமான")) {
    if (overdueTasks.length === 0) {
      const resp = isAllAccess
        ? "Great news: there are currently zero overdue tasks in the clinic."
        : `All clear for ${user.name}: no overdue tasks in your department.`;
      return {
        text: resp,
        spokenText: resp,
        tamilText: "தற்போது எந்த பணிகளும் தாமதமாக இல்லை.",
      };
    }

    const details = overdueTasks
      .map((t) => {
        const d = getDept(state, t.deptId);
        const overMinutes = Math.round(exceededMs(state, t, now) / 60000);
        const overHours = (overMinutes / 60).toFixed(1).replace(".0", "");
        return `${t.patientId} in ${d.name} (${overHours}h over ${d.thresholdMinutes / 60}h target)`;
      })
      .join(", ");

    const text = `${overdueTasks.length} task${overdueTasks.length > 1 ? "s are" : " is"} overdue. ${details}.`;
    return {
      text,
      spokenText: text,
      tamilText: `${overdueTasks.length} பணிகள் தாமதமாக உள்ளன.`,
    };
  }

  // 3. "What is critical now?" / "critical" / "urgent"
  if (q.includes("critical") || q.includes("urgent") || q.includes("முக்கியமானது") || q.includes("அவசரம்")) {
    return generateCriticalSummary(state, now, isAllAccess, visibleOpenTasks);
  }

  // 4. "What is pending for the Lab?" / department pending queries
  const deptKeywords: Record<string, string> = {
    lab: "laboratory",
    laboratory: "laboratory",
    consultation: "consultation",
    doctor: "consultation",
    sample: "sample",
    nursing: "sample",
    embryology: "embryology",
    procedure: "procedures",
    procedures: "procedures",
    "follow-up": "followup",
    followup: "followup",
  };

  for (const [kw, deptId] of Object.entries(deptKeywords)) {
    if (q.includes(kw) && (q.includes("pending") || q.includes("task") || q.includes("what is") || q.includes("queue") || q.includes("பணி"))) {
      const d = state.departments.find((x) => x.id === deptId);
      if (!d) continue;

      if (!isAllAccess && !user.allowedDepts?.includes(deptId as any) && user.deptId !== deptId) {
        return {
          text: `You are logged in as ${user.name}. Your role does not have authorization to view ${d.name} tasks.`,
          spokenText: `You do not have authorization to view ${d.name} tasks.`,
        };
      }

      const deptTasks = state.tasks.filter((t) => t.deptId === deptId && t.status !== "completed");
      if (deptTasks.length === 0) {
        const msg = `The ${d.name} queue is clear. There are currently 0 pending tasks.`;
        return { text: msg, spokenText: msg };
      }

      const list = deptTasks.map((t) => `${t.patientId} (${t.title}, status: ${t.status.replace("_", " ")})`).join("; ");
      const msg = `The ${d.name} team currently has ${deptTasks.length} pending task${deptTasks.length > 1 ? "s" : ""}: ${list}. Target turnaround is ${d.thresholdMinutes} minutes.`;
      return { text: msg, spokenText: msg };
    }
  }

  // 5. "Prepare a handover summary for P-1042" / Patient summary
  const patientIdMatch = q.match(/p-\d{3,4}/i);
  if (patientIdMatch || q.includes("summary") || q.includes("handover") || q.includes("சுருக்கம்")) {
    if (!patientIdMatch) {
      return {
        text: "Which patient ID should I prepare the handover summary for? (e.g. P-1040, P-1042)",
        spokenText: "Which patient ID should I prepare the handover summary for?",
        clarificationPrompt: "Please specify a patient ID like P-1042.",
      };
    }

    const pid = patientIdMatch[0].toUpperCase();
    const patient = state.patients.find((p) => p.id === pid);

    if (!patient) {
      return {
        text: `I don't have that information. Patient ${pid} was not found in the clinic records.`,
        spokenText: `I don't have that information. Patient ${pid} was not found.`,
        isError: true,
      };
    }

    return generatePatientHandoverSummary(patient, state, now);
  }

  // 6. Generic or unrecognized query
  return {
    text: "I don't have that information. You can ask: 'How many tasks are overdue?', 'What is critical now?', 'What is pending for the Lab?', or 'Prepare a handover summary for P-1042'.",
    spokenText: "I don't have that information. Try asking about overdue tasks, what is critical, or a handover summary for a patient.",
  };
}

/**
 * Handles Quick Update voice/text command with MANDATORY Confirmation Card.
 * Never saves directly!
 */
function handleQuickUpdate(
  rawQuery: string,
  state: WorkflowState,
  user: DemoUser,
  now: number,
): AIResponse {
  const match = rawQuery.match(/(p-\d{3,4})/i);
  const pid = match?.[1]?.toUpperCase();
  if (!match || !pid) {
    return {
      text: "Which patient ID should this update be applied to? Please specify a valid patient ID like P-1042.",
      spokenText: "Which patient ID should this update be applied to?",
      clarificationPrompt: "Please state the patient ID.",
    };
  }

  const patient = state.patients.find((p) => p.id === pid);
  if (!patient) {
    return {
      text: `Patient ${pid} does not exist in our active records. Please use an existing patient ID like P-1040 to P-1050.`,
      spokenText: `Patient ${pid} was not found in the clinic system.`,
      isError: true,
    };
  }

  // Find active task for this patient
  const activeTask = state.tasks.find((t) => t.patientId === pid && t.status !== "completed");
  if (!activeTask) {
    return {
      text: `Patient ${pid} has already completed their workflow or has no open task.`,
      spokenText: `Patient ${pid} has no active tasks to complete.`,
    };
  }

  // Verify staff role authorization
  const isAuthorized =
    user.role === "admin" ||
    (user.role === "doctor" && (activeTask.deptId === "consultation" || activeTask.deptId === "procedures")) ||
    (user.role === "nurse" && (activeTask.deptId === "sample" || activeTask.deptId === "followup")) ||
    (user.role === "lab" && activeTask.deptId === "laboratory") ||
    (user.role === "embryology" && activeTask.deptId === "embryology") ||
    user.deptId === activeTask.deptId;

  if (!isAuthorized) {
    const curDeptName = deptName(state, activeTask.deptId);
    return {
      text: `Permission denied: You are logged in as ${user.name} (${user.role}). Only ${curDeptName} staff or an Administrator can complete this stage.`,
      spokenText: `You are not authorized to complete ${curDeptName} tasks.`,
      isError: true,
    };
  }

  // Extract clinical note if provided
  const cleanQuery = rawQuery.replace(new RegExp(pid, "gi"), "");
  let noteText = cleanQuery
    .replace(/\b(done|completed|finished|embryology|laboratory|sample|consultation|procedure|followup|mark)\b/gi, "")
    .replace(/^[,:\s-]+/, "")
    .trim();

  if (!noteText) {
    noteText = "Stage completed via voice command. Key clinical outcomes recorded.";
  }

  const step = state.config.steps.find((s) => s.deptId === activeTask.deptId);
  const nextDept = step?.next ? deptName(state, step.next) : "Workflow Complete";
  const curDept = deptName(state, activeTask.deptId);

  return {
    text: `Proposed update for ${pid} (${curDept}): mark "${activeTask.title}" complete and automatically hand over to ${nextDept}. Review and edit the note below before confirming.`,
    spokenText: `Ready to complete ${pid} in ${curDept} and hand over to ${nextDept}. Please review the confirmation card on screen.`,
    proposedAction: {
      patientId: pid,
      patientName: patient.label,
      taskId: activeTask.id,
      deptId: activeTask.deptId,
      deptName: curDept,
      nextDeptName: nextDept,
      title: activeTask.title,
      note: noteText,
    },
  };
}

/**
 * Builds Critical Now summary stating WHAT happened, WHEN, and WHERE.
 */
function generateCriticalSummary(
  state: WorkflowState,
  now: number,
  isAllAccess: boolean,
  tasks: Task[],
): AIResponse {
  const openTasks = isAllAccess ? state.tasks.filter((t) => t.status !== "completed") : tasks;
  const overdue = openTasks.filter((t) => isOverdue(state, t, now));

  if (overdue.length === 0) {
    const msg = "All clear. There are currently no critical delays or overdue tasks in the clinic.";
    return { text: msg, spokenText: msg };
  }

  // Sort by highest exceeded time
  const sorted = [...overdue].sort((a, b) => exceededMs(state, b, now) - exceededMs(state, a, now));
  const top = sorted[0]!;
  const d = getDept(state, top.deptId);
  const waitedMin = Math.round(waitingMs(top, now) / 60000);
  const exceededMin = Math.round(exceededMs(state, top, now) / 60000);
  const exceededHours = (exceededMin / 60).toFixed(1).replace(".0", "");
  const waitedHours = (waitedMin / 60).toFixed(1).replace(".0", "");

  const p = state.patients.find((x) => x.id === top.patientId);

  const text = `Critical now: WHAT: ${top.patientId} (${p?.treatment || "Patient"}) has waited ${waitedHours}h (${exceededHours}h past ${d.thresholdMinutes / 60}h target). WHERE: ${d.name} (${top.title}). WHEN: Target was breached ${exceededHours}h ago. Assigned to ${top.assignee}. Immediate clinical review recommended.`;

  return {
    text,
    spokenText: `Critical now: ${top.patientId} in ${d.name} is ${exceededHours} hours over target. Immediate review recommended.`,
  };
}

/**
 * Generates an automatic handover summary for a specific patient.
 */
function generatePatientHandoverSummary(
  patient: Patient,
  state: WorkflowState,
  now: number,
): AIResponse {
  const tasks = state.tasks.filter((t) => t.patientId === patient.id);
  const activeTask = tasks.find((t) => t.status !== "completed");
  const completedTasks = tasks.filter((t) => t.status === "completed");
  const handovers = state.handovers.filter((h) => h.patientId === patient.id);

  const curDept = activeTask ? deptName(state, activeTask.deptId) : "Workflow Finished";
  const step = activeTask ? state.config.steps.find((s) => s.deptId === activeTask.deptId) : null;
  const nextDept = step?.next ? deptName(state, step.next) : "End of cycle";

  let statusText = "";
  if (patient.status === "completed") {
    statusText = `Workflow fully completed on ${new Date(patient.completedAt || now).toLocaleDateString()}. All 6 stages finalized.`;
  } else if (activeTask) {
    const waitHours = (waitingMs(activeTask, now) / 3600000).toFixed(1).replace(".0", "");
    const overdueStatus = isOverdue(state, activeTask, now)
      ? `OVERDUE by ${(exceededMs(state, activeTask, now) / 3600000).toFixed(1)}h`
      : "Within target time";
    statusText = `Currently in ${curDept} for "${activeTask.title}". Assigned to ${activeTask.assignee}. Waiting ${waitHours}h (${overdueStatus}). Upon completion, task advances automatically to ${nextDept}.`;
  }

  const prevHistory = completedTasks.length > 0
    ? `Completed stages: ${completedTasks.map((t) => deptName(state, t.deptId)).join(" → ")}.`
    : "No stages completed yet.";

  const text = `Handover Summary for ${patient.id} (${patient.label}, ${patient.age || "—"}y, ${patient.treatment || "Treatment"}): ${statusText} ${prevHistory} Registered clinical notes: "${patient.note || "Standard referral"}".`;

  return {
    text,
    spokenText: `Handover summary for ${patient.id}, ${patient.label}: currently in ${curDept}. ${statusText}`,
  };
}
