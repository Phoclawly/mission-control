'use client';

import { useState } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import type { Integration, IntegrationType, IntegrationStatus } from '@/lib/types';

interface IntegrationModalProps {
  integration?: Integration;
  onClose: () => void;
  onSaved: (i: Integration) => void;
}

const INTEGRATION_TYPES: { value: IntegrationType; label: string }[] = [
  { value: 'mcp_plugin', label: 'MCP Plugin' },
  { value: 'oauth_token', label: 'OAuth Token' },
  { value: 'api_key', label: 'API Key' },
  { value: 'cli_auth', label: 'CLI Auth' },
  { value: 'browser_profile', label: 'Browser Profile' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'credential_provider', label: 'Credential Provider' },
];

const INTEGRATION_STATUSES: { value: IntegrationStatus; label: string }[] = [
  { value: 'connected', label: 'Connected' },
  { value: 'unconfigured', label: 'Unconfigured' },
  { value: 'expired', label: 'Expired' },
  { value: 'broken', label: 'Broken' },
  { value: 'unknown', label: 'Unknown' },
];

export function IntegrationModal({ integration, onClose, onSaved }: IntegrationModalProps) {
  const [form, setForm] = useState({
    name: integration?.name ?? '',
    type: integration?.type ?? ('api_key' as IntegrationType),
    provider: integration?.provider ?? '',
    credential_source: integration?.credential_source ?? '',
    status: integration?.status ?? ('unconfigured' as IntegrationStatus),
    config: integration?.config ?? '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const url = integration
        ? `/api/integrations/${integration.id}`
        : '/api/integrations';
      const method = integration ? 'PATCH' : 'POST';

      const payload = {
        name: form.name,
        type: form.type,
        provider: form.provider || undefined,
        credential_source: form.credential_source || undefined,
        status: form.status,
        config: form.config || undefined,
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

      const result: Integration = await res.json();
      onSaved(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!integration) return;
    if (!window.confirm(`Delete integration "${integration.name}"? This cannot be undone.`)) return;

    setError(null);
    try {
      const res = await fetch(`/api/integrations/${integration.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? `Delete failed with status ${res.status}`);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete integration');
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
            {integration ? 'Edit Integration' : 'New Integration'}
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
              placeholder="Integration name"
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
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
              {INTEGRATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
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
              onChange={set('provider')}
              placeholder="e.g., GitHub, Stripe"
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
            />
          </div>

          {/* Credential Source */}
          <div>
            <label className="block text-sm font-medium mb-1">Credential Source</label>
            <input
              type="text"
              value={form.credential_source}
              onChange={set('credential_source')}
              placeholder="e.g., ~/.env, vault://secret/github"
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
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
              {INTEGRATION_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Advanced: Config JSON */}
          <details className="border border-mc-border rounded">
            <summary className="px-3 py-2 text-sm font-medium cursor-pointer hover:bg-mc-bg-tertiary select-none">
              Advanced
            </summary>
            <div className="px-3 pb-3 pt-2">
              <label className="block text-sm font-medium mb-1">Config JSON</label>
              <textarea
                value={form.config}
                onChange={set('config')}
                rows={6}
                placeholder='{"key": "value"}'
                className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-mc-accent resize-none"
              />
            </div>
          </details>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-mc-border">
          <div>
            {integration && (
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
