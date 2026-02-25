'use client';

import { useState, useEffect } from 'react';
import { X, Edit } from 'lucide-react';
import type { Agent, TaskActivity, OpenClawSession, Capability, CronJob } from '@/lib/types';
import { AgentOverviewSection } from '@/components/AgentOverviewSection';
import { AgentCapabilitiesSection } from '@/components/AgentCapabilitiesSection';
import { AgentCronsSection } from '@/components/AgentCronsSection';
import { AgentMarkdownTab } from '@/components/AgentMarkdownTab';

interface AgentDetailPanelProps {
  agentId: string;
  onClose: () => void;
  onEdit: (agent: Agent) => void;
  agents?: Agent[];
}

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'soul', label: 'SOUL.md' },
  { id: 'tools', label: 'TOOLS.md' },
  { id: 'user', label: 'USER.md' },
  { id: 'agents', label: 'AGENTS.md' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'crons', label: 'Crons' },
] as const;

type TabId = typeof tabs[number]['id'];

const mdFieldMap: Record<string, keyof Agent> = {
  soul: 'soul_md',
  tools: 'tools_md',
  user: 'user_md',
  agents: 'agents_md',
};

export function AgentDetailPanel({ agentId, onClose, onEdit, agents = [] }: AgentDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [agent, setAgent] = useState<Agent | null>(null);
  const [stats, setStats] = useState({ tasksAssigned: 0, tasksCompleted: 0, totalTasks: 0 });
  const [activeSession, setActiveSession] = useState<OpenClawSession | null>(null);
  const [recentActivity, setRecentActivity] = useState<TaskActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentCapabilities, setAgentCapabilities] = useState<Capability[]>([]);
  const [agentCrons, setAgentCrons] = useState<CronJob[]>([]);
  const [capsLoading, setCapsLoading] = useState(false);
  const [cronsLoading, setCronsLoading] = useState(false);

  // Collapsed categories state for capabilities tab
  const [collapsedCapCategories, setCollapsedCapCategories] = useState<Record<string, boolean>>({});

  // Per-capability inline content state
  const [expandedCapContent, setExpandedCapContent] = useState<Record<string, boolean>>({});
  const [capContent, setCapContent] = useState<Record<string, string>>({});
  const [capContentLoading, setCapContentLoading] = useState<Record<string, boolean>>({});

  // Link capability state
  const [linkCapSearch, setLinkCapSearch] = useState('');
  const [linkCapResults, setLinkCapResults] = useState<Capability[]>([]);
  const [linkCapLoading, setLinkCapLoading] = useState(false);
  const [showLinkCap, setShowLinkCap] = useState(false);

  // Cron modal state
  const [cronModalOpen, setCronModalOpen] = useState(false);
  const [editingCron, setEditingCron] = useState<CronJob | undefined>(undefined);

  // Fetch data on mount/agentId change
  useEffect(() => {
    const loadDetail = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/agents/${agentId}/detail`);
        if (res.ok) {
          const data = await res.json();
          setAgent(data.agent);
          setStats(data.stats);
          setActiveSession(data.activeSession);
          setRecentActivity(data.recentActivity);
        }
      } catch (error) {
        console.error('Failed to load agent detail:', error);
      } finally {
        setLoading(false);
      }
    };
    loadDetail();
    setActiveTab('overview'); // Reset tab when switching agents
  }, [agentId]);

  // Fetch capabilities when tab is selected
  useEffect(() => {
    if (activeTab !== 'capabilities' || !agentId) return;
    setCapsLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/agents/${agentId}/capabilities`);
        if (res.ok) {
          const data = await res.json();
          const caps: Capability[] = data.map((item: { capability?: Capability } & Capability) =>
            item.capability ? item.capability : item
          );
          setAgentCapabilities(caps);
        }
      } catch (error) {
        console.error('Failed to load agent capabilities:', error);
      } finally {
        setCapsLoading(false);
      }
    })();
  }, [activeTab, agentId]);

  // Fetch crons when tab is selected
  useEffect(() => {
    if (activeTab !== 'crons' || !agentId) return;
    setCronsLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/agents/${agentId}/crons`);
        if (res.ok) {
          const data = await res.json();
          setAgentCrons(data);
        }
      } catch (error) {
        console.error('Failed to load agent crons:', error);
      } finally {
        setCronsLoading(false);
      }
    })();
  }, [activeTab, agentId]);

  // Search capabilities for linking
  useEffect(() => {
    if (!linkCapSearch.trim()) {
      setLinkCapResults([]);
      return;
    }
    setLinkCapLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/capabilities?search=${encodeURIComponent(linkCapSearch)}`);
        if (res.ok) {
          const data = await res.json();
          setLinkCapResults(data.slice(0, 10));
        }
      } catch (error) {
        console.error('Failed to search capabilities:', error);
      } finally {
        setLinkCapLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [linkCapSearch]);

  const toggleCapCategory = (category: string) => {
    setCollapsedCapCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const toggleCapContent = async (cap: Capability) => {
    const isExpanded = expandedCapContent[cap.id];
    if (isExpanded) {
      setExpandedCapContent((prev) => ({ ...prev, [cap.id]: false }));
      return;
    }
    if (!capContent[cap.id]) {
      setCapContentLoading((prev) => ({ ...prev, [cap.id]: true }));
      try {
        const res = await fetch(`/api/capabilities/${cap.id}/content`);
        if (res.ok) {
          const data = await res.json();
          setCapContent((prev) => ({ ...prev, [cap.id]: data.content ?? '' }));
        }
      } catch (error) {
        console.error('Failed to fetch capability content:', error);
      } finally {
        setCapContentLoading((prev) => ({ ...prev, [cap.id]: false }));
      }
    }
    setExpandedCapContent((prev) => ({ ...prev, [cap.id]: true }));
  };

  const handleLinkCapability = async (capId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/capabilities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capability_id: capId }),
      });
      if (res.ok) {
        const capsRes = await fetch(`/api/agents/${agentId}/capabilities`);
        if (capsRes.ok) {
          const data = await capsRes.json();
          const caps: Capability[] = data.map((item: { capability?: Capability } & Capability) =>
            item.capability ? item.capability : item
          );
          setAgentCapabilities(caps);
        }
        setLinkCapSearch('');
        setLinkCapResults([]);
        setShowLinkCap(false);
      }
    } catch (error) {
      console.error('Failed to link capability:', error);
    }
  };

  const handleCronSaved = (saved: CronJob) => {
    setCronModalOpen(false);
    setAgentCrons((prev) => {
      const exists = prev.find((c) => c.id === saved.id);
      if (exists) {
        return prev.map((c) => (c.id === saved.id ? saved : c));
      }
      return [...prev, saved];
    });
    setEditingCron(undefined);
  };

  if (loading) {
    return (
      <div className="w-[500px] border-l border-mc-border bg-mc-bg-secondary flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-3xl animate-pulse mb-2">🦞</div>
          <p className="text-sm text-mc-text-secondary">Loading agent...</p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="w-[500px] border-l border-mc-border bg-mc-bg-secondary flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-mc-text-secondary">Agent not found</p>
          <button
            onClick={onClose}
            className="mt-2 text-sm text-mc-accent hover:underline"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const mdField = mdFieldMap[activeTab];
  const mdContent = mdField ? (agent[mdField] as string | undefined) : undefined;

  return (
    <div className="w-[500px] border-l border-mc-border bg-mc-bg-secondary flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-mc-border">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{agent.avatar_emoji}</span>
          <div>
            <h2 className="font-semibold">{agent.name}</h2>
            <p className="text-sm text-mc-text-secondary">{agent.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(agent)}
            className="p-2 hover:bg-mc-bg-tertiary rounded"
            title="Edit"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-2 hover:bg-mc-bg-tertiary rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-mc-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'border-mc-accent text-mc-accent'
                : 'border-transparent text-mc-text-secondary hover:text-mc-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'overview' && (
          <AgentOverviewSection
            agent={agent}
            stats={stats}
            activeSession={activeSession}
            recentActivity={recentActivity}
          />
        )}
        {activeTab === 'capabilities' && (
          <AgentCapabilitiesSection
            agentCapabilities={agentCapabilities}
            capsLoading={capsLoading}
            collapsedCapCategories={collapsedCapCategories}
            toggleCapCategory={toggleCapCategory}
            expandedCapContent={expandedCapContent}
            capContent={capContent}
            capContentLoading={capContentLoading}
            toggleCapContent={toggleCapContent}
            showLinkCap={showLinkCap}
            setShowLinkCap={setShowLinkCap}
            linkCapSearch={linkCapSearch}
            setLinkCapSearch={setLinkCapSearch}
            linkCapLoading={linkCapLoading}
            linkCapResults={linkCapResults}
            handleLinkCapability={handleLinkCapability}
          />
        )}
        {activeTab === 'crons' && (
          <AgentCronsSection
            agentCrons={agentCrons}
            cronsLoading={cronsLoading}
            agentId={agentId}
            agents={agents}
            editingCron={editingCron}
            setEditingCron={setEditingCron}
            cronModalOpen={cronModalOpen}
            setCronModalOpen={setCronModalOpen}
            handleCronSaved={handleCronSaved}
          />
        )}
        {activeTab !== 'overview' && activeTab !== 'capabilities' && activeTab !== 'crons' && (
          <AgentMarkdownTab content={mdContent} />
        )}
      </div>
    </div>
  );
}
