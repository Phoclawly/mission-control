'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Users, Plus, Filter } from 'lucide-react';
import { Header } from '@/components/Header';
import { AgentDetailPanel } from '@/components/AgentDetailPanel';
import { AgentModal } from '@/components/AgentModal';
import { useMissionControl } from '@/lib/store';
import { useSSE } from '@/hooks/useSSE';
import type { Agent, Workspace } from '@/lib/types';

type FilterStatus = 'all' | 'working' | 'standby' | 'offline';

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

export default function AgentsPage() {
  const params = useParams();
  const slug = params.slug as string;

  const {
    agents,
    setAgents,
    setTasks,
    setEvents,
    setIsOnline,
    setIsLoading,
    isLoading,
  } = useMissionControl();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Connect to SSE for real-time updates
  useSSE();

  // Load workspace data
  useEffect(() => {
    async function loadWorkspace() {
      try {
        const res = await fetch(`/api/workspaces/${slug}`);
        if (res.ok) {
          const data = await res.json();
          setWorkspace(data);
        } else if (res.status === 404) {
          setNotFound(true);
          setIsLoading(false);
          return;
        }
      } catch (error) {
        console.error('Failed to load workspace:', error);
        setNotFound(true);
        setIsLoading(false);
        return;
      }
    }

    loadWorkspace();
  }, [slug, setIsLoading]);

  // Load workspace-specific data
  useEffect(() => {
    if (!workspace) return;

    const workspaceId = workspace.id;

    async function loadData() {
      try {
        const [agentsRes, tasksRes, eventsRes] = await Promise.all([
          fetch('/api/agents'),
          fetch(`/api/tasks?workspace_id=${workspaceId}`),
          fetch('/api/events'),
        ]);

        if (agentsRes.ok) setAgents(await agentsRes.json());
        if (tasksRes.ok) setTasks(await tasksRes.json());
        if (eventsRes.ok) setEvents(await eventsRes.json());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    // Check OpenClaw connection separately (non-blocking)
    async function checkOpenClaw() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const openclawRes = await fetch('/api/openclaw/status', { signal: controller.signal });
        clearTimeout(timeoutId);

        if (openclawRes.ok) {
          const status = await openclawRes.json();
          setIsOnline(status.connected);
        }
      } catch {
        setIsOnline(false);
      }
    }

    loadData();
    checkOpenClaw();
  }, [workspace, setAgents, setTasks, setEvents, setIsOnline, setIsLoading]);

  // Filter agents
  const filteredAgents = agents.filter((agent) => {
    if (filter === 'all') return true;
    return agent.status === filter;
  });

  // Count by status
  const counts = {
    all: agents.length,
    working: agents.filter((a) => a.status === 'working').length,
    standby: agents.filter((a) => a.status === 'standby').length,
    offline: agents.filter((a) => a.status === 'offline').length,
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold mb-2">Workspace Not Found</h1>
          <p className="text-mc-text-secondary mb-6">
            The workspace &ldquo;{slug}&rdquo; doesn&apos;t exist.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-mc-accent text-mc-bg rounded-lg font-medium hover:bg-mc-accent/90"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading || !workspace) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🦞</div>
          <p className="text-mc-text-secondary">Loading {slug}...</p>
        </div>
      </div>
    );
  }

  const filterButtons: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'working', label: `Working (${counts.working})` },
    { key: 'standby', label: `Standby (${counts.standby})` },
    { key: 'offline', label: `Offline (${counts.offline})` },
  ];

  return (
    <div className="h-screen flex flex-col bg-mc-bg overflow-hidden">
      <Header workspace={workspace} />

      {/* Page header */}
      <div className="border-b border-mc-border bg-mc-bg-secondary px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Link
              href={`/workspace/${slug}`}
              className="p-1 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary hover:text-mc-text transition-colors"
              title="Back to workspace"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <Users className="w-5 h-5 text-mc-accent" />
            <h1 className="text-xl font-semibold text-mc-text">Agents</h1>
            <span className="text-sm text-mc-text-secondary">({agents.length} total)</span>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-mc-accent text-mc-bg rounded-lg text-sm font-medium hover:bg-mc-accent/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Agent
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-mc-text-secondary" />
          {filterButtons.map((btn) => (
            <button
              key={btn.key}
              onClick={() => setFilter(btn.key)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                filter === btn.key
                  ? 'bg-mc-accent/20 text-mc-accent border border-mc-accent/30'
                  : 'bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text border border-transparent'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        <div className={`flex-1 overflow-y-auto p-6 ${selectedAgentId ? 'max-w-[60%]' : ''}`}>
          {filteredAgents.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto mb-3 text-mc-text-secondary opacity-50" />
              <p className="text-mc-text-secondary">
                {filter === 'all'
                  ? 'No agents yet. Create one to get started.'
                  : `No ${filter} agents.`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredAgents.map((agent) => (
                <div
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`bg-mc-bg-secondary border rounded-lg p-4 cursor-pointer hover:border-mc-accent transition-colors ${
                    selectedAgentId === agent.id
                      ? 'border-mc-accent'
                      : 'border-mc-border'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="text-3xl">{agent.avatar_emoji}</div>
                    <span className={getStatusBadgeClasses(agent.status)}>
                      {agent.status.toUpperCase()}
                    </span>
                  </div>
                  <h3 className="font-semibold text-mc-text">{agent.name}</h3>
                  <p className="text-sm text-mc-text-secondary">{agent.role}</p>
                  {agent.is_master && (
                    <span className="text-xs text-mc-accent">&#9733; Master</span>
                  )}
                  {agent.current_activity && (
                    <p className="text-xs text-mc-text-secondary mt-1 line-clamp-2">
                      {agent.current_activity}
                    </p>
                  )}
                  {agent.model && (
                    <p className="text-xs text-mc-text-secondary mt-1 truncate">
                      Model: {agent.model}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedAgentId && (
          <AgentDetailPanel
            agentId={selectedAgentId}
            onClose={() => setSelectedAgentId(null)}
            onEdit={(agent) => {
              setShowCreateModal(true);
            }}
          />
        )}
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <AgentModal
          agent={selectedAgentId ? agents.find((a) => a.id === selectedAgentId) : undefined}
          workspaceId={workspace.id}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
