'use client';

import { useState, useEffect } from 'react';
import { Shield, Filter, RefreshCw, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Capability, CapabilityCategory, CapabilityStatus, Agent } from '@/lib/types';
import { CapabilityModal } from '@/components/modals/CapabilityModal';
import { SkillsRegistry } from '@/components/SkillsRegistry';

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

const categoryOrder: CapabilityCategory[] = [
  'mcp_server',
  'browser_automation',
  'cli_tool',
  'skill',
  'workflow',
  'api_integration',
];

const categoryDisplayNames: Record<CapabilityCategory, string> = {
  mcp_server: 'MCP Servers',
  browser_automation: 'Browser Automation',
  cli_tool: 'CLI Tools',
  skill: 'Skills',
  workflow: 'Workflows',
  api_integration: 'API Integrations',
  credential_provider: 'Credential Providers',
};

interface CapabilityTableProps {
  agents?: Agent[];
}

export function CapabilityTable({ agents = [] }: CapabilityTableProps) {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [scope, setScope] = useState<'global' | 'by-agent'>('global');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [capabilityModalOpen, setCapabilityModalOpen] = useState(false);

  const fetchCapabilities = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (scope === 'by-agent' && selectedAgentId) params.set('agent_id', selectedAgentId);

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
  }, [categoryFilter, statusFilter, scope, selectedAgentId]);

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  // Group capabilities by category
  const groupedCapabilities: Record<string, Capability[]> = {};
  capabilities.forEach((cap) => {
    const key = cap.category;
    if (!groupedCapabilities[key]) groupedCapabilities[key] = [];
    groupedCapabilities[key].push(cap);
  });

  // Build ordered list of categories present in data
  const presentCategories: CapabilityCategory[] = [];
  categoryOrder.forEach((cat) => {
    if (groupedCapabilities[cat] && groupedCapabilities[cat].length > 0) {
      presentCategories.push(cat);
    }
  });
  // Add any categories not in the defined order
  Object.keys(groupedCapabilities).forEach((cat) => {
    const typedCat = cat as CapabilityCategory;
    if (!presentCategories.includes(typedCat)) {
      presentCategories.push(typedCat);
    }
  });

  const categories: string[] = ['all', ...Object.keys(categoryLabels)];
  const statuses: string[] = ['all', 'healthy', 'degraded', 'broken', 'unknown', 'disabled'];

  return (
    <div className="space-y-4">
      {/* Header controls row */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Scope toggle */}
        <div className="flex items-center gap-2">
          <div className="flex rounded border border-mc-border overflow-hidden">
            <button
              onClick={() => setScope('global')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                scope === 'global'
                  ? 'bg-mc-accent text-mc-bg'
                  : 'bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text'
              }`}
            >
              Global
            </button>
            <button
              onClick={() => setScope('by-agent')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                scope === 'by-agent'
                  ? 'bg-mc-accent text-mc-bg'
                  : 'bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text'
              }`}
            >
              By Agent
            </button>
          </div>

          {scope === 'by-agent' && (
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="bg-mc-bg-tertiary border border-mc-border rounded px-2 py-1.5 text-sm text-mc-text focus:outline-none focus:border-mc-accent"
            >
              <option value="">All Agents</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.avatar_emoji} {agent.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* New Capability button */}
        <button
          onClick={() => setCapabilityModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-mc-accent text-mc-bg rounded hover:bg-mc-accent/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Capability
        </button>
      </div>

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
        <div className="overflow-x-auto space-y-2">
          {presentCategories.map((category) => {
            const caps = groupedCapabilities[category] ?? [];
            const isCollapsed = collapsedCategories[category] ?? false;
            const displayName = categoryDisplayNames[category] ?? categoryLabels[category] ?? category;

            return (
              <div key={category} className="border border-mc-border rounded-lg overflow-hidden">
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-mc-bg-secondary hover:bg-mc-bg-tertiary transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-mc-text-secondary" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-mc-text-secondary" />
                    )}
                    <span className="text-sm font-medium text-mc-text">{displayName}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-mc-bg-tertiary text-mc-text-secondary border border-mc-border">
                      {caps.length}
                    </span>
                  </div>
                </button>

                {/* Category rows */}
                {!isCollapsed && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-mc-border/50 bg-mc-bg-secondary/50 text-left">
                        <th className="pb-2 pt-2 px-4 text-xs font-medium text-mc-text-secondary uppercase">Name</th>
                        <th className="pb-2 pt-2 pr-4 text-xs font-medium text-mc-text-secondary uppercase">Provider</th>
                        <th className="pb-2 pt-2 pr-4 text-xs font-medium text-mc-text-secondary uppercase">Status</th>
                        <th className="pb-2 pt-2 pr-4 text-xs font-medium text-mc-text-secondary uppercase">Version</th>
                        <th className="pb-2 pt-2 pr-4 text-xs font-medium text-mc-text-secondary uppercase">Last Check</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caps.map((cap) => (
                        <tr
                          key={cap.id}
                          className="border-b border-mc-border/50 hover:bg-mc-bg-tertiary/50 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div>
                              <span className="text-mc-text font-medium">{cap.name}</span>
                              {cap.description && (
                                <p className="text-xs text-mc-text-secondary mt-0.5 line-clamp-1">{cap.description}</p>
                              )}
                              {cap.skill_path && (
                                <p className="text-xs text-mc-accent-cyan font-mono mt-0.5">{cap.skill_path}</p>
                              )}
                            </div>
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
                          <td className="py-3 pr-4 text-mc-text-secondary">
                            {cap.last_health_check
                              ? formatDistanceToNow(new Date(cap.last_health_check), { addSuffix: true })
                              : 'Never'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Skills Registry (global scope only) */}
      {scope === 'global' && (
        <div className="mt-6">
          <SkillsRegistry />
        </div>
      )}

      {/* Capability Modal */}
      {capabilityModalOpen && (
        <CapabilityModal
          onClose={() => setCapabilityModalOpen(false)}
          onSaved={() => {
            setCapabilityModalOpen(false);
            fetchCapabilities();
          }}
        />
      )}
    </div>
  );
}
