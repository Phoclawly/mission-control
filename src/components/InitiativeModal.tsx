'use client';

import { useState } from 'react';
import { X, Save, Plus } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { InitiativeStatus } from '@/lib/types';
interface InitiativeModalProps {
  onClose: () => void;
  workspaceId?: string;
}

export function InitiativeModal({ onClose, workspaceId }: InitiativeModalProps) {
  const { agents, addInitiative } = useMissionControl();
  const masterAgent = agents.find((a) => a.is_master);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quickTasksText, setQuickTasksText] = useState('');
  const [quickTasksCreated, setQuickTasksCreated] = useState(0);
  const [form, setForm] = useState({
    title: '',
    summary: '',
    lead: masterAgent?.id || '',
    priority: 'normal',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setIsSubmitting(true);

    try {
      const id = `INIT-${Date.now().toString(36).toUpperCase()}`;
      const now = new Date().toISOString();

      const payload = {
        id,
        title: form.title,
        status: 'planned' as InitiativeStatus,
        lead: form.lead || undefined,
        priority: form.priority,
        summary: form.summary || undefined,
        source: 'mission-control',
        workspace_id: workspaceId || 'default',
        created: now,
        synced_at: now,
        history: JSON.stringify([{ status: 'planned', at: now, by: 'user', note: 'Created from Mission Control' }]),
      };

      const res = await fetch('/api/initiatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let createdInitiative;
      if (res.ok) {
        createdInitiative = await res.json();
        addInitiative({ ...createdInitiative, task_count: 0, completed_task_count: 0 });
      } else {
        createdInitiative = {
          ...payload,
          participants: [],
          history: [{ status: 'planned', at: now, by: 'user', note: 'Created from Mission Control' }],
          task_count: 0,
          completed_task_count: 0,
        };
        addInitiative(createdInitiative);
      }

      // Create quick-add tasks if any
      const taskTitles = quickTasksText.split('\n').map(t => t.trim()).filter(Boolean);
      if (taskTitles.length > 0) {
        let created = 0;
        for (const title of taskTitles) {
          try {
            const taskRes = await fetch('/api/tasks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title,
                status: 'inbox',
                priority: 'normal',
                initiative_id: id,
                workspace_id: workspaceId || 'default',
              }),
            });
            if (taskRes.ok) created++;
          } catch { /* continue with remaining tasks */ }
        }
        setQuickTasksCreated(created);
      }

      onClose();
    } catch {
      console.error('Failed to create initiative');
    } finally {
      setIsSubmitting(false);
    }
  };

  const quickTaskLines = quickTasksText.split('\n').filter(l => l.trim()).length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-mc-border">
          <h2 className="text-lg font-semibold">New Initiative</h2>
          <button onClick={onClose} className="p-1 hover:bg-mc-bg-tertiary rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
              placeholder="Initiative name..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Summary</label>
            <textarea
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              rows={3}
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent resize-none"
              placeholder="What is this initiative about?"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Priority</label>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Lead Agent</label>
            <select
              value={form.lead}
              onChange={(e) => setForm({ ...form, lead: e.target.value })}
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
            >
              <option value="">No lead assigned</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.avatar_emoji} {agent.name}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Add Tasks */}
          <div className="border-t border-mc-border pt-4">
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <Plus className="w-4 h-4 text-mc-accent-cyan" />
              Quick Add Tasks
              {quickTaskLines > 0 && (
                <span className="text-xs text-mc-text-secondary font-normal">({quickTaskLines} task{quickTaskLines !== 1 ? 's' : ''})</span>
              )}
            </label>
            <textarea
              value={quickTasksText}
              onChange={(e) => setQuickTasksText(e.target.value)}
              rows={3}
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent resize-none"
              placeholder={"Enter task titles, one per line:\nDesign the API schema\nImplement backend routes\nWrite integration tests"}
            />
            <p className="text-xs text-mc-text-secondary mt-1">
              Tasks will be created in Inbox and linked to this initiative.
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2 border-t border-mc-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-mc-text-secondary hover:text-mc-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !form.title.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSubmitting ? 'Creating...' : quickTaskLines > 0 ? `Create Initiative + ${quickTaskLines} Tasks` : 'Create Initiative'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
