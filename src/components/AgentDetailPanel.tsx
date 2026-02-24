'use client';

import { useState, useEffect } from 'react';
import { X, Edit, Clock, CheckCircle, Activity, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { formatDistanceToNow } from 'date-fns';
import type { Agent, TaskActivity, OpenClawSession } from '@/lib/types';

interface AgentDetailPanelProps {
  agentId: string;
  onClose: () => void;
  onEdit: (agent: Agent) => void;
}

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'soul', label: 'SOUL.md' },
  { id: 'tools', label: 'TOOLS.md' },
  { id: 'user', label: 'USER.md' },
  { id: 'agents', label: 'AGENTS.md' },
] as const;

type TabId = typeof tabs[number]['id'];

function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case 'working':
      return 'text-xs px-2 py-0.5 rounded-full bg-mc-accent-green/20 text-mc-accent-green border border-mc-accent-green/30';
    case 'standby':
      return 'text-xs px-2 py-0.5 rounded-full bg-mc-accent-cyan/20 text-mc-accent-cyan border border-mc-accent-cyan/30';
    case 'offline':
      return 'text-xs px-2 py-0.5 rounded-full bg-mc-accent-red/20 text-mc-accent-red border border-mc-accent-red/30';
    default:
      return 'text-xs px-2 py-0.5 rounded-full bg-mc-bg-tertiary text-mc-text-secondary';
  }
}

export function AgentDetailPanel({ agentId, onClose, onEdit }: AgentDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [agent, setAgent] = useState<Agent | null>(null);
  const [stats, setStats] = useState({ tasksAssigned: 0, tasksCompleted: 0, totalTasks: 0 });
  const [activeSession, setActiveSession] = useState<OpenClawSession | null>(null);
  const [recentActivity, setRecentActivity] = useState<TaskActivity[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Determine markdown content for non-overview tabs
  const mdFieldMap: Record<string, keyof Agent> = {
    soul: 'soul_md',
    tools: 'tools_md',
    user: 'user_md',
    agents: 'agents_md',
  };

  const renderOverviewTab = () => (
    <div className="space-y-6">
      {/* Status + Model */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className={getStatusBadgeClasses(agent.status)}>
          {agent.status.toUpperCase()}
        </span>
        {agent.is_master && (
          <span className="text-xs bg-mc-accent/20 text-mc-accent px-2 py-1 rounded">
            &#9733; Master
          </span>
        )}
        {agent.model && (
          <span className="text-xs text-mc-text-secondary">{agent.model}</span>
        )}
      </div>

      {/* Description */}
      {agent.description && (
        <div>
          <h4 className="text-xs font-medium text-mc-text-secondary uppercase mb-1">
            Description
          </h4>
          <p className="text-sm">{agent.description}</p>
        </div>
      )}

      {/* Current Activity */}
      {agent.current_activity && (
        <div>
          <h4 className="text-xs font-medium text-mc-text-secondary uppercase mb-1">
            Current Activity
          </h4>
          <p className="text-sm">{agent.current_activity}</p>
        </div>
      )}

      {/* Task Stats */}
      <div>
        <h4 className="text-xs font-medium text-mc-text-secondary uppercase mb-2">Tasks</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-mc-bg rounded p-3 text-center">
            <div className="text-xl font-bold text-mc-accent-cyan">{stats.tasksAssigned}</div>
            <div className="text-xs text-mc-text-secondary">Active</div>
          </div>
          <div className="bg-mc-bg rounded p-3 text-center">
            <div className="text-xl font-bold text-mc-accent-green">{stats.tasksCompleted}</div>
            <div className="text-xs text-mc-text-secondary">Done</div>
          </div>
          <div className="bg-mc-bg rounded p-3 text-center">
            <div className="text-xl font-bold text-mc-text">{stats.totalTasks}</div>
            <div className="text-xs text-mc-text-secondary">Total</div>
          </div>
        </div>
      </div>

      {/* Active Session */}
      {activeSession && (
        <div>
          <h4 className="text-xs font-medium text-mc-text-secondary uppercase mb-2">
            Active Session
          </h4>
          <div className="bg-mc-bg rounded p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-mc-accent-green animate-pulse" />
              <span>{activeSession.session_type}</span>
            </div>
            {activeSession.channel && (
              <p className="text-mc-text-secondary mt-1">Channel: {activeSession.channel}</p>
            )}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-mc-text-secondary uppercase mb-2">
            Recent Activity
          </h4>
          <div className="space-y-2">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-start gap-2 text-sm">
                <Activity className="w-3 h-3 mt-1 text-mc-text-secondary flex-shrink-0" />
                <div>
                  <span>{activity.message}</span>
                  <span className="text-xs text-mc-text-secondary ml-2">
                    {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderMarkdownTab = () => {
    const mdField = mdFieldMap[activeTab];
    const content = mdField ? (agent[mdField] as string | undefined) : undefined;

    if (content) {
      return (
        <div className="prose prose-invert prose-sm max-w-none prose-headings:text-mc-text prose-p:text-mc-text-secondary prose-a:text-mc-accent prose-strong:text-mc-text prose-code:text-mc-accent-cyan prose-code:bg-mc-bg prose-code:px-1 prose-code:rounded prose-pre:bg-mc-bg prose-pre:border prose-pre:border-mc-border">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      );
    }

    return (
      <div className="text-center text-mc-text-secondary py-8">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No content yet</p>
      </div>
    );
  };

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
        {activeTab === 'overview' ? renderOverviewTab() : renderMarkdownTab()}
      </div>
    </div>
  );
}
