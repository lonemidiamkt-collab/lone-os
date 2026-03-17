export type Role = "admin" | "manager" | "traffic" | "social" | "designer";

export type ClientStatus = "onboarding" | "good" | "average" | "at_risk";
export type AttentionLevel = "low" | "medium" | "high" | "critical";
export type Priority = "low" | "medium" | "high" | "critical";
export type TaskStatus = "pending" | "in_progress" | "review" | "done";

export type TimelineEntryType =
  | "chat"
  | "task"
  | "status"
  | "content"
  | "design"
  | "report"
  | "manual"
  | "onboarding"
  | "meeting";

export type ToneOfVoice = "formal" | "funny" | "authoritative" | "casual";
export type MoodType = "happy" | "neutral" | "angry";

export interface Client {
  id: string;
  name: string;
  logo?: string;
  industry: string;
  monthlyBudget: number;
  status: ClientStatus;
  attentionLevel: AttentionLevel;
  tags: string[];
  assignedTraffic: string;
  assignedSocial: string;
  lastPostDate?: string;
  joinDate: string;
  paymentMethod: "pix" | "boleto" | "cartao" | "transferencia";
  notes?: string;
  contractEnd?: string;
  // Social Media dossier
  toneOfVoice?: ToneOfVoice;
  driveLink?: string;
  instagramUser?: string;
  postsThisMonth?: number;
  postsGoal?: number;
  lastKanbanActivity?: string; // ISO datetime
  campaignBriefing?: string;
}

export interface MoodEntry {
  id: string;
  mood: MoodType;
  note?: string;
  recordedBy: string;
  date: string;
}

export interface CreativeAsset {
  id: string;
  clientId: string;
  type: "reference" | "palette" | "typography" | "logo";
  url: string;
  label?: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface Task {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  assignedTo: string;
  role: Role;
  status: TaskStatus;
  priority: Priority;
  dueDate?: string;
  description?: string;
  attachments?: string[];
}

export interface ContentCard {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  socialMedia: string;
  status: "ideas" | "script" | "in_production" | "approval" | "client_approval" | "scheduled" | "published";
  priority: Priority;
  dueDate?: string;
  format: string;
  briefing?: string;
  imageUrl?: string;
  observations?: string;
  trafficSuggestion?: string;
}

export interface DesignRequest {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  requestedBy: string;
  priority: Priority;
  status: "queued" | "in_progress" | "done";
  format: string;
  briefing: string;
  attachments?: string[];
  deadline?: string;
}

export interface Activity {
  id: string;
  user: string;
  action: string;
  target: string;
  timestamp: string;
  type: "task" | "post" | "client" | "report";
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  createdBy: string;
  createdAt: string;
  urgent: boolean;
}

export interface QuinzReport {
  id: string;
  clientId: string;
  clientName: string;
  period: string;
  createdBy: string;
  createdAt: string;
  communicationHealth: number; // 1-5
  clientEngagement: number; // 1-5
  highlights: string;
  challenges: string;
  nextSteps: string;
}

// --- New types for v2 features ---

export interface TimelineEntry {
  id: string;
  clientId: string;
  type: TimelineEntryType;
  actor: string;
  description: string;
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  user: string;
  text: string;
  timestamp: string;
}

export interface GlobalChatMessage {
  id: string;
  user: string;
  role: Role;
  text: string;
  timestamp: string;
}

export interface OnboardingItem {
  id: string;
  label: string;
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
}
