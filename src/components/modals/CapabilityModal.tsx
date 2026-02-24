'use client';

import { useState } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import type { Capability, CapabilityCategory, CapabilityStatus } from '@/lib/types';

interface CapabilityModalProps {
  capability?: Capability;
  onClose: () => void;
  onSaved: (c: Capability) => void;
}

const CAPABILITY_CATEGORIES: { value: CapabilityCategory; label: string }[] = [
  { value: 'mcp_server', label: 'MCP Server' },
  { value: 'browser_automation', label: 'Browser Automation' },
  { value: 'cli_tool', label: 'CLI Tool' },
  { value: 'skill', label: 'Skill' },
  { value: 'workflow', label: 'Workflow' },
  { value: 'api_integration', label: 'API Integration' },
];

const CAPABILITY_STATUSES: { value: CapabilityStatus; label: string }[] = [
  { value: 'healthy', label: 'Healthy' },
  { value: 'degraded', label: 'Degraded' },
  { value: 'broken', label: 'Broken' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'unknown', label: 'Unknown' },
];

export function CapabilityModal({ capability, onClose, onSaved }: CapabilityModalProps) {
  const [form, setForm] = useState({
    name: capability?.name ?? '',
    category: capability?.category ?? ('cli_tool' as CapabilityCategory),
    provider: capability?.provider ?? '',
    version: capability?.version ?? '',
    description: capability?.description ?? '',
    install_path: capability?.install_path ?? '',
    skill_path: capability?.skill_path ?? '',
    config_ref: capability?.config_ref ?? '',
    is_shared: capability?.is_shared ?? false,
    workspace_id: capability?.workspace_id ?? '',
    status: capability?.status ?? ('unknown' as CapabilityStatus),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const url = capability
        ? `/api/capabilities/${capability.id}`
        : '/api/capabilities';
      const method = capability ? 'PATCH' : 'POST';

      const payload = {
        name: form.name,
        category: form.category,
        provider: form.provider || undefined,
        version: form.version || undefined,
        description: form.description || undefined,
        install_path: form.install_path || undefined,
        skill_path: form.skill_path || undefined,
        config_ref: form.config_ref || undefined,
        is_shared: form.is_shared,
        workspace_id: form.is_shared ? undefined : form.workspace_id || undefined,
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

      const result: Capability = await res.json();
      onSaved(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!capability) return;
    if (!window.confirm(`Delete capability "${capability.name}"? This cannot be undone.`)) return;

    setError(null);
    try {
      const res = await fetch(`/api/capabilities/${capability.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? `Delete failed with status ${res.status}`);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete capability');
    }
  };

  const setField = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-mc-border">
          <h2 className="text-lg font-semibold">
            {capability ? 'Edit Capability' : 'New Capability'}
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
              onChange={setField('name')}
              required
              placeholder="Capability name"
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Category <span className="text-mc-accent-red">*</span>
            </label>
            <select
              value={form.category}
              onChange={setField('category')}
              required
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
            >
              {CAPABILITY_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Provider */}
          <div>
            <label className="block text-sm font-medium mb-1">Provider</label>
            <input
              type="text"
              value={form.provider}
              onChange={setField('provider')}
              placeholder="e.g., Playwright, Puppeteer"
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
            />
          </div>

          {/* Version */}
          <div>
            <label className="block text-sm font-medium mb-1">Version</label>
            <input
              type="text"
              value={form.version}
              onChange={setField('version')}
              placeholder="e.g., 1.0.0"
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={setField('description')}
              rows={2}
              placeholder="What does this capability provide?"
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent resize-none"
            />
          </div>

          {/* Install Path */}
          <div>
            <label className="block text-sm font-medium mb-1">Install Path</label>
            <input
              type="text"
              value={form.install_path}
              onChange={setField('install_path')}
              placeholder="/usr/local/bin/tool"
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-mc-accent"
            />
          </div>

          {/* Skill Path — only shown when category is 'skill' */}
          {form.category === 'skill' && (
            <div>
              <label className="block text-sm font-medium mb-1">Skill Path</label>
              <input
                type="text"
                value={form.skill_path}
                onChange={setField('skill_path')}
                placeholder="/agents/skills/my-skill.md"
                className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-mc-accent"
              />
            </div>
          )}

          {/* Config Ref */}
          <div>
            <label className="block text-sm font-medium mb-1">Config Ref</label>
            <input
              type="text"
              value={form.config_ref}
              onChange={setField('config_ref')}
              placeholder="config/capability.json"
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-mc-accent"
            />
          </div>

          {/* Shared */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_shared"
              checked={form.is_shared}
              onChange={(e) => setForm((prev) => ({ ...prev, is_shared: e.target.checked }))}
              className="w-4 h-4"
            />
            <label htmlFor="is_shared" className="text-sm">
              Shared (available across all workspaces)
            </label>
          </div>

          {/* Workspace ID — only shown when not shared */}
          {!form.is_shared && (
            <div>
              <label className="block text-sm font-medium mb-1">Workspace ID</label>
              <input
                type="text"
                value={form.workspace_id}
                onChange={setField('workspace_id')}
                placeholder="workspace-id"
                className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-mc-accent"
              />
            </div>
          )}

          {/* Status */}
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              value={form.status}
              onChange={setField('status')}
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
            >
              {CAPABILITY_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-mc-border">
          <div>
            {capability && (
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center gap-2 px-3 py-2 text-mc-accent-red hover:bg-mc-accent-red/10 rounded text-sm"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
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
    </div>
  );
}
