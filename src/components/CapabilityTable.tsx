'use client';

import { useState, useEffect } from 'react';
import { Shield, Filter, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Capability, CapabilityCategory, CapabilityStatus } from '@/lib/types';

function getStatusBadge(status: CapabilityStatus) {
  const map: Record<CapabilityStatus, { label: string; classes: string }> = {
    healthy: {
      label: 'Healthy',
      classes: 'bg-mc-accent-green/20 text-mc-accent-green border-mc-accent-green/30',
    },
    broken: {
      label: 'Broken',
      classes: 'bg-mc-accent-red/20 text-mc-accent-red border-mc-accent-red/30',
    },
    degraded: {
      label: 'Degraded',
      classes: 'bg-mc-accent-yellow/20 text-mc-accent-yellow border-mc-accent-yellow/30',
    },
    unknown: {
      label: 'Unknown',
      classes: 'bg-mc-bg-tertiary text-mc-text-secondary border-mc-border',
    },
    disabled: {
      label: 'Disabled',
      classes: 'bg-mc-bg-tertiary text-mc-text-secondary border-mc-border',
    },
  };
  const badge = map[status] ?? map.unknown;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${badge.classes}`}>
      {badge.label}
    </span>
  );
}

const categoryLabels: Record<CapabilityCategory, string> = {
  browser_automation: 'Browser Automation',
  mcp_server: 'MCP Server',
  cli_tool: 'CLI Tool',
  api_integration: 'API Integration',
  skill: 'Skill',
  workflow: 'Workflow',
  credential_provider: 'Credential Provider',
};

export function CapabilityTable() {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchCapabilities = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/capabilities?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCapabilities(data);
      }
    } catch (error) {
      console.error('Failed to fetch capabilities:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCapabilities();
  }, [categoryFilter, statusFilter]);

  const categories: string[] = ['all', ...Object.keys(categoryLabels)];
  const statuses: string[] = ['all', 'healthy', 'degraded', 'broken', 'unknown', 'disabled'];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-mc-text-secondary" />
          <span className="text-xs text-mc-text-secondary uppercase">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-mc-bg-tertiary border border-mc-border rounded px-2 py-1 text-sm text-mc-text focus:outline-none focus:border-mc-accent"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'All Categories' : categoryLabels[cat as CapabilityCategory] ?? cat}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-mc-text-secondary uppercase">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-mc-bg-tertiary border border-mc-border rounded px-2 py-1 text-sm text-mc-text focus:outline-none focus:border-mc-accent"
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={fetchCapabilities}
          className="flex items-center gap-1.5 px-3 py-1 text-sm text-mc-text-secondary hover:text-mc-text bg-mc-bg-tertiary rounded hover:bg-mc-bg transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="text-2xl animate-pulse mb-2">&#128737;</div>
          <p className="text-sm text-mc-text-secondary">Loading capabilities...</p>
        </div>
      ) : capabilities.length === 0 ? (
        <div className="text-center py-12">
          <Shield className="w-10 h-10 mx-auto mb-3 text-mc-text-secondary opacity-50" />
          <p className="text-mc-text-secondary">No capabilities found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-mc-border text-left">
                <th className="pb-2 pr-4 text-xs font-medium text-mc-text-secondary uppercase">Name</th>
                <th className="pb-2 pr-4 text-xs font-medium text-mc-text-secondary uppercase">Category</th>
                <th className="pb-2 pr-4 text-xs font-medium text-mc-text-secondary uppercase">Provider</th>
                <th className="pb-2 pr-4 text-xs font-medium text-mc-text-secondary uppercase">Status</th>
                <th className="pb-2 pr-4 text-xs font-medium text-mc-text-secondary uppercase">Version</th>
                <th className="pb-2 text-xs font-medium text-mc-text-secondary uppercase">Last Check</th>
              </tr>
            </thead>
            <tbody>
              {capabilities.map((cap) => (
                <tr
                  key={cap.id}
                  className="border-b border-mc-border/50 hover:bg-mc-bg-tertiary/50 transition-colors"
                >
                  <td className="py-3 pr-4">
                    <div>
                      <span className="text-mc-text font-medium">{cap.name}</span>
                      {cap.description && (
                        <p className="text-xs text-mc-text-secondary mt-0.5 line-clamp-1">{cap.description}</p>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-xs px-2 py-0.5 rounded bg-mc-bg-tertiary text-mc-text-secondary">
                      {categoryLabels[cap.category] ?? cap.category}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-mc-text-secondary">
                    {cap.provider ?? '\u2014'}
                  </td>
                  <td className="py-3 pr-4">
                    {getStatusBadge(cap.status)}
                  </td>
                  <td className="py-3 pr-4 text-mc-text-secondary">
                    {cap.version ?? '\u2014'}
                  </td>
                  <td className="py-3 text-mc-text-secondary">
                    {cap.last_health_check
                      ? formatDistanceToNow(new Date(cap.last_health_check), { addSuffix: true })
                      : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
