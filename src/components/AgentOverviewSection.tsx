'use client';

import { Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Agent, TaskActivity, OpenClawSession } from '@/lib/types';

interface AgentOverviewSectionProps {
  agent: Agent;
  stats: { tasksAssigned: number; tasksCompleted: number; totalTasks: number };
  activeSession: OpenClawSession | null;
  recentActivity: TaskActivity[];
}

export function getStatusBadgeClasses(status: string): string {
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

export function AgentOverviewSection({ agent, stats, activeSession, recentActivity }: AgentOverviewSectionProps) {
  return (
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
}
