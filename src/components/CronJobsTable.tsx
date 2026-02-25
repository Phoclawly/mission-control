'use client';

import { useState, useEffect } from 'react';
import { Clock, ChevronDown, ChevronRight, Power, PowerOff, AlertTriangle, Plus, Pencil, BarChart3, CalendarDays } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { CronJob, CronJobStatus, Agent } from '@/lib/types';
import { CronModal } from '@/components/modals/CronModal';

function getStatusBadge(status: CronJobStatus) {
  const map: Record<CronJobStatus, { label: string; classes: string }> = {
    active: {
      label: 'Active',
      classes: 'bg-mc-accent-green/20 text-mc-accent-green border-mc-accent-green/30',
    },
    disabled: {
      label: 'Disabled',
      classes: 'bg-mc-bg-tertiary text-mc-text-secondary border-mc-border',
    },
    stale: {
      label: 'Stale',
      classes: 'bg-mc-accent-yellow/20 text-mc-accent-yellow border-mc-accent-yellow/30',
    },
  };
  const badge = map[status] ?? map.disabled;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${badge.classes}`}>
      {badge.label}
    </span>
  );
}

interface CronJobsTableProps {
  agents?: Agent[];
}

export function CronJobsTable({ agents = [] }: CronJobsTableProps) {
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'per-agent' | 'overview' | 'calendar'>('per-agent');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [disablingAll, setDisablingAll] = useState(false);
  const [cronModalOpen, setCronModalOpen] = useState(false);
  const [editingCron, setEditingCron] = useState<CronJob | undefined>(undefined);

  const fetchCronJobs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/crons');
      if (res.ok) {
        const data = await res.json();
        setCronJobs(data);
        // Auto-expand all groups
        const groups = new Set<string>();
        data.forEach((cron: CronJob) => {
          groups.add(cron.agent_name ?? 'Unassigned');
        });
        setExpandedGroups(groups);
      }
    } catch (error) {
      console.error('Failed to fetch cron jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCronJobs();
  }, []);

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  const toggleCron = async (cronId: string, currentStatus: CronJobStatus) => {
    const newStatus: CronJobStatus = currentStatus === 'active' ? 'disabled' : 'active';
    setTogglingIds((prev) => new Set(prev).add(cronId));
    try {
      const res = await fetch(`/api/crons/${cronId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCronJobs((prev) => prev.map((c) => (c.id === cronId ? updated : c)));
      }
    } catch (error) {
      console.error('Failed to toggle cron:', error);
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(cronId);
        return next;
      });
    }
  };

  const disableAllCrons = async () => {
    if (!confirm('Are you sure you want to disable all cron jobs? This will stop all scheduled tasks.')) {
      return;
    }
    setDisablingAll(true);
    try {
      const res = await fetch('/api/crons/disable-all', { method: 'POST' });
      if (res.ok) {
        await fetchCronJobs();
      }
    } catch (error) {
      console.error('Failed to disable all crons:', error);
    } finally {
      setDisablingAll(false);
    }
  };

  const handleOpenNewCron = () => {
    setEditingCron(undefined);
    setCronModalOpen(true);
  };

  const handleOpenEditCron = (cron: CronJob) => {
    setEditingCron(cron);
    setCronModalOpen(true);
  };

  const handleCronSaved = (saved: CronJob) => {
    setCronModalOpen(false);
    setCronJobs((prev) => {
      const exists = prev.find((c) => c.id === saved.id);
      if (exists) {
        return prev.map((c) => (c.id === saved.id ? saved : c));
      }
      return [...prev, saved];
    });
    setEditingCron(undefined);
  };

  // Group crons by agent
  const grouped: Record<string, CronJob[]> = {};
  cronJobs.forEach((cron) => {
    const key = cron.agent_name ?? 'Unassigned';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(cron);
  });

  const groupKeys = Object.keys(grouped).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  const getCronDays = (schedule: string): number[] => {
    // Parse cron schedule to get days of week (0=Sun, 1=Mon, ..., 6=Sat)
    const parts = schedule.trim().split(/\s+/);
    if (parts.length < 5) return [0, 1, 2, 3, 4, 5, 6]; // default to every day

    const dayOfWeek = parts[4]; // 5th field is day of week
    if (dayOfWeek === '*') return [0, 1, 2, 3, 4, 5, 6];

    const days: number[] = [];
    dayOfWeek.split(',').forEach(part => {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        for (let i = start; i <= end; i++) days.push(i);
      } else if (part.includes('/')) {
        const [, step] = part.split('/');
        const stepNum = parseInt(step, 10);
        for (let i = 0; i < 7; i += stepNum) days.push(i);
      } else {
        // Handle named days
        const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
        const num = dayMap[part.toLowerCase()] ?? parseInt(part, 10);
        if (!isNaN(num)) days.push(num);
      }
    });
    return days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6];
  };

  const getCronTime = (schedule: string): string => {
    const parts = schedule.trim().split(/\s+/);
    if (parts.length < 2) return schedule;
    const minute = parts[0] === '*' ? '**' : parts[0].padStart(2, '0');
    const hour = parts[1] === '*' ? '**' : parts[1].padStart(2, '0');
    return `${hour}:${minute}`;
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-2xl animate-pulse mb-2">&#9201;</div>
        <p className="text-sm text-mc-text-secondary">Loading cron jobs...</p>
      </div>
    );
  }

  if (cronJobs.length === 0 && !cronModalOpen) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <button
            onClick={handleOpenNewCron}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-mc-accent text-mc-bg rounded hover:bg-mc-accent/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Cron
          </button>
        </div>
        <div className="text-center py-12">
          <Clock className="w-10 h-10 mx-auto mb-3 text-mc-text-secondary opacity-50" />
          <p className="text-mc-text-secondary">No cron jobs configured.</p>
        </div>
        {cronModalOpen && (
          <CronModal
            cron={editingCron}
            agents={agents}
            onClose={() => { setCronModalOpen(false); setEditingCron(undefined); }}
            onSaved={handleCronSaved}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* View Toggle */}
      <div className="flex rounded border border-mc-border overflow-hidden">
        <button
          onClick={() => setView('per-agent')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            view === 'per-agent'
              ? 'bg-mc-accent text-mc-bg'
              : 'bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text'
          }`}
        >
          Per Agent
        </button>
        <button
          onClick={() => setView('overview')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            view === 'overview'
              ? 'bg-mc-accent text-mc-bg'
              : 'bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setView('calendar')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            view === 'calendar'
              ? 'bg-mc-accent text-mc-bg'
              : 'bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text'
          }`}
        >
          Calendar
        </button>
      </div>

      {/* Top controls */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-mc-text-secondary">
          {cronJobs.length} cron job{cronJobs.length !== 1 ? 's' : ''} across {groupKeys.length} agent{groupKeys.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenNewCron}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-mc-accent text-mc-bg rounded hover:bg-mc-accent/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Cron
          </button>
          <button
            onClick={disableAllCrons}
            disabled={disablingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-mc-accent-red/10 text-mc-accent-red border border-mc-accent-red/30 rounded hover:bg-mc-accent-red/20 transition-colors disabled:opacity-50"
          >
            <PowerOff className="w-3.5 h-3.5" />
            {disablingAll ? 'Disabling...' : 'Disable All Crons'}
          </button>
        </div>
      </div>

      {/* Per Agent view */}
      {view === 'per-agent' && (
        <>
          {groupKeys.map((groupName) => {
            const crons = grouped[groupName];
            const isExpanded = expandedGroups.has(groupName);
            const activeCount = crons.filter((c) => c.status === 'active').length;

            return (
              <div key={groupName} className="border border-mc-border rounded-lg overflow-hidden">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(groupName)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-mc-bg-secondary hover:bg-mc-bg-tertiary transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-mc-text-secondary" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-mc-text-secondary" />
                    )}
                    <span className="font-medium text-mc-text">{groupName}</span>
                    <span className="text-xs text-mc-text-secondary">
                      ({crons.length} cron{crons.length !== 1 ? 's' : ''})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeCount > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-mc-accent-green/20 text-mc-accent-green">
                        {activeCount} active
                      </span>
                    )}
                  </div>
                </button>

                {/* Cron items */}
                {isExpanded && (
                  <div className="divide-y divide-mc-border/50">
                    {crons.map((cron) => (
                      <div
                        key={cron.id}
                        className="flex items-center justify-between px-4 py-3 hover:bg-mc-bg-tertiary/30 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-mc-text">{cron.name}</span>
                            {getStatusBadge(cron.status)}
                            {cron.error_count > 0 && (
                              <span className="flex items-center gap-1 text-xs text-mc-accent-red">
                                <AlertTriangle className="w-3 h-3" />
                                {cron.error_count} errors
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-mc-text-secondary">
                            <span className="font-mono">{cron.schedule}</span>
                            {cron.description && (
                              <span className="truncate max-w-xs">{cron.description}</span>
                            )}
                            {cron.last_run && (
                              <span>
                                Last run {formatDistanceToNow(new Date(cron.last_run), { addSuffix: true })}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          {/* Edit button */}
                          <button
                            onClick={() => handleOpenEditCron(cron)}
                            className="p-2 rounded text-mc-text-secondary hover:bg-mc-bg-tertiary hover:text-mc-text transition-colors"
                            title="Edit cron"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {/* Toggle button */}
                          <button
                            onClick={() => toggleCron(cron.id, cron.status)}
                            disabled={togglingIds.has(cron.id)}
                            className={`p-2 rounded transition-colors disabled:opacity-50 ${
                              cron.status === 'active'
                                ? 'text-mc-accent-green hover:bg-mc-accent-green/10'
                                : 'text-mc-text-secondary hover:bg-mc-bg-tertiary'
                            }`}
                            title={cron.status === 'active' ? 'Disable' : 'Enable'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* Overview view */}
      {view === 'overview' && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-mc-text">{cronJobs.length}</div>
              <div className="text-xs text-mc-text-secondary uppercase mt-1">Total Crons</div>
            </div>
            <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-mc-accent-green">{cronJobs.filter(c => c.status === 'active').length}</div>
              <div className="text-xs text-mc-text-secondary uppercase mt-1">Active</div>
            </div>
            <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-mc-text-secondary">{cronJobs.filter(c => c.status === 'disabled').length}</div>
              <div className="text-xs text-mc-text-secondary uppercase mt-1">Disabled</div>
            </div>
            <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-mc-accent-yellow">{cronJobs.filter(c => c.status === 'stale').length}</div>
              <div className="text-xs text-mc-text-secondary uppercase mt-1">Stale</div>
            </div>
          </div>

          {/* Recent runs */}
          <div>
            <h3 className="text-sm font-medium text-mc-text mb-3 uppercase tracking-wider">Recent Runs</h3>
            <div className="space-y-2">
              {cronJobs
                .filter(c => c.last_run)
                .sort((a, b) => new Date(b.last_run!).getTime() - new Date(a.last_run!).getTime())
                .slice(0, 10)
                .map(cron => (
                  <div key={cron.id} className="flex items-center justify-between px-4 py-2 bg-mc-bg-secondary border border-mc-border rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-mc-text">{cron.name}</span>
                      {getStatusBadge(cron.status)}
                      {cron.agent_name && (
                        <span className="text-xs text-mc-text-secondary">{cron.agent_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-mc-text-secondary">
                      {cron.last_duration_ms != null && (
                        <span>{cron.last_duration_ms}ms</span>
                      )}
                      <span>{formatDistanceToNow(new Date(cron.last_run!), { addSuffix: true })}</span>
                    </div>
                  </div>
                ))}
              {cronJobs.filter(c => c.last_run).length === 0 && (
                <p className="text-sm text-mc-text-secondary text-center py-4">No runs recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Calendar view */}
      {view === 'calendar' && (
        <div className="grid grid-cols-7 gap-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => {
            // Convert display index (Mon=0) to cron day (Mon=1)
            const cronDay = idx === 6 ? 0 : idx + 1;
            const dayCrons = cronJobs.filter(c => getCronDays(c.schedule).includes(cronDay));

            return (
              <div key={day} className="bg-mc-bg-secondary border border-mc-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-mc-bg-tertiary border-b border-mc-border">
                  <span className="text-xs font-medium uppercase tracking-wider text-mc-text-secondary">{day}</span>
                  <span className="text-xs text-mc-text-secondary ml-2">({dayCrons.length})</span>
                </div>
                <div className="p-2 space-y-1 min-h-[100px] max-h-[400px] overflow-y-auto">
                  {dayCrons.length === 0 ? (
                    <p className="text-xs text-mc-text-secondary text-center py-4 opacity-50">&mdash;</p>
                  ) : (
                    dayCrons
                      .sort((a, b) => getCronTime(a.schedule).localeCompare(getCronTime(b.schedule)))
                      .map(cron => (
                        <div
                          key={cron.id}
                          className={`px-2 py-1.5 rounded text-xs ${
                            cron.status === 'active'
                              ? 'bg-mc-accent-green/10 border border-mc-accent-green/20'
                              : cron.status === 'stale'
                              ? 'bg-mc-accent-yellow/10 border border-mc-accent-yellow/20'
                              : 'bg-mc-bg-tertiary border border-mc-border opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-mc-accent">{getCronTime(cron.schedule)}</span>
                            <span className="font-medium text-mc-text truncate">{cron.name}</span>
                          </div>
                          {cron.agent_name && (
                            <div className="text-mc-text-secondary mt-0.5 truncate">{cron.agent_name}</div>
                          )}
                        </div>
                      ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cron Modal */}
      {cronModalOpen && (
        <CronModal
          cron={editingCron}
          agents={agents}
          onClose={() => { setCronModalOpen(false); setEditingCron(undefined); }}
          onSaved={handleCronSaved}
        />
      )}
    </div>
  );
}
