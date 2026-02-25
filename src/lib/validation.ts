import { z } from 'zod';

// Task status and priority enums from types
const TaskStatus = z.enum([
  'planning',
  'inbox',
  'assigned',
  'in_progress',
  'testing',
  'review',
  'done'
]);

const TaskPriority = z.enum(['low', 'normal', 'high', 'urgent']);

const TaskTypeEnum = z.enum([
  'openclaw-native', 'claude-team', 'multi-hypothesis',
  'e2e-validation', 'prd-flow', 'mcp-task',
]);

const ActivityType = z.enum([
  'spawned',
  'updated',
  'completed',
  'file_created',
  'status_changed'
]);

const DeliverableType = z.enum(['file', 'url', 'artifact']);

// Agent IDs in this project can be UUIDs or stable string IDs (e.g. "ventanal", "main")
const AgentIdField = z.union([z.string().min(1), z.literal(''), z.null()]);

// ─── Task type config schemas ──────────────────────────────────────────────

const ClaudeTeamConfigSchema = z.object({
  team_size: z.number().int().min(1).max(10),
  team_members: z.array(z.object({
    name: z.string().min(1),
    focus: z.string(),
    role: z.string(),
  })).optional().default([]),
  model: z.string().optional(),
});

const MultiHypothesisConfigSchema = z.object({
  hypotheses: z.array(z.object({
    label: z.string().min(1),
    focus_description: z.string(),
  })).min(1).max(10),
  coordinator_agent_id: z.string().optional(),
});

const TASK_TYPE_CONFIG_SCHEMAS: Record<string, z.ZodTypeAny> = {
  'claude-team': ClaudeTeamConfigSchema,
  'multi-hypothesis': MultiHypothesisConfigSchema,
};

// Task validation schemas
export const CreateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500, 'Title must be 500 characters or less'),
  description: z.string().max(10000, 'Description must be 10000 characters or less').optional(),
  status: TaskStatus.optional(),
  priority: TaskPriority.optional(),
  // Accept empty string or null and convert to undefined (unassigned)
  assigned_agent_id: AgentIdField.optional().transform(v => (v === '' || v === null) ? undefined : v),
  created_by_agent_id: AgentIdField.optional().transform(v => (v === '' || v === null) ? undefined : v),
  business_id: z.string().optional(),
  workspace_id: z.string().optional(),
  initiative_id: z.string().regex(/^INIT-[A-Z0-9]+$/i, 'initiative_id must be INIT-XXX format').optional().transform(v => v?.toUpperCase()),
  external_request_id: z.string().min(1).max(255).optional(),
  source: z.string().min(1).max(64).optional(),
  // Accept null and convert to undefined
  due_date: z.union([z.string(), z.null()]).optional().transform(v => v === null ? undefined : v),
  task_type: TaskTypeEnum.optional().default('openclaw-native'),
  task_type_config: z.any().optional(),
  parent_task_id: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.task_type_config && data.task_type) {
    const schema = TASK_TYPE_CONFIG_SCHEMAS[data.task_type];
    if (schema) {
      const result = schema.safeParse(data.task_type_config);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({
            ...issue,
            path: ['task_type_config', ...issue.path],
          });
        }
      }
    }
  }
});

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  status: TaskStatus.optional(),
  priority: TaskPriority.optional(),
  assigned_agent_id: AgentIdField.optional().transform(v => (v === '') ? null : v),
  due_date: z.union([z.string(), z.null()]).optional(),
  initiative_id: z.string().regex(/^INIT-[A-Z0-9]+$/i, 'initiative_id must be INIT-XXX format').optional().transform(v => v?.toUpperCase()),
  external_request_id: z.string().min(1).max(255).optional(),
  source: z.string().min(1).max(64).optional(),
  task_type: TaskTypeEnum.optional(),
  task_type_config: z.any().optional(),
  parent_task_id: z.union([z.string(), z.null()]).optional(),
  updated_by_agent_id: AgentIdField.optional().transform(v => (v === '' || v === null) ? undefined : v),
}).superRefine((data, ctx) => {
  if (data.task_type_config && data.task_type) {
    const schema = TASK_TYPE_CONFIG_SCHEMAS[data.task_type];
    if (schema) {
      const result = schema.safeParse(data.task_type_config);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({
            ...issue,
            path: ['task_type_config', ...issue.path],
          });
        }
      }
    }
  }
});

// Activity validation schema
export const CreateActivitySchema = z.object({
  activity_type: ActivityType,
  message: z.string().min(1, 'Message is required').max(5000, 'Message must be 5000 characters or less'),
  agent_id: z.string().uuid().optional(),
  metadata: z.string().optional(),
});

// Deliverable validation schema
export const CreateDeliverableSchema = z.object({
  deliverable_type: DeliverableType,
  title: z.string().min(1, 'Title is required'),
  path: z.string().optional(),
  description: z.string().optional(),
});

// ─── Capabilities system validation ──────────────────────────────────────────

const CapabilityCategory = z.enum([
  'browser_automation', 'mcp_server', 'cli_tool', 'api_integration',
  'skill', 'workflow', 'credential_provider'
]);

const CapabilityStatus = z.enum(['healthy', 'degraded', 'broken', 'unknown', 'disabled']);

const IntegrationType = z.enum([
  'mcp_plugin', 'oauth_token', 'api_key', 'cli_auth',
  'browser_profile', 'cron_job', 'webhook', 'credential_provider'
]);

const IntegrationStatus = z.enum(['connected', 'expired', 'broken', 'unconfigured', 'unknown']);

const CronJobType = z.enum(['lobster', 'shell', 'llm']);
const CronJobStatus = z.enum(['active', 'disabled', 'stale']);

export const CreateCapabilitySchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: CapabilityCategory,
  description: z.string().max(2000).optional(),
  provider: z.string().max(200).optional(),
  version: z.string().max(50).optional(),
  install_path: z.string().max(500).optional(),
  config_ref: z.string().max(500).optional(),
  is_shared: z.boolean().optional(),
  status: CapabilityStatus.optional(),
  metadata: z.string().optional(),
  skill_path: z.string().max(1000).optional(),
  workspace_id: z.string().max(200).optional(),
});

export const UpdateCapabilitySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: CapabilityCategory.optional(),
  description: z.string().max(2000).optional(),
  provider: z.string().max(200).optional(),
  version: z.string().max(50).optional(),
  install_path: z.string().max(500).optional(),
  config_ref: z.string().max(500).optional(),
  is_shared: z.boolean().optional(),
  status: CapabilityStatus.optional(),
  health_message: z.string().max(1000).optional(),
  last_health_check: z.string().optional(),
  metadata: z.string().optional(),
});

export const CreateIntegrationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  type: IntegrationType,
  provider: z.string().max(200).optional(),
  status: IntegrationStatus.optional(),
  credential_source: z.string().max(500).optional(),
  config: z.string().optional(),
  metadata: z.string().optional(),
});

export const UpdateIntegrationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: IntegrationType.optional(),
  provider: z.string().max(200).optional(),
  status: IntegrationStatus.optional(),
  credential_source: z.string().max(500).optional(),
  validation_message: z.string().max(1000).optional(),
  last_validated: z.string().optional(),
  config: z.string().optional(),
  metadata: z.string().optional(),
});

export const CreateCronJobSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  schedule: z.string().min(1, 'Schedule is required').max(100),
  command: z.string().min(1, 'Command is required').max(2000),
  agent_id: z.string().optional(),
  type: CronJobType.optional(),
  status: CronJobStatus.optional(),
  description: z.string().max(1000).optional(),
});

export const UpdateCronJobSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  schedule: z.string().min(1).max(100).optional(),
  command: z.string().min(1).max(2000).optional(),
  agent_id: z.union([z.string(), z.null()]).optional(),
  type: CronJobType.optional(),
  status: CronJobStatus.optional(),
  description: z.string().max(1000).optional(),
  last_run: z.string().optional(),
  last_result: z.string().max(5000).optional(),
  last_duration_ms: z.number().int().min(0).optional(),
  error_count: z.number().int().min(0).optional(),
});

// Type exports for use in routes
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type CreateActivityInput = z.infer<typeof CreateActivitySchema>;
export type CreateDeliverableInput = z.infer<typeof CreateDeliverableSchema>;
export type CreateCapabilityInput = z.infer<typeof CreateCapabilitySchema>;
export type UpdateCapabilityInput = z.infer<typeof UpdateCapabilitySchema>;
export type CreateIntegrationInput = z.infer<typeof CreateIntegrationSchema>;
export type UpdateIntegrationInput = z.infer<typeof UpdateIntegrationSchema>;
export type CreateCronJobInput = z.infer<typeof CreateCronJobSchema>;
export type UpdateCronJobInput = z.infer<typeof UpdateCronJobSchema>;
