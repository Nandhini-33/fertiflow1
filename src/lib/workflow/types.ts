export type DeptId =
  | "consultation"
  | "sample"
  | "laboratory"
  | "embryology"
  | "procedures"
  | "followup";

export type Priority = "low" | "normal" | "high" | "urgent";
export type TaskStatus = "incoming" | "in_progress" | "completed";
export type Role = "admin" | "doctor" | "nurse" | "lab" | "embryology" | "supervisor" | "staff";
export type TreatmentType = "IVF" | "ICSI" | "IUI" | "Egg freezing";

export interface Department {
  id: DeptId;
  name: string;
  thresholdMinutes: number;
  escalationMinutes: number;
  staff: string[];
}

export interface WorkflowStep {
  deptId: DeptId;
  taskTitle: string;
  next: DeptId | null;
  enabled: boolean; // whether the transition to `next` is permitted
  instructions: string;
}

export interface WorkflowConfig {
  steps: WorkflowStep[];
  allowCompletionAtEnd: boolean;
  escalationEnabled: boolean;
}

export interface Note {
  at: number;
  by: string;
  text: string;
}

export interface Task {
  id: string;
  patientId: string;
  deptId: DeptId;
  title: string;
  status: TaskStatus;
  priority: Priority;
  assignee: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  completedBy?: string;
  prevDept?: DeptId;
  instructions: string;
  notes: Note[];
  overdueNotified?: boolean;
  escalated?: boolean;
}

export interface Patient {
  id: string;
  label: string; // Patient name
  name?: string; // alias for label
  age?: number;
  treatment?: TreatmentType | string;
  note?: string;
  priority: Priority;
  currentDept: DeptId;
  status: "active" | "completed";
  createdAt: number;
  completedAt?: number;
}

export interface Correction {
  at: number;
  by: string;
  text: string;
}

export interface Handover {
  id: string;
  patientId: string;
  fromDept: DeptId;
  toDept: DeptId | null;
  completedTaskId: string;
  completedTaskTitle: string;
  newTaskId?: string;
  newTaskTitle?: string;
  completedAt: number;
  completedBy: string;
  instructions: string;
  status: "success" | "failed" | "workflow_completed";
  error?: string;
  corrections: Correction[];
}

export type NotificationType =
  | "assignment"
  | "handover"
  | "overdue"
  | "reassignment"
  | "handover_failed"
  | "workflow_complete"
  | "escalation";

export interface AppNotification {
  id: string;
  type: NotificationType;
  patientId: string;
  deptId: DeptId;
  message: string;
  at: number;
  read: boolean;
  taskId?: string;
}

export interface Activity {
  id: string;
  at: number;
  patientId?: string;
  actor: string;
  message: string;
  kind: "start" | "complete" | "handover" | "note" | "reassign" | "failure" | "config" | "overdue" | "escalation" | "created" | "correction";
}

export interface DemoUser {
  name: string;
  role: Role;
  deptId?: DeptId;
  allowedDepts?: DeptId[];
  departmentLabel?: string;
}

export interface WorkflowState {
  departments: Department[];
  config: WorkflowConfig;
  patients: Patient[];
  tasks: Task[];
  handovers: Handover[];
  notifications: AppNotification[];
  activity: Activity[];
}
