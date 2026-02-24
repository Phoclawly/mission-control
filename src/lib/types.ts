// Core types for Mission Control

export type AgentStatus = 'standby' | 'working' | 'offline';

export type TaskStatus = 'pending_dispatch' | 'planning' | 'inbox' | 'assigned' | 'in_progress' | 'testing' | 'review' | 'done';

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export type TaskType =
  | 'openclaw-native' | 'claude-team' | 'multi-hypothesis'
  | 'e2e-validation' | 'prd-flow' | 'mcp-task';

export interface ClaudeTeamConfig {
  team_size: number;
  team_members: Array<{ name: string; focus: string; role: string }>;
  model?: string;
}

export interface MultiHypothesisConfig {
  hypotheses: Array<{ label: string; focus_description: string }>;
  coordinator_agent_id?: string;
}

export type MessageType = 'text' | 'system' | 'task_update' | 'file';

export type ConversationType = 'direct' | 'group' | 'task';

export type EventType =
  | 'task_created'
  | 'task_assigned'
  | 'task_status_changed'
  | 'task_completed'
  | 'message_sent'
  | 'agent_status_changed'
  | 'agent_joined'
  | 'system';

export interface Agent {
  id: string;
  name: string;
  role: string;
  description?: string;
  avatar_emoji: string;
  status: AgentStatus;
  is_master: boolean;
  workspace_id: string;
  soul_md?: string;
  user_md?: string;
  agents_md?: string;
  tools_md?: string;
  model?: string;
  current_activity?: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_agent_id: string | null;
  created_by_agent_id: string | null;
  workspace_id: string;
  business_id: string;
  due_date?: string;
  initiative_id?: string;
  external_request_id?: string;
  source?: string;
  task_type: TaskType;
  task_type_config?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  assigned_agent?: Agent;
  created_by_agent?: Agent;
}

export interface Conversation {
  id: string;
  title?: string;
  type: ConversationType;
  task_id?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  participants?: Agent[];
  last_message?: Message;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_agent_id?: string;
  content: string;
  message_type: MessageType;
  metadata?: string;
  created_at: string;
  // Joined fields
  sender?: Agent;
}

export interface Event {
  id: string;
  type: EventType;
  agent_id?: string;
  task_id?: string;
  message: string;
  metadata?: string;
  created_at: string;
  // Joined fields
  agent?: Agent;
  task?: Task;
}

export interface Business {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceStats {
  id: string;
  name: string;
  slug: string;
  icon: string;
  taskCounts: {
    pending_dispatch: number;
    planning: number;
    inbox: number;
    assigned: number;
    in_progress: number;
    testing: number;
    review: number;
    done: number;
    total: number;
  };
  agentCount: number;
}

export interface OpenClawSession {
  id: string;
  agent_id: string;
  openclaw_session_id: string;
  channel?: string;
  status: string;
  session_type: 'persistent' | 'subagent';
  task_id?: string;
  ended_at?: string;
  created_at: string;
  updated_at: string;
}

export type ActivityType = 'spawned' | 'updated' | 'completed' | 'file_created' | 'status_changed';

export interface TaskActivity {
  id: string;
  task_id: string;
  agent_id?: string;
  activity_type: ActivityType;
  message: string;
  metadata?: string;
  created_at: string;
  // Joined fields
  agent?: Agent;
}

export type DeliverableType = 'file' | 'url' | 'artifact';

export interface TaskDeliverable {
  id: string;
  task_id: string;
  deliverable_type: DeliverableType;
  title: string;
  path?: string;
  description?: string;
  created_at: string;
}

// Planning types
export type PlanningQuestionType = 'multiple_choice' | 'text' | 'yes_no';

export type PlanningCategory = 
  | 'goal'
  | 'audience'
  | 'scope'
  | 'design'
  | 'content'
  | 'technical'
  | 'timeline'
  | 'constraints';

export interface PlanningQuestionOption {
  id: string;
  label: string;
}

export interface PlanningQuestion {
  id: string;
  task_id: string;
  category: PlanningCategory;
  question: string;
  question_type: PlanningQuestionType;
  options?: PlanningQuestionOption[];
  answer?: string;
  answered_at?: string;
  sort_order: number;
  created_at: string;
}

export interface PlanningSpec {
  id: string;
  task_id: string;
  spec_markdown: string;
  locked_at: string;
  locked_by?: string;
  created_at: string;
}

export interface PlanningState {
  questions: PlanningQuestion[];
  spec?: PlanningSpec;
  progress: {
    total: number;
    answered: number;
    percentage: number;
  };
  isLocked: boolean;
}

// API request/response types
export interface CreateAgentRequest {
  name: string;
  role: string;
  description?: string;
  avatar_emoji?: string;
  is_master?: boolean;
  soul_md?: string;
  user_md?: string;
  agents_md?: string;
  tools_md?: string;
  model?: string;
}

export interface UpdateAgentRequest extends Partial<CreateAgentRequest> {
  status?: AgentStatus;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  priority?: TaskPriority;
  assigned_agent_id?: string;
  created_by_agent_id?: string;
  business_id?: string;
  workspace_id?: string;
  due_date?: string;
  initiative_id?: string;
  external_request_id?: string;
  source?: string;
  task_type?: TaskType;
  task_type_config?: Record<string, unknown>;
}

export interface UpdateTaskRequest extends Partial<CreateTaskRequest> {
  status?: TaskStatus;
}

export interface SendMessageRequest {
  conversation_id: string;
  sender_agent_id: string;
  content: string;
  message_type?: MessageType;
  metadata?: string;
}

// OpenClaw WebSocket message types
export interface OpenClawMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface OpenClawSessionInfo {
  id: string;
  channel: string;
  peer?: string;
  model?: string;
  status: string;
}

// OpenClaw history message format (from Gateway)
export interface OpenClawHistoryMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

// Agent with OpenClaw session info (extended for UI use)
export interface AgentWithOpenClaw extends Agent {
  openclawSession?: OpenClawSession | null;
}

// ─── Capabilities & Integrations types ──────────────────────────────────────

export type CapabilityCategory =
  | 'browser_automation'
  | 'mcp_server'
  | 'cli_tool'
  | 'api_integration'
  | 'skill'
  | 'workflow'
  | 'credential_provider';

export type CapabilityStatus = 'healthy' | 'degraded' | 'broken' | 'unknown' | 'disabled';

export interface Capability {
  id: string;
  name: string;
  category: CapabilityCategory;
  description?: string;
  provider?: string;
  version?: string;
  install_path?: string;
  config_ref?: string;
  is_shared: boolean;
  status: CapabilityStatus;
  last_health_check?: string;
  health_message?: string;
  metadata?: string;
  skill_path?: string;
  workspace_id?: string;
  created_at: string;
  updated_at: string;
}

export interface AgentCapability {
  agent_id: string;
  capability_id: string;
  enabled: boolean;
  config_override?: string;
  // Joined fields
  capability?: Capability;
  agent?: Agent;
}

export type IntegrationType =
  | 'mcp_plugin'
  | 'oauth_token'
  | 'api_key'
  | 'cli_auth'
  | 'browser_profile'
  | 'cron_job'
  | 'webhook'
  | 'credential_provider';

export type IntegrationStatus = 'connected' | 'expired' | 'broken' | 'unconfigured' | 'unknown';

export interface Integration {
  id: string;
  name: string;
  type: IntegrationType;
  provider?: string;
  status: IntegrationStatus;
  credential_source?: string;
  last_validated?: string;
  validation_message?: string;
  config?: string;
  metadata?: string;
  created_at: string;
  updated_at: string;
}

export type HealthCheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface HealthCheck {
  id: string;
  target_type: 'capability' | 'integration';
  target_id: string;
  status: HealthCheckStatus;
  message?: string;
  duration_ms?: number;
  checked_at: string;
  // Joined fields
  target_name?: string;
}

export type CronJobType = 'lobster' | 'shell' | 'llm';
export type CronJobStatus = 'active' | 'disabled' | 'stale';

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  command: string;
  agent_id?: string;
  type: CronJobType;
  status: CronJobStatus;
  last_run?: string;
  last_result?: string;
  last_duration_ms?: number;
  error_count: number;
  description?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  agent_name?: string;
}

export interface AgentMemoryEntry {
  id: string;
  agent_id: string;
  date: string;
  file_path: string;
  file_size_bytes: number;
  summary?: string;
  entry_count: number;
  created_at: string;
}

export interface CapabilitiesOverview {
  capabilities: {
    total: number;
    byCategory: Record<string, number>;
    byStatus: Record<string, number>;
  };
  integrations: {
    total: number;
    byStatus: Record<string, number>;
  };
  agents: {
    id: string;
    name: string;
    capabilityCount: number;
    uniqueCapabilities: number;
    cronCount: number;
    latestMemory?: string;
  }[];
  alerts: {
    type: string;
    target: string;
    message: string;
  }[];
  cronSummary: {
    active: number;
    disabled: number;
    stale: number;
  };
  lastFullCheck?: string;
}

// API request types for capabilities system
export interface CreateCapabilityRequest {
  name: string;
  category: CapabilityCategory;
  description?: string;
  provider?: string;
  version?: string;
  install_path?: string;
  config_ref?: string;
  is_shared?: boolean;
  status?: CapabilityStatus;
  metadata?: string;
}

export interface UpdateCapabilityRequest extends Partial<CreateCapabilityRequest> {
  health_message?: string;
  last_health_check?: string;
}

export interface CreateIntegrationRequest {
  name: string;
  type: IntegrationType;
  provider?: string;
  status?: IntegrationStatus;
  credential_source?: string;
  config?: string;
  metadata?: string;
}

export interface UpdateIntegrationRequest extends Partial<CreateIntegrationRequest> {
  validation_message?: string;
  last_validated?: string;
}

export interface CreateCronJobRequest {
  name: string;
  schedule: string;
  command: string;
  agent_id?: string;
  type?: CronJobType;
  status?: CronJobStatus;
  description?: string;
}

export interface UpdateCronJobRequest extends Partial<CreateCronJobRequest> {
  last_run?: string;
  last_result?: string;
  last_duration_ms?: number;
  error_count?: number;
}

// Real-time SSE event types
export type SSEEventType =
  | 'task_updated'
  | 'task_created'
  | 'task_deleted'
  | 'activity_logged'
  | 'deliverable_added'
  | 'agent_spawned'
  | 'agent_completed'
  | 'capability_updated'
  | 'integration_updated'
  | 'health_check_completed';

export interface SSEEvent {
  type: SSEEventType;
  payload: Task | TaskActivity | TaskDeliverable | Capability | Integration | HealthCheck | {
    taskId: string;
    sessionId: string;
    agentName?: string;
    summary?: string;
    deleted?: boolean;
  } | {
    id: string;  // For task_deleted events
  };
}
