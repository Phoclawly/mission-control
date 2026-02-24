'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Zap, Settings, ChevronLeft, LayoutGrid, Users, Shield, BookOpen, RefreshCw, Download, CheckCircle, XCircle } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import { format } from 'date-fns';
import type { Workspace } from '@/lib/types';

interface HeaderProps {
  workspace?: Workspace;
}

export function Header({ workspace }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { agents, tasks, isOnline } = useMissionControl();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeSubAgents, setActiveSubAgents] = useState(0);

  // Version & update state
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [versionChecking, setVersionChecking] = useState(false);
  const [updateState, setUpdateState] = useState<'idle' | 'queued' | 'success' | 'failed'>('idle');
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [escalationFile, setEscalationFile] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load active sub-agent count
  useEffect(() => {
    const loadSubAgentCount = async () => {
      try {
        const res = await fetch('/api/openclaw/sessions?session_type=subagent&status=active');
        if (res.ok) {
          const sessions = await res.json();
          setActiveSubAgents(sessions.length);
        }
      } catch (error) {
        console.error('Failed to load sub-agent count:', error);
      }
    };

    loadSubAgentCount();

    // Poll every 30 seconds (reduced from 10s to reduce load)
    const interval = setInterval(loadSubAgentCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Load current version on mount
  useEffect(() => {
    fetch('/api/openclaw/version')
      .then((res) => res.json())
      .then((data) => {
        if (data.current && data.current !== 'unknown') {
          setCurrentVersion(data.current);
        }
      })
      .catch(() => {});
  }, []);

  const checkForUpdates = async () => {
    setVersionChecking(true);
    try {
      const res = await fetch('/api/openclaw/version?check=true');
      const data = await res.json();
      if (data.current && data.current !== 'unknown') setCurrentVersion(data.current);
      if (data.latest) setLatestVersion(data.latest);
      setUpdateAvailable(!!data.updateAvailable);
    } catch {
      // silently fail
    } finally {
      setVersionChecking(false);
    }
  };

  const triggerUpdate = async () => {
    if (!latestVersion) return;
    setUpdateState('queued');
    setUpdateError(null);
    try {
      const res = await fetch('/api/openclaw/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: latestVersion }),
      });
      const data = await res.json();
      if (data.escalation) setEscalationFile(data.escalation);
    } catch {
      setUpdateState('failed');
      setUpdateError('Failed to create update request');
    }
  };

  // Poll escalation result when update is queued
  useEffect(() => {
    if (updateState !== 'queued' || !escalationFile) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/openclaw/update/status?file=${encodeURIComponent(escalationFile)}`);
        const data = await res.json();
        if (!data.pending) {
          if (data.success) {
            setUpdateState('success');
            // Auto-dismiss after 30s
            setTimeout(() => {
              setUpdateState('idle');
              setUpdateAvailable(false);
              setEscalationFile(null);
            }, 30000);
          } else {
            setUpdateState('failed');
            setUpdateError(data.error || 'Update failed');
          }
        }
      } catch {
        // keep polling
      }
    };

    const interval = setInterval(poll, 15000);
    poll(); // check immediately
    // Stop polling after 10 minutes
    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (updateState === 'queued') {
        setUpdateState('failed');
        setUpdateError('Timed out waiting for host watcher');
      }
    }, 600000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [updateState, escalationFile]);

  const workingAgents = agents.filter((a) => a.status === 'working').length;
  const activeAgents = workingAgents + activeSubAgents;
  const tasksInQueue = tasks.filter((t) => t.status !== 'done' && t.status !== 'review').length;

  return (
    <header className="h-14 bg-mc-bg-secondary border-b border-mc-border flex items-center justify-between px-4">
      {/* Left: Logo & Title */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-mc-accent-cyan" />
          <span className="font-semibold text-mc-text uppercase tracking-wider text-sm">
            Mission Control
          </span>
        </div>

        {/* Workspace indicator or back to dashboard */}
        {workspace ? (
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex items-center gap-1 text-mc-text-secondary hover:text-mc-accent transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <LayoutGrid className="w-4 h-4" />
            </Link>
            <span className="text-mc-text-secondary">/</span>
            <div className="flex items-center gap-2 px-3 py-1 bg-mc-bg-tertiary rounded">
              <span className="text-lg">{workspace.icon}</span>
              <span className="font-medium">{workspace.name}</span>
            </div>
            <Link
              href={`/workspace/${workspace.slug}/agents`}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-sm transition-colors ${
                pathname?.includes('/agents')
                  ? 'bg-mc-accent/20 text-mc-accent'
                  : 'text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary'
              }`}
            >
              <Users className="w-4 h-4" />
              Agents
            </Link>
            <Link
              href={`/workspace/${workspace.slug}/capabilities`}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-sm transition-colors ${
                pathname?.includes('/capabilities')
                  ? 'bg-mc-accent/20 text-mc-accent'
                  : 'text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary'
              }`}
            >
              <Shield className="w-4 h-4" />
              Capabilities
            </Link>
            <Link
              href={`/workspace/${workspace.slug}/memory`}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-sm transition-colors ${
                pathname?.includes('/memory')
                  ? 'bg-mc-accent/20 text-mc-accent'
                  : 'text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Memory
            </Link>
          </div>
        ) : (
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-1 bg-mc-bg-tertiary rounded hover:bg-mc-bg transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="text-sm">All Workspaces</span>
          </Link>
        )}
      </div>

      {/* Center: Stats - only show in workspace view */}
      {workspace && (
        <div className="flex items-center gap-8">
          <div className="text-center">
            <div className="text-2xl font-bold text-mc-accent-cyan">{activeAgents}</div>
            <div className="text-xs text-mc-text-secondary uppercase">Agents Active</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-mc-accent-purple">{tasksInQueue}</div>
            <div className="text-xs text-mc-text-secondary uppercase">Tasks in Queue</div>
          </div>
        </div>
      )}

      {/* Right: Time & Status */}
      <div className="flex items-center gap-4">
        <span className="text-mc-text-secondary text-sm font-mono">
          {format(currentTime, 'HH:mm:ss')}
        </span>
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded border text-sm font-medium ${
            isOnline
              ? 'bg-mc-accent-green/20 border-mc-accent-green text-mc-accent-green'
              : 'bg-mc-accent-red/20 border-mc-accent-red text-mc-accent-red'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isOnline ? 'bg-mc-accent-green animate-pulse' : 'bg-mc-accent-red'
            }`}
          />
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </div>

        {/* Version & Update */}
        {currentVersion && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono text-mc-text-secondary">
              v{currentVersion}
            </span>
            {updateState === 'success' ? (
              <span className="flex items-center gap-1 text-xs font-medium text-mc-accent-green">
                <CheckCircle className="w-3.5 h-3.5" />
                Updated
              </span>
            ) : updateState === 'failed' ? (
              <button
                onClick={() => { setUpdateState('idle'); setUpdateError(null); }}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-mc-accent-red/20 border border-mc-accent-red text-mc-accent-red hover:bg-mc-accent-red/30 transition-colors"
                title={updateError || 'Update failed — click to dismiss'}
              >
                <XCircle className="w-3.5 h-3.5" />
                Failed
              </button>
            ) : updateState === 'queued' ? (
              <span className="flex items-center gap-1 text-xs text-mc-accent-cyan animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Updating...
              </span>
            ) : updateAvailable && latestVersion ? (
              <button
                onClick={triggerUpdate}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-mc-accent-cyan/20 border border-mc-accent-cyan text-mc-accent-cyan hover:bg-mc-accent-cyan/30 transition-colors"
                title={`Update to v${latestVersion}`}
              >
                <Download className="w-3 h-3" />
                v{latestVersion}
              </button>
            ) : (
              <button
                onClick={checkForUpdates}
                disabled={versionChecking}
                className="p-1 rounded text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary transition-colors disabled:opacity-50"
                title="Check for updates"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${versionChecking ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        )}

        <button
          onClick={() => router.push('/settings')}
          className="p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
          title="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
