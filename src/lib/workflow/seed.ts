import { completeTask, MIN, uid, startTask } from "./engine";
import type { DemoUser, Department, Priority, TreatmentType, WorkflowConfig, WorkflowState } from "./types";

export const DEPARTMENTS: Department[] = [
  { id: "consultation", name: "Consultation", thresholdMinutes: 90, escalationMinutes: 60, staff: ["Dr. Meera Iyer", "Dr. Arjun Rao"] },
  { id: "sample", name: "Sample Collection", thresholdMinutes: 60, escalationMinutes: 45, staff: ["Nurse Priya Nair", "Nurse Kavya Das"] },
  { id: "laboratory", name: "Laboratory", thresholdMinutes: 180, escalationMinutes: 120, staff: ["Rahul Menon", "Sneha Pillai"] },
  { id: "embryology", name: "Embryology", thresholdMinutes: 240, escalationMinutes: 120, staff: ["Dr. Ananya Sen", "Vikram Shah"] },
  { id: "procedures", name: "Procedure", thresholdMinutes: 120, escalationMinutes: 60, staff: ["Dr. Leela Thomas", "Dr. Karan Mehta"] },
  { id: "followup", name: "Follow-up", thresholdMinutes: 1440, escalationMinutes: 720, staff: ["Coordinator Divya", "Nurse Kavya Das"] },
];

export const DEFAULT_CONFIG: WorkflowConfig = {
  allowCompletionAtEnd: true,
  escalationEnabled: true,
  steps: [
    { deptId: "consultation", taskTitle: "Initial consultation review", next: "sample", enabled: true, instructions: "Review diagnostic history and authorize sample collection." },
    { deptId: "sample", taskTitle: "Sample collection", next: "laboratory", enabled: true, instructions: "Label samples with patient ID and send to laboratory per chain-of-custody protocol." },
    { deptId: "laboratory", taskTitle: "Laboratory analysis", next: "embryology", enabled: true, instructions: "Complete semen/blood analysis and share report reference with Embryology." },
    { deptId: "embryology", taskTitle: "Embryology assessment", next: "procedures", enabled: true, instructions: "Assess fertilization/cleavage and confirm surgical readiness with Doctors." },
    { deptId: "procedures", taskTitle: "Clinical procedure", next: "followup", enabled: true, instructions: "Perform scheduled procedure and hand over discharge notes to Follow-up." },
    { deptId: "followup", taskTitle: "Follow-up coordination", next: null, enabled: true, instructions: "Confirm post-procedure status, review vitals and close case." },
  ],
};

export const DEMO_USERS: DemoUser[] = [
  {
    name: "Admin Asha Kapoor",
    role: "admin",
    departmentLabel: "All Departments",
    allowedDepts: ["consultation", "sample", "laboratory", "embryology", "procedures", "followup"],
  },
  {
    name: "Dr. Meera Iyer",
    role: "doctor",
    deptId: "consultation",
    departmentLabel: "Doctors (Consultation & Procedure)",
    allowedDepts: ["consultation", "procedures"],
  },
  {
    name: "Nurse Priya Nair",
    role: "nurse",
    deptId: "sample",
    departmentLabel: "Nursing (Sample & Follow-up)",
    allowedDepts: ["sample", "followup"],
  },
  {
    name: "Rahul Menon",
    role: "lab",
    deptId: "laboratory",
    departmentLabel: "Laboratory",
    allowedDepts: ["laboratory"],
  },
  {
    name: "Dr. Ananya Sen",
    role: "embryology",
    deptId: "embryology",
    departmentLabel: "Embryology",
    allowedDepts: ["embryology"],
  },
];

const ADMIN: DemoUser = DEMO_USERS[0]!;

// [patientId, name, age, treatment, note, stageIndex (-1 = completed), startedMin, activeTaskAgeMin, started, priority]
const PLAN: [string, string, number, TreatmentType, string, number, number, number, boolean, Priority][] = [
  // Stage 0: Consultation (Doctors) - 1 on-time, 1 close to target
  ["P-1040", "Sunita Verma", 31, "IVF", "Initial cycle assessment; review ovarian reserve", 0, 35, 35, false, "normal"],
  ["P-1041", "Divya Krishnan", 29, "ICSI", "Awaiting partner semen sample confirmation", 0, 75, 75, true, "high"],

  // Stage 1: Sample Collection (Nursing) - 1 on-time, 1 close to target
  ["P-1043", "Meenakshi Sundaram", 30, "Egg freezing", "Morning fasting hormone blood draw complete", 1, 60, 25, false, "normal"],
  ["P-1044", "Aarthi Natarajan", 33, "IUI", "Hormone baseline redraw scheduled", 1, 95, 50, true, "high"],

  // Stage 2: Laboratory (Lab) - 1 overdue (3h over target), 1 on-time
  ["P-1042", "Pooja Hegde", 34, "IVF", "Comprehensive follicular hormone profile requested", 2, 450, 360, true, "urgent"],
  ["P-1045", "Kavitha Reddy", 36, "ICSI", "Genetic karyotype screening panel underway", 2, 210, 80, false, "normal"],

  // Stage 3: Embryology (Embryology) - 1 overdue (1h 10m over target), 1 on-time
  ["P-1046", "Rashmi Kulkarni", 35, "IVF", "Day 3 cleavage check and embryo scoring", 3, 620, 310, true, "urgent"],
  ["P-1047", "Shalini Nair", 32, "Egg freezing", "Cryopreservation vitrification protocol", 3, 380, 95, false, "normal"],

  // Stage 4: Procedure (Doctors) - 1 on-time
  ["P-1048", "Ananya Deshmukh", 37, "IVF", "Scheduled for ultrasound guided oocyte retrieval", 4, 1200, 45, true, "high"],

  // Stage 5: Follow-up (Nursing) - 1 on-time
  ["P-1049", "Deepa Menon", 28, "IUI", "Post-procedure 48h wellness tele-call", 5, 2400, 180, false, "low"],

  // Completed workflow (Stage -1) - Green "Task completed" badge
  ["P-1050", "Radhika Sen", 38, "IVF", "Completed full stimulation & follow-up cycle successfully", -1, 4800, 0, false, "normal"],
];

export function buildSeed(now = Date.now()): WorkflowState {
  let state: WorkflowState = {
    departments: DEPARTMENTS,
    config: DEFAULT_CONFIG,
    patients: [],
    tasks: [],
    handovers: [],
    notifications: [],
    activity: [],
  };

  for (const [id, name, age, treatment, note, stage, startedMin, ageMin, started, priority] of PLAN) {
    const t0 = now - startedMin * MIN;
    const first = DEFAULT_CONFIG.steps[0]!;
    const taskId = uid("tsk");

    state = {
      ...state,
      patients: [
        ...state.patients,
        {
          id,
          label: name,
          name,
          age,
          treatment,
          note,
          priority,
          currentDept: first.deptId,
          status: "active",
          createdAt: t0,
        },
      ],
      tasks: [
        {
          id: taskId,
          patientId: id,
          deptId: first.deptId,
          title: first.taskTitle,
          status: "incoming",
          priority,
          assignee: DEPARTMENTS[0]!.staff[0]!,
          createdAt: t0,
          instructions: `Referral note for ${name} (${age}y, ${treatment}): ${note}`,
          notes: [{ at: t0, by: "Front desk", text: `Registered referral for ${treatment}.` }],
        },
        ...state.tasks,
      ],
      activity: [
        { id: uid("act"), at: t0, patientId: id, actor: "Front desk", kind: "created", message: `Patient ${id} (${name}) registered for ${treatment}` },
        ...state.activity,
      ],
    };

    const steps = stage === -1 ? DEFAULT_CONFIG.steps.length : stage;
    const activeAt = stage === -1 ? now - 60 * MIN : now - ageMin * MIN;

    for (let i = 0; i < steps; i++) {
      const at = t0 + ((activeAt - t0) * (i + 1)) / steps;
      const open = state.tasks.find((t) => t.patientId === id && t.status !== "completed");
      if (open) {
        const r = completeTask(state, open.id, ADMIN, at);
        if (r.ok) state = r.state;
      }
    }

    if (started) {
      const open = state.tasks.find((t) => t.patientId === id && t.status !== "completed");
      if (open) {
        const r = startTask(state, open.id, ADMIN, open.createdAt + Math.min(10, ageMin / 2) * MIN);
        if (r.ok) state = r.state;
      }
    }
  }

  const sortDesc = <T extends { at: number }>(a: T[]) => [...a].sort((x, y) => y.at - x.at);
  return {
    ...state,
    notifications: sortDesc(state.notifications).map((n, i) => ({ ...n, read: i > 5 })),
    activity: sortDesc(state.activity),
    handovers: [...state.handovers].sort((a, b) => b.completedAt - a.completedAt),
  };
}
