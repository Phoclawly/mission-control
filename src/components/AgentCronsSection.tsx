'use client';

import { Clock, Plus, Pencil } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Agent, CronJob } from '@/lib/types';
import { CronModal } from '@/components/modals/CronModal';

const cronStatusClasses: Record<string, string> = {
  active: 'bg-mc-accent-green/20 text-mc-accent-green border-mc-accent-green/30',
  disabled: 'bg-mc-bg-tertiary text-mc-text-secondary border-mc-border',
  stale: 'bg-mc-accent-yellow/20 text-mc-accent-yellow border-mc-accent-yellow/30',
};

interface AgentCronsSectionProps {
  agentCrons: CronJob[];
  cronsLoading: boolean;
  agentId: string;
  agents: Agent[];
  editingCron: CronJob | undefined;
  setEditingCron: (cron: CronJob | undefined) => void;
  cronModalOpen: boolean;
  setCronModalOpen: (open: boolean) => void;
  handleCronSaved: (saved: CronJob) => void;
}

export function AgentCronsSection({
  agentCrons,
  cronsLoading,
  agentId,
  agents,
  editingCron,
  setEditingCron,
  cronModalOpen,
  setCronModalOpen,
  handleCronSaved,
}: AgentCronsSectionProps) {
  if (cronsLoading) {
    return (
      <div className="text-center py-8">
        <Clock className="w-6 h-6 mx-auto mb-2 text-mc-text-secondary animate-pulse" />
        <p className="text-sm text-mc-text-secondary">Loading cron jobs...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Add Cron button */}
      <div className="flex justify-end">
        <button
          onClick={() => { setEditingCron(undefined); setCronModalOpen(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-mc-accent text-mc-bg rounded hover:bg-mc-accent/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Cron
        </button>
      </div>

      {agentCrons.length === 0 ? (
        <div className="text-center py-8">
          <Clock className="w-8 h-8 mx-auto mb-2 text-mc-text-secondary opacity-50" />
          <p className="text-mc-text-secondary">No cron jobs assigned</p>
        </div>
      ) : (
        <div className="space-y-2">
          {agentCrons.map((cron) => (
            <div key={cron.id} className="p-3 bg-mc-bg rounded border border-mc-border/50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-mc-text">{cron.name}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditingCron(cron); setCronModalOpen(true); }}
                    className="p-1 rounded text-mc-text-secondary hover:bg-mc-bg-tertiary hover:text-mc-text transition-colors"
                    title="Edit cron"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${cronStatusClasses[cron.status] ?? cronStatusClasses.disabled}`}>
                    {cron.status}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-mc-text-secondary">
                <span className="font-mono">{cron.schedule}</span>
                {cron.last_run && (
                  <span>Last: {formatDistanceToNow(new Date(cron.last_run), { addSuffix: true })}</span>
                )}
              </div>
              {cron.description && (
                <p className="text-xs text-mc-text-secondary mt-1">{cron.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Cron Modal */}
      {cronModalOpen && (
        <CronModal
          cron={editingCron}
          agentId={agentId}
          agents={agents}
          onClose={() => { setCronModalOpen(false); setEditingCron(undefined); }}
          onSaved={handleCronSaved}
        />
      )}
    </div>
  );
}
