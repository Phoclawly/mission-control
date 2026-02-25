import { getProjectsPath, getMissionControlUrl } from '@/lib/config';
import type { Task, TaskType, ClaudeTeamConfig, MultiHypothesisConfig } from '@/lib/types';

export interface TaskTypeConfigSchema {
  type: string;
  properties: Record<string, { type: string; description?: string; minimum?: number; maximum?: number; items?: object }>;
  required?: string[];
}

export interface TaskTypeMetadata {
  type: TaskType;
  label: string;
  description: string;
  badge: string;
  badgeColor: string;
  isImplemented: boolean;
  defaultConfig?: Record<string, unknown>;
  configSchema?: TaskTypeConfigSchema | null;
}

export const TASK_TYPE_REGISTRY: TaskTypeMetadata[] = [
  {
    type: 'openclaw-native',
    label: 'OpenClaw Native',
    description: 'Standard task dispatched directly to the assigned OpenClaw agent.',
    badge: 'OC',
    badgeColor: 'bg-blue-500/20 text-blue-400',
    isImplemented: true,
    configSchema: null,
  },
  {
    type: 'claude-team',
    label: 'Claude Team',
    description: 'Spawn a Claude Code Agent Team for parallel multi-agent execution of complex work.',
    badge: 'CT',
    badgeColor: 'bg-purple-500/20 text-purple-400',
    isImplemented: true,
    defaultConfig: { team_size: 2, team_members: [] },
    configSchema: {
      type: 'object',
      properties: {
        team_size: { type: 'number', description: 'Number of agents in the team', minimum: 1, maximum: 10 },
        team_members: { type: 'array', description: 'Team member definitions', items: { type: 'object' } },
        model: { type: 'string', description: 'Optional model override' },
      },
      required: ['team_size'],
    },
  },
  {
    type: 'multi-hypothesis',
    label: 'Multi-Hypothesis',
    description: 'Dispatch N parallel investigators via sessions_spawn, each exploring a different approach.',
    badge: 'MH',
    badgeColor: 'bg-cyan-500/20 text-cyan-400',
    isImplemented: true,
    defaultConfig: {
      hypotheses: [
        { label: 'Simplicity', focus_description: '' },
        { label: 'Angle B', focus_description: '' },
        { label: 'Angle C', focus_description: '' },
      ],
    },
    configSchema: {
      type: 'object',
      properties: {
        hypotheses: { type: 'array', description: 'Investigation angles (1-10)', items: { type: 'object' } },
        coordinator_agent_id: { type: 'string', description: 'Optional coordinator agent' },
      },
      required: ['hypotheses'],
    },
  },
  {
    type: 'e2e-validation',
    label: 'E2E Validation',
    description: 'Coming soon — automated end-to-end validation flow.',
    badge: 'E2E',
    badgeColor: 'bg-yellow-500/20 text-yellow-400',
    isImplemented: false,
    configSchema: null,
  },
  {
    type: 'prd-flow',
    label: 'PRD Flow',
    description: 'Coming soon — structured product requirements document generation flow.',
    badge: 'PRD',
    badgeColor: 'bg-green-500/20 text-green-400',
    isImplemented: false,
    configSchema: null,
  },
  {
    type: 'mcp-task',
    label: 'MCP Task',
    description: 'Coming soon — task dispatched via Model Context Protocol server.',
    badge: 'MCP',
    badgeColor: 'bg-pink-500/20 text-pink-400',
    isImplemented: false,
    configSchema: null,
  },
];

export function getTaskTypeMetadata(type: TaskType | string | undefined): TaskTypeMetadata {
  return TASK_TYPE_REGISTRY.find((m) => m.type === type) ?? TASK_TYPE_REGISTRY[0];
}

// ─── Shared callback footer ───────────────────────────────────────────────────

function buildCallbackInstructions(taskId: string, missionControlUrl: string): string {
  return `**MANDATORY POST-COMPLETION STEPS — Do ALL 3 in order using fetch_url or http tool:**

Step 1: Register EACH deliverable file (repeat for every file you created):
\`\`\`
POST ${missionControlUrl}/api/tasks/${taskId}/deliverables
Content-Type: application/json

{"deliverable_type": "file", "title": "<filename>", "path": "<full_path_to_file>"}
\`\`\`

Step 2: Log completion activity:
\`\`\`
POST ${missionControlUrl}/api/tasks/${taskId}/activities
Content-Type: application/json

{"activity_type": "completed", "message": "<summary of what was done>"}
\`\`\`

Step 3: Move task to review (human will approve):
\`\`\`
PATCH ${missionControlUrl}/api/tasks/${taskId}
Content-Type: application/json

{"status": "review"}
\`\`\`

Do NOT skip any step. Do NOT set status to "done" — only "review". The human reviews and approves.

When all 3 API calls succeed, reply with:
\`TASK_COMPLETE: [brief summary]\``;
}

// ─── Per-type message builders ────────────────────────────────────────────────

const PRIORITY_EMOJI: Record<string, string> = {
  low: '🔵',
  normal: '⚪',
  high: '🟡',
  urgent: '🔴',
};

function buildOpenClawNativeMessage(task: Task & { assigned_agent_name?: string }): string {
  const priorityEmoji = PRIORITY_EMOJI[task.priority] || '⚪';
  const projectsPath = getProjectsPath();
  const projectDir = task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const taskProjectDir = `${projectsPath}/${projectDir}`;
  const missionControlUrl = getMissionControlUrl();

  return `${priorityEmoji} **NEW TASK ASSIGNED**

**Title:** ${task.title}
${task.description ? `**Description:** ${task.description}\n` : ''}**Priority:** ${task.priority.toUpperCase()}
${task.due_date ? `**Due:** ${task.due_date}\n` : ''}**Task ID:** ${task.id}

**OUTPUT DIRECTORY:** ${taskProjectDir}
Create this directory and save all deliverables there.

${buildCallbackInstructions(task.id, missionControlUrl)}`;
}

function buildClaudeTeamMessage(task: Task & { assigned_agent_name?: string }): string {
  const priorityEmoji = PRIORITY_EMOJI[task.priority] || '⚪';
  const missionControlUrl = getMissionControlUrl();
  const projectsPath = getProjectsPath();
  const projectDir = task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const taskProjectDir = `${projectsPath}/${projectDir}`;

  let config: ClaudeTeamConfig = { team_size: 2, team_members: [] };
  if (task.task_type_config) {
    try { config = JSON.parse(task.task_type_config) as ClaudeTeamConfig; } catch { /* use default */ }
  }

  const teamBlock = config.team_members?.length
    ? config.team_members.map((m, i) => `  Agent ${i + 1}: ${m.name} (${m.role}) — ${m.focus}`).join('\n')
    : `  ${config.team_size} agents (roles to be determined by team lead)`;

  const modelLine = config.model ? `\n**Model Override:** ${config.model}` : '';

  return `${priorityEmoji} **TEAM TASK ASSIGNED**

**EXECUTION STRATEGY: Claude Code Agent Teams**
Set env: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1${modelLine}

**Team Configuration:**
${teamBlock}

**Title:** ${task.title}
${task.description ? `**Description:** ${task.description}\n` : ''}**Priority:** ${task.priority.toUpperCase()}
${task.due_date ? `**Due:** ${task.due_date}\n` : ''}**Task ID:** ${task.id}

**OUTPUT DIRECTORY:** ${taskProjectDir}
Create this directory and save all deliverables there.

${buildCallbackInstructions(task.id, missionControlUrl)}`;
}

function buildMultiHypothesisMessage(task: Task & { assigned_agent_name?: string }): string {
  const priorityEmoji = PRIORITY_EMOJI[task.priority] || '⚪';
  const missionControlUrl = getMissionControlUrl();
  const projectsPath = getProjectsPath();
  const projectDir = task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const taskProjectDir = `${projectsPath}/${projectDir}`;

  let config: MultiHypothesisConfig = { hypotheses: [] };
  if (task.task_type_config) {
    try { config = JSON.parse(task.task_type_config) as MultiHypothesisConfig; } catch { /* use default */ }
  }

  const hypothesesBlock = config.hypotheses?.length
    ? config.hypotheses.map((h, i) => `  Hypothesis ${i + 1} [${h.label}]: ${h.focus_description || '(no focus specified)'}`).join('\n')
    : '  No hypotheses configured — define your investigation angles in task settings.';

  const coordinatorLine = config.coordinator_agent_id
    ? `\n**Coordinator Agent:** ${config.coordinator_agent_id}`
    : '';

  return `${priorityEmoji} **PARALLEL INVESTIGATION TASK ASSIGNED**

**EXECUTION STRATEGY: Parallel Hypotheses**
Use sessions_spawn to create ${config.hypotheses?.length || 3} parallel investigators, each exploring a different approach.${coordinatorLine}

**Investigation Angles:**
${hypothesesBlock}

**Title:** ${task.title}
${task.description ? `**Description:** ${task.description}\n` : ''}**Priority:** ${task.priority.toUpperCase()}
${task.due_date ? `**Due:** ${task.due_date}\n` : ''}**Task ID:** ${task.id}

**OUTPUT DIRECTORY:** ${taskProjectDir}
Create this directory and save all deliverables there.

${buildCallbackInstructions(task.id, missionControlUrl)}`;
}

// ─── Initiative context block ─────────────────────────────────────────────────

export interface DispatchContext {
  initiativeContext?: {
    title: string;
    status: string;
    taskCount: number;
  };
}

function buildInitiativeBlock(ctx?: DispatchContext): string {
  if (!ctx?.initiativeContext) return '';
  const ic = ctx.initiativeContext;
  return `\n**INITIATIVE CONTEXT:**
- Initiative: ${ic.title}
- Status: ${ic.status}
- Tasks in initiative: ${ic.taskCount}\n`;
}

// ─── Main router ──────────────────────────────────────────────────────────────

export function buildDispatchMessage(task: Task & { assigned_agent_name?: string }, context?: DispatchContext): string {
  const taskType = task.task_type || 'openclaw-native';
  let message: string;
  switch (taskType) {
    case 'openclaw-native':
      message = buildOpenClawNativeMessage(task);
      break;
    case 'claude-team':
      message = buildClaudeTeamMessage(task);
      break;
    case 'multi-hypothesis':
      message = buildMultiHypothesisMessage(task);
      break;
    default: {
      const meta = getTaskTypeMetadata(taskType);
      throw new Error(`Task type '${taskType}' is not yet implemented for dispatch.${meta ? ` (${meta.label})` : ''}`);
    }
  }

  // Inject initiative context after the first header block
  const initiativeBlock = buildInitiativeBlock(context);
  if (initiativeBlock) {
    // Insert after the first blank line following the header
    const firstDoubleNewline = message.indexOf('\n\n');
    if (firstDoubleNewline > 0) {
      message = message.slice(0, firstDoubleNewline) + '\n' + initiativeBlock + message.slice(firstDoubleNewline);
    } else {
      message = initiativeBlock + '\n' + message;
    }
  }

  return message;
}
