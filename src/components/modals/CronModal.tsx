'use client';

import { useState } from 'react';
import { X, Save } from 'lucide-react';
import type { CronJob, CronJobType, CronJobStatus, Agent } from '@/lib/types';

interface CronModalProps {
  cron?: CronJob;
  agentId?: string;
  agents: Agent[];
  onClose: () => void;
  onSaved: (c: CronJob) => void;
}

const CRON_TYPES: { value: CronJobType; label: string }[] = [
  { value: 'shell', label: 'Shell' },
  { value: 'lobster', label: 'Lobster' },
  { value: 'llm', label: 'LLM' },
];

const CRON_STATUSES: { value: CronJobStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'stale', label: 'Stale' },
];

function describeCron(expr: string): string {
  if (!expr.trim()) return '';
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return 'Custom schedule';
  const [min, hour, dom, month, dow] = parts;
  if (expr.trim() === '* * * * *') return 'Every minute';
  if (
    min.startsWith('*/') &&
    hour === '*' &&
    dom === '*' &&
    month === '*' &&
    dow === '*'
  )
    return `Every ${min.slice(2)} minutes`;
  if (min === '0' && hour === '*') return 'Every hour';
  if (min === '0' && dom === '*' && month === '*' && dow === '*')
    return `Daily at ${hour}:00`;
  if (min === '0' && dom === '*' && month === '*' && dow === '0')
    return `Weekly on Sunday at ${hour}:00`;
  return 'Custom schedule';
}

export function CronModal({ cron, agentId, agents, onClose, onSaved }: CronModalProps) {
  const resolvedAgentId = agentId ?? cron?.agent_id ?? '';

  const [form, setForm] = useState({
    name: cron?.name ?? '',
    schedule: cron?.schedule ?? '',
    command: cron?.command ?? '',
    type: cron?.type ?? ('shell' as CronJobType),
    agent_id: resolvedAgentId,
    description: cron?.description ?? '',
    status: cron?.status ?? ('active' as CronJobStatus),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schedulePreview = describeCron(form.schedule);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const url = cron ? `/api/crons/${cron.id}` : '/api/crons';
      const method = cron ? 'PATCH' : 'POST';

      const payload = {
        name: form.name,
        schedule: form.schedule,
        command: form.command,
        type: form.type,
        agent_id: form.agent_id || undefined,
        description: form.description || undefined,
        status: form.status,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? `Request failed with status ${res.status}`);
      }

      const result: CronJob = await res.json();
      onSaved(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-mc-border">
          <h2 className="text-lg font-semibold">
            {cron ? 'Edit Cron Job' : 'New Cron Job'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-mc-bg-tertiary rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Error message */}
          {error && (
            <div className="px-3 py-2 bg-mc-accent-red/10 border border-mc-accent-red/30 rounded text-sm text-mc-accent-red">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Name <span className="text-mc-accent-red">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={set('name')}
              required
              placeholder="Cron job name"
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
            />
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Schedule <span className="text-mc-accent-red">*</span>
            </label>
            <input
              type="text"
              value={form.schedule}
              onChange={set('schedule')}
              required
              placeholder="* * * * *"
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-mc-accent"
            />
            {schedulePreview && (
              <p className="mt-1 text-xs text-mc-text-secondary">{schedulePreview}</p>
            )}
          </div>

          {/* Command */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Command <span className="text-mc-accent-red">*</span>
            </label>
            <textarea
              value={form.command}
              onChange={set('command')}
              required
              rows={4}
              placeholder="bash /path/to/script.sh"
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-mc-accent resize-none"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Type <span className="text-mc-accent-red">*</span>
            </label>
            <select
              value={form.type}
              onChange={set('type')}
              required
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
            >
              {CRON_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Agent */}
          <div>
            <label className="block text-sm font-medium mb-1">Agent</label>
            <select
              value={form.agent_id}
              onChange={set('agent_id')}
              disabled={!!agentId}
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">-- No agent --</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.avatar_emoji} {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={set('description')}
              rows={2}
              placeholder="What does this cron job do?"
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent resize-none"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              value={form.status}
              onChange={set('status')}
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
            >
              {CRON_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-mc-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-mc-text-secondary hover:text-mc-text"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSubmitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
