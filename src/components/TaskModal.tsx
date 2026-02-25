'use client';

import { useState, useCallback } from 'react';
import { X, Save, Trash2, Activity, Package, Bot, ClipboardList, Plus } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import { triggerAutoDispatch, shouldTriggerAutoDispatch } from '@/lib/auto-dispatch';
import { ActivityLog } from './ActivityLog';
import { DeliverablesList } from './DeliverablesList';
import { SessionsList } from './SessionsList';
import { PlanningTab } from './PlanningTab';
import { AgentModal } from './AgentModal';
import type { Task, TaskPriority, TaskStatus, TaskType, ClaudeTeamConfig, MultiHypothesisConfig } from '@/lib/types';
import { TASK_TYPE_REGISTRY, getTaskTypeMetadata } from '@/lib/task-types';

type TabType = 'overview' | 'planning' | 'activity' | 'deliverables' | 'sessions';

interface TaskModalProps {
  task?: Task;
  onClose: () => void;
  workspaceId?: string;
}

export function TaskModal({ task, onClose, workspaceId }: TaskModalProps) {
  const { agents, initiatives, addTask, updateTask, addEvent } = useMissionControl();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [usePlanningMode, setUsePlanningMode] = useState(false);
  // Auto-switch to planning tab if task is in planning status
  const [activeTab, setActiveTab] = useState<TabType>(task?.status === 'planning' ? 'planning' : 'overview');

  // Stable callback for when spec is locked - use window.location.reload() to refresh data
  const handleSpecLocked = useCallback(() => {
    window.location.reload();
  }, []);

  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    priority: task?.priority || 'normal' as TaskPriority,
    status: task?.status || 'inbox' as TaskStatus,
    assigned_agent_id: task?.assigned_agent_id || '',
    due_date: task?.due_date || '',
    initiative_id: task?.initiative_id || '',
    task_type: (task?.task_type || 'openclaw-native') as TaskType,
    task_type_config: task?.task_type_config ? JSON.parse(task.task_type_config) as Record<string, unknown> : {} as Record<string, unknown>,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const url = task ? `/api/tasks/${task.id}` : '/api/tasks';
      const method = task ? 'PATCH' : 'POST';

      const payload = {
        ...form,
        // If planning mode is enabled for new tasks, override status to 'planning'
        status: (!task && usePlanningMode) ? 'planning' : form.status,
        assigned_agent_id: form.assigned_agent_id || null,
        due_date: form.due_date || null,
        initiative_id: form.initiative_id || null,
        workspace_id: workspaceId || task?.workspace_id || 'default',
        source: task?.source || 'mission-control',
        task_type: form.task_type,
        task_type_config: Object.keys(form.task_type_config).length > 0 ? form.task_type_config : undefined,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const savedTask = await res.json();

        if (task) {
          updateTask(savedTask);

          // Check if auto-dispatch should be triggered and execute it
          if (shouldTriggerAutoDispatch(task.status, savedTask.status, savedTask.assigned_agent_id)) {
            const result = await triggerAutoDispatch({
              taskId: savedTask.id,
              taskTitle: savedTask.title,
              agentId: savedTask.assigned_agent_id,
              agentName: savedTask.assigned_agent?.name || 'Unknown Agent',
              workspaceId: savedTask.workspace_id
            });

            if (!result.success) {
              console.error('Auto-dispatch failed:', result.error);
            }
          }

          onClose();
        } else {
          addTask(savedTask);
          addEvent({
            id: crypto.randomUUID(),
            type: 'task_created',
            task_id: savedTask.id,
            message: `New task: ${savedTask.title}`,
            created_at: new Date().toISOString(),
          });

          // If planning mode is enabled, auto-generate questions and keep modal open
          if (usePlanningMode) {
            // Trigger question generation in background
            fetch(`/api/tasks/${savedTask.id}/planning`, { method: 'POST' })
              .then((res) => {
                if (res.ok) {
                  // Update our local task reference and switch to planning tab
                  updateTask({ ...savedTask, status: 'planning' });
                  setActiveTab('planning');
                } else {
                  return res.json().then((data) => {
                    console.error('Failed to start planning:', data.error);
                  });
                }
              })
              .catch((error) => {
                console.error('Failed to start planning:', error);
              });
          }
          onClose();
        }
      }
    } catch (error) {
      console.error('Failed to save task:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!task || !confirm(`Delete "${task.title}"?`)) return;

    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      if (res.ok) {
        useMissionControl.setState((state) => ({
          tasks: state.tasks.filter((t) => t.id !== task.id),
        }));
        onClose();
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const statuses: TaskStatus[] = ['planning', 'inbox', 'assigned', 'in_progress', 'testing', 'review', 'done'];
  const priorities: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: null },
    { id: 'planning' as TabType, label: 'Planning', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'activity' as TabType, label: 'Activity', icon: <Activity className="w-4 h-4" /> },
    { id: 'deliverables' as TabType, label: 'Deliverables', icon: <Package className="w-4 h-4" /> },
    { id: 'sessions' as TabType, label: 'Sessions', icon: <Bot className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-mc-border flex-shrink-0">
          <h2 className="text-lg font-semibold">
            {task ? task.title : 'Create New Task'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-mc-bg-tertiary rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs - only show for existing tasks */}
        {task && (
          <div className="flex border-b border-mc-border flex-shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-mc-accent border-b-2 border-mc-accent'
                    : 'text-mc-text-secondary hover:text-mc-text'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
              placeholder="What needs to be done?"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent resize-none"
              placeholder="Add details..."
            />
          </div>

          {/* Task Type Selector */}
          <div>
            <label className="block text-sm font-medium mb-1">Execution Type</label>
            <select
              value={form.task_type}
              onChange={(e) => {
                const newType = e.target.value as TaskType;
                const meta = getTaskTypeMetadata(newType);
                setForm({
                  ...form,
                  task_type: newType,
                  task_type_config: (meta.defaultConfig || {}) as Record<string, unknown>,
                });
              }}
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
            >
              {TASK_TYPE_REGISTRY.map((meta) => (
                <option key={meta.type} value={meta.type} disabled={!meta.isImplemented}>
                  {meta.label}{!meta.isImplemented ? ' (coming soon)' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-mc-text-secondary mt-1">
              {getTaskTypeMetadata(form.task_type).description}
            </p>
          </div>

          {/* Type-specific config panels */}
          {form.task_type === 'claude-team' && (
            <ClaudeTeamConfigPanel
              config={form.task_type_config as unknown as ClaudeTeamConfig}
              onChange={(config) => setForm({ ...form, task_type_config: config as unknown as Record<string, unknown> })}
            />
          )}
          {form.task_type === 'multi-hypothesis' && (
            <MultiHypothesisConfigPanel
              config={form.task_type_config as unknown as MultiHypothesisConfig}
              onChange={(config) => setForm({ ...form, task_type_config: config as unknown as Record<string, unknown> })}
            />
          )}

          {/* Planning Mode Toggle - only for new tasks */}
          {!task && (
            <div className="p-3 bg-mc-bg rounded-lg border border-mc-border">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={usePlanningMode}
                  onChange={(e) => setUsePlanningMode(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-mc-border"
                />
                <div>
                  <span className="font-medium text-sm flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-mc-accent" />
                    Enable Planning Mode
                  </span>
                  <p className="text-xs text-mc-text-secondary mt-1">
                    Best for complex projects that need detailed requirements. 
                    You&apos;ll answer a few questions to define scope, goals, and constraints 
                    before work begins. Skip this for quick, straightforward tasks.
                  </p>
                </div>
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Status */}
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}
                className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ').toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
                className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
              >
                {priorities.map((p) => (
                  <option key={p} value={p}>
                    {p.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Assigned Agent */}
          <div>
            <label className="block text-sm font-medium mb-1">Assign to</label>
            <select
              value={form.assigned_agent_id}
              onChange={(e) => {
                if (e.target.value === '__add_new__') {
                  setShowAgentModal(true);
                } else {
                  setForm({ ...form, assigned_agent_id: e.target.value });
                }
              }}
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
            >
              <option value="">Unassigned</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.avatar_emoji} {agent.name} - {agent.role}
                </option>
              ))}
              <option value="__add_new__" className="text-mc-accent">
                ➕ Add new agent...
              </option>
            </select>
          </div>

          {/* Initiative */}
          <div>
            <label className="block text-sm font-medium mb-1">Initiative</label>
            <select
              value={form.initiative_id}
              onChange={(e) => setForm({ ...form, initiative_id: e.target.value })}
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
            >
              <option value="">No initiative</option>
              {initiatives.map((init) => (
                <option key={init.id} value={init.id}>
                  {init.title}
                </option>
              ))}
            </select>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium mb-1">Due Date</label>
            <input
              type="datetime-local"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
            />
          </div>
            </form>
          )}

          {/* Planning Tab */}
          {activeTab === 'planning' && task && (
            <PlanningTab
              taskId={task.id}
              onSpecLocked={handleSpecLocked}
            />
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && task && (
            <ActivityLog taskId={task.id} />
          )}

          {/* Deliverables Tab */}
          {activeTab === 'deliverables' && task && (
            <DeliverablesList taskId={task.id} />
          )}

          {/* Sessions Tab */}
          {activeTab === 'sessions' && task && (
            <SessionsList taskId={task.id} />
          )}
        </div>

        {/* Footer - only show on overview tab */}
        {activeTab === 'overview' && (
          <div className="flex items-center justify-between p-4 border-t border-mc-border flex-shrink-0">
            <div className="flex gap-2">
              {task && (
                <>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex items-center gap-2 px-3 py-2 text-mc-accent-red hover:bg-mc-accent-red/10 rounded text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-mc-text-secondary hover:text-mc-text"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-4 py-2 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Nested Agent Modal for inline agent creation */}
      {showAgentModal && (
        <AgentModal
          workspaceId={workspaceId}
          onClose={() => setShowAgentModal(false)}
          onAgentCreated={(agentId) => {
            // Auto-select the newly created agent
            setForm({ ...form, assigned_agent_id: agentId });
            setShowAgentModal(false);
          }}
        />
      )}
    </div>
  );
}
// ─── Type-specific config panels ─────────────────────────────────────────────

function ClaudeTeamConfigPanel({
  config,
  onChange,
}: {
  config: ClaudeTeamConfig;
  onChange: (c: ClaudeTeamConfig) => void;
}) {
  const members = config?.team_members || [];
  return (
    <div className="p-3 bg-mc-bg rounded-lg border border-purple-500/20 space-y-3">
      <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Claude Team Config</h4>
      <div className="flex items-center gap-3">
        <label className="text-xs text-mc-text-secondary">Team size</label>
        <input
          type="number"
          min={1}
          max={10}
          value={config?.team_size || 2}
          onChange={(e) => onChange({ ...config, team_size: Number(e.target.value) })}
          className="w-16 bg-mc-bg-secondary border border-mc-border rounded px-2 py-1 text-xs text-center"
        />
        <label className="text-xs text-mc-text-secondary ml-2">Model</label>
        <input
          type="text"
          value={config?.model || ''}
          placeholder="e.g. claude-opus-4-6"
          onChange={(e) => onChange({ ...config, model: e.target.value || undefined })}
          className="flex-1 bg-mc-bg-secondary border border-mc-border rounded px-2 py-1 text-xs"
        />
      </div>
      {members.map((m, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="Name"
            value={m.name}
            onChange={(e) => {
              const updated = [...members];
              updated[i] = { ...m, name: e.target.value };
              onChange({ ...config, team_members: updated });
            }}
            className="flex-1 bg-mc-bg-secondary border border-mc-border rounded px-2 py-1 text-xs"
          />
          <input
            type="text"
            placeholder="Role"
            value={m.role}
            onChange={(e) => {
              const updated = [...members];
              updated[i] = { ...m, role: e.target.value };
              onChange({ ...config, team_members: updated });
            }}
            className="flex-1 bg-mc-bg-secondary border border-mc-border rounded px-2 py-1 text-xs"
          />
          <input
            type="text"
            placeholder="Focus"
            value={m.focus}
            onChange={(e) => {
              const updated = [...members];
              updated[i] = { ...m, focus: e.target.value };
              onChange({ ...config, team_members: updated });
            }}
            className="flex-1 bg-mc-bg-secondary border border-mc-border rounded px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={() => onChange({ ...config, team_members: members.filter((_, j) => j !== i) })}
            className="text-mc-accent-red hover:text-mc-accent-red/80 text-xs px-1"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...config, team_members: [...members, { name: '', role: '', focus: '' }] })}
        className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
      >
        <Plus className="w-3 h-3" /> Add member
      </button>
    </div>
  );
}

function MultiHypothesisConfigPanel({
  config,
  onChange,
}: {
  config: MultiHypothesisConfig;
  onChange: (c: MultiHypothesisConfig) => void;
}) {
  const hypotheses = config?.hypotheses || [];
  return (
    <div className="p-3 bg-mc-bg rounded-lg border border-cyan-500/20 space-y-3">
      <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Parallel Hypotheses</h4>
      {hypotheses.map((h, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="Label"
            value={h.label}
            onChange={(e) => {
              const updated = [...hypotheses];
              updated[i] = { ...h, label: e.target.value };
              onChange({ ...config, hypotheses: updated });
            }}
            className="w-24 bg-mc-bg-secondary border border-mc-border rounded px-2 py-1 text-xs"
          />
          <input
            type="text"
            placeholder="Focus / approach"
            value={h.focus_description}
            onChange={(e) => {
              const updated = [...hypotheses];
              updated[i] = { ...h, focus_description: e.target.value };
              onChange({ ...config, hypotheses: updated });
            }}
            className="flex-1 bg-mc-bg-secondary border border-mc-border rounded px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={() => onChange({ ...config, hypotheses: hypotheses.filter((_, j) => j !== i) })}
            className="text-mc-accent-red hover:text-mc-accent-red/80 text-xs px-1"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...config, hypotheses: [...hypotheses, { label: '', focus_description: '' }] })}
        className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
      >
        <Plus className="w-3 h-3" /> Add hypothesis
      </button>
    </div>
  );
}
