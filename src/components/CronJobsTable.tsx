'use client';

import { useState, useEffect } from 'react';
import { Clock, ChevronDown, ChevronRight, Power, PowerOff, AlertTriangle, Plus, Pencil } from 'lucide-react';
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

      {/* Grouped crons */}
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
