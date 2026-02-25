'use client';

import { Shield, ChevronDown, ChevronRight, Plus, Search } from 'lucide-react';
import type { Capability, CapabilityCategory } from '@/lib/types';

const capabilityCategoryOrder: CapabilityCategory[] = [
  'mcp_server',
  'browser_automation',
  'cli_tool',
  'skill',
  'workflow',
  'api_integration',
];

const capabilityCategoryLabels: Record<CapabilityCategory, string> = {
  mcp_server: 'MCP Servers',
  browser_automation: 'Browser Automation',
  cli_tool: 'CLI Tools',
  skill: 'Skills',
  workflow: 'Workflows',
  api_integration: 'API Integrations',
  credential_provider: 'Credential Providers',
};

const capStatusClasses: Record<string, string> = {
  healthy: 'bg-mc-accent-green/20 text-mc-accent-green border-mc-accent-green/30',
  broken: 'bg-mc-accent-red/20 text-mc-accent-red border-mc-accent-red/30',
  degraded: 'bg-mc-accent-yellow/20 text-mc-accent-yellow border-mc-accent-yellow/30',
  unknown: 'bg-mc-bg-tertiary text-mc-text-secondary border-mc-border',
  disabled: 'bg-mc-bg-tertiary text-mc-text-secondary border-mc-border',
};

interface AgentCapabilitiesSectionProps {
  agentCapabilities: Capability[];
  capsLoading: boolean;
  collapsedCapCategories: Record<string, boolean>;
  toggleCapCategory: (category: string) => void;
  expandedCapContent: Record<string, boolean>;
  capContent: Record<string, string>;
  capContentLoading: Record<string, boolean>;
  toggleCapContent: (cap: Capability) => void;
  showLinkCap: boolean;
  setShowLinkCap: (show: boolean) => void;
  linkCapSearch: string;
  setLinkCapSearch: (search: string) => void;
  linkCapLoading: boolean;
  linkCapResults: Capability[];
  handleLinkCapability: (capId: string) => void;
}

export function AgentCapabilitiesSection({
  agentCapabilities,
  capsLoading,
  collapsedCapCategories,
  toggleCapCategory,
  expandedCapContent,
  capContent,
  capContentLoading,
  toggleCapContent,
  showLinkCap,
  setShowLinkCap,
  linkCapSearch,
  setLinkCapSearch,
  linkCapLoading,
  linkCapResults,
  handleLinkCapability,
}: AgentCapabilitiesSectionProps) {
  if (capsLoading) {
    return (
      <div className="text-center py-8">
        <Shield className="w-6 h-6 mx-auto mb-2 text-mc-text-secondary animate-pulse" />
        <p className="text-sm text-mc-text-secondary">Loading capabilities...</p>
      </div>
    );
  }

  // Group by category
  const grouped: Record<string, Capability[]> = {};
  agentCapabilities.forEach((cap) => {
    const key = cap.category;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(cap);
  });

  const presentCategories: CapabilityCategory[] = [];
  capabilityCategoryOrder.forEach((cat) => {
    if (grouped[cat]?.length) presentCategories.push(cat);
  });
  Object.keys(grouped).forEach((cat) => {
    const typedCat = cat as CapabilityCategory;
    if (!presentCategories.includes(typedCat)) presentCategories.push(typedCat);
  });

  return (
    <div className="space-y-3">
      {agentCapabilities.length === 0 ? (
        <div className="text-center py-8">
          <Shield className="w-8 h-8 mx-auto mb-2 text-mc-text-secondary opacity-50" />
          <p className="text-mc-text-secondary">No capabilities assigned</p>
        </div>
      ) : (
        presentCategories.map((category) => {
          const caps = grouped[category] ?? [];
          const isCollapsed = collapsedCapCategories[category] ?? false;
          const displayName = capabilityCategoryLabels[category] ?? category.replace(/_/g, ' ');

          return (
            <div key={category} className="border border-mc-border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleCapCategory(category)}
                className="w-full flex items-center justify-between px-3 py-2 bg-mc-bg-secondary hover:bg-mc-bg-tertiary transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-mc-text-secondary" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-mc-text-secondary" />
                  )}
                  <span className="text-sm font-medium text-mc-text">{displayName}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-mc-bg-tertiary text-mc-text-secondary border border-mc-border">
                    {caps.length}
                  </span>
                </div>
              </button>

              {!isCollapsed && (
                <div className="divide-y divide-mc-border/50">
                  {caps.map((cap) => (
                    <div key={cap.id} className="p-3 bg-mc-bg">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-mc-text">{cap.name}</span>
                          {cap.skill_path && (
                            <span className="ml-2 text-xs font-mono text-mc-accent-cyan bg-mc-bg-tertiary px-1.5 py-0.5 rounded">
                              {cap.skill_path}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {cap.category === 'skill' && (
                            <button
                              onClick={() => toggleCapContent(cap)}
                              disabled={capContentLoading[cap.id]}
                              className="text-xs px-2 py-0.5 rounded bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text border border-mc-border hover:border-mc-accent/50 transition-colors disabled:opacity-50"
                            >
                              {capContentLoading[cap.id]
                                ? 'Loading...'
                                : expandedCapContent[cap.id]
                                ? 'Hide .md'
                                : 'View .md'}
                            </button>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${capStatusClasses[cap.status] ?? capStatusClasses.unknown}`}>
                            {cap.status}
                          </span>
                        </div>
                      </div>
                      {expandedCapContent[cap.id] && capContent[cap.id] && (
                        <pre className="mt-2 text-xs text-mc-text-secondary bg-mc-bg-secondary border border-mc-border rounded p-2 overflow-x-auto whitespace-pre-wrap">
                          {capContent[cap.id]}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Link Capability */}
      <div className="pt-2 border-t border-mc-border/50">
        {showLinkCap ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-mc-text-secondary" />
                <input
                  type="text"
                  value={linkCapSearch}
                  onChange={(e) => setLinkCapSearch(e.target.value)}
                  placeholder="Search capabilities..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-mc-bg-tertiary border border-mc-border rounded focus:outline-none focus:border-mc-accent text-mc-text"
                  autoFocus
                />
              </div>
              <button
                onClick={() => { setShowLinkCap(false); setLinkCapSearch(''); }}
                className="text-xs text-mc-text-secondary hover:text-mc-text px-2 py-1.5"
              >
                Cancel
              </button>
            </div>
            {linkCapLoading && (
              <p className="text-xs text-mc-text-secondary px-1">Searching...</p>
            )}
            {linkCapResults.length > 0 && (
              <div className="border border-mc-border rounded overflow-hidden">
                {linkCapResults.map((cap) => (
                  <button
                    key={cap.id}
                    onClick={() => handleLinkCapability(cap.id)}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-mc-bg-tertiary transition-colors text-left border-b border-mc-border/50 last:border-b-0"
                  >
                    <div>
                      <span className="text-sm text-mc-text">{cap.name}</span>
                      <span className="ml-2 text-xs text-mc-text-secondary">{cap.category.replace(/_/g, ' ')}</span>
                    </div>
                    <Plus className="w-3.5 h-3.5 text-mc-text-secondary" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setShowLinkCap(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text rounded border border-mc-border hover:border-mc-accent/50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Link Capability
          </button>
        )}
      </div>
    </div>
  );
}
