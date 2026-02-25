'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, BookOpen, Loader2 } from 'lucide-react';
import { Header } from '@/components/Header';
import { MemoryBrowser } from '@/components/MemoryBrowser';
import { MemoryCalendar } from '@/components/MemoryCalendar';
import { useMissionControl } from '@/lib/store';
import { useSSE } from '@/hooks/useSSE';
import type { Workspace, Agent, AgentMemoryEntry } from '@/lib/types';

export default function MemoryPage() {
  const params = useParams();
  const slug = params.slug as string;

  const { setAgents, setIsOnline, setIsLoading, isLoading } = useMissionControl();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [agents, setLocalAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [memoryEntries, setMemoryEntries] = useState<AgentMemoryEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [memoryContent, setMemoryContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [entriesLoading, setEntriesLoading] = useState(false);

  // Connect to SSE
  useSSE();

  // Load workspace
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

  // Load agents
  useEffect(() => {
    if (!workspace) return;

    async function loadAgents() {
      try {
        const [agentsRes] = await Promise.all([
          fetch(`/api/agents?workspace_id=${workspace!.id}`),
        ]);

        if (agentsRes.ok) {
          const agentsData = await agentsRes.json();
          setLocalAgents(agentsData);
          setAgents(agentsData);
          // Select first agent by default
          if (agentsData.length > 0 && !selectedAgentId) {
            setSelectedAgentId(agentsData[0].id);
          }
        }
      } catch (error) {
        console.error('Failed to load agents:', error);
      } finally {
        setIsLoading(false);
      }
    }

    // Check OpenClaw connection
    async function checkOpenClaw() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch('/api/openclaw/status', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const status = await res.json();
          setIsOnline(status.connected);
        }
      } catch {
        setIsOnline(false);
      }
    }

    loadAgents();
    checkOpenClaw();
  }, [workspace, setAgents, setIsOnline, setIsLoading]);

  // Load memory entries when agent changes
  useEffect(() => {
    if (!selectedAgentId) return;

    setEntriesLoading(true);
    setSelectedDate(null);
    setMemoryContent(null);

    async function loadMemoryEntries() {
      try {
        const res = await fetch(`/api/agents/${selectedAgentId}/memory`);
        if (res.ok) {
          const data = await res.json();
          setMemoryEntries(data);
        } else {
          setMemoryEntries([]);
        }
      } catch (error) {
        console.error('Failed to load memory entries:', error);
        setMemoryEntries([]);
      } finally {
        setEntriesLoading(false);
      }
    }

    loadMemoryEntries();
  }, [selectedAgentId]);

  // Load memory content when date changes
  useEffect(() => {
    if (!selectedAgentId || !selectedDate) return;

    setContentLoading(true);
    setMemoryContent(null);

    async function loadMemoryContent() {
      try {
        const res = await fetch(`/api/agents/${selectedAgentId}/memory/${selectedDate}`);
        if (res.ok) {
          const data = await res.json();
          setMemoryContent(data.content ?? null);
        } else {
          setMemoryContent(null);
        }
      } catch (error) {
        console.error('Failed to load memory content:', error);
        setMemoryContent(null);
      } finally {
        setContentLoading(false);
      }
    }

    loadMemoryContent();
  }, [selectedAgentId, selectedDate]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">&#128269;</div>
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
          <div className="text-4xl mb-4 animate-pulse">&#128218;</div>
          <p className="text-mc-text-secondary">Loading memory browser...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-mc-bg overflow-hidden">
      <Header workspace={workspace} />

      {/* Page header */}
      <div className="border-b border-mc-border bg-mc-bg-secondary px-6 py-4">
        <div className="flex items-center gap-3 mb-4">
          <Link
            href={`/workspace/${slug}`}
            className="p-1 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary hover:text-mc-text transition-colors"
            title="Back to workspace"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <BookOpen className="w-5 h-5 text-mc-accent" />
          <h1 className="text-xl font-semibold text-mc-text">Agent Memory</h1>
        </div>

        {/* Agent selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedAgentId(agent.id)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                selectedAgentId === agent.id
                  ? 'bg-mc-accent/20 text-mc-accent border border-mc-accent/30'
                  : 'bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text border border-transparent'
              }`}
            >
              <span>{agent.avatar_emoji}</span>
              <span>{agent.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main content: two-column */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Calendar / Date list */}
        <div className="w-72 border-r border-mc-border bg-mc-bg-secondary overflow-y-auto p-4">
          {entriesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-mc-accent animate-spin" />
            </div>
          ) : (
            <MemoryCalendar
              entries={memoryEntries.map((e) => ({
                date: e.date,
                entry_count: e.entry_count,
                file_size_bytes: e.file_size_bytes,
              }))}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          )}
        </div>

        {/* Right: Memory content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <MemoryBrowser
            agentId={selectedAgentId ?? ''}
            date={selectedDate}
            content={memoryContent}
            loading={contentLoading}
          />
        </div>
      </div>
    </div>
  );
}
