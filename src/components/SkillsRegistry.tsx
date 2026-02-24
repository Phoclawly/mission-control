'use client';

import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import type { Capability, Agent } from '@/lib/types';

interface SkillWithAgents extends Capability {
  agents: Pick<Agent, 'id' | 'name' | 'avatar_emoji'>[];
}

function StatusBadge({ status }: { status: Capability['status'] }) {
  const map: Record<Capability['status'], { label: string; classes: string }> = {
    healthy: {
      label: 'Active',
      classes: 'bg-mc-accent-green/20 text-mc-accent-green border-mc-accent-green/30',
    },
    degraded: {
      label: 'Degraded',
      classes: 'bg-mc-accent-yellow/20 text-mc-accent-yellow border-mc-accent-yellow/30',
    },
    broken: {
      label: 'Error',
      classes: 'bg-mc-accent-red/20 text-mc-accent-red border-mc-accent-red/30',
    },
    disabled: {
      label: 'Inactive',
      classes: 'bg-mc-bg-tertiary text-mc-text-secondary border-mc-border',
    },
    unknown: {
      label: 'Unknown',
      classes: 'bg-mc-bg-tertiary text-mc-text-secondary border-mc-border',
    },
  };
  const badge = map[status] ?? map.unknown;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${badge.classes}`}>
      {badge.label}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-4 w-32 bg-mc-bg-tertiary rounded" />
        <div className="h-5 w-16 bg-mc-bg-tertiary rounded-full" />
      </div>
      <div className="h-3 w-48 bg-mc-bg-tertiary rounded mb-2" />
      <div className="h-3 w-24 bg-mc-bg-tertiary rounded mb-3" />
      <div className="flex gap-2">
        <div className="h-6 w-20 bg-mc-bg-tertiary rounded-full" />
        <div className="h-6 w-20 bg-mc-bg-tertiary rounded-full" />
      </div>
    </div>
  );
}

function SkillCard({ skill }: { skill: SkillWithAgents }) {
  const [contentVisible, setContentVisible] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  const handleViewMd = async () => {
    // Collapse if already showing
    if (contentVisible) {
      setContentVisible(false);
      return;
    }

    // If already fetched, just show it
    if (content !== null) {
      setContentVisible(true);
      return;
    }

    setContentLoading(true);
    setContentError(null);

    try {
      const res = await fetch(`/api/capabilities/${skill.id}/content`);
      if (!res.ok) {
        if (res.status === 404) {
          setContentError('File not found');
        } else {
          setContentError(`Failed to load content (${res.status})`);
        }
        setContentVisible(true);
        return;
      }
      const text = await res.text();
      setContent(text);
      setContentVisible(true);
    } catch {
      setContentError('Failed to load content');
      setContentVisible(true);
    } finally {
      setContentLoading(false);
    }
  };

  return (
    <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
      {/* Name + status */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-mc-text">{skill.name}</span>
        <StatusBadge status={skill.status} />
      </div>

      {/* Skill path */}
      {skill.skill_path && (
        <p className="text-xs text-mc-text-muted font-mono mb-1 truncate" title={skill.skill_path}>
          {skill.skill_path}
        </p>
      )}

      {/* Provider */}
      {skill.provider && (
        <p className="text-xs text-mc-text-secondary mb-3">{skill.provider}</p>
      )}

      {/* Agent chips */}
      {skill.agents.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {skill.agents.map((agent) => (
            <span
              key={agent.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-mc-bg-tertiary border border-mc-border rounded-full text-xs text-mc-text-secondary"
            >
              <span>{agent.avatar_emoji}</span>
              <span>{agent.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* View .md button */}
      <button
        type="button"
        onClick={handleViewMd}
        disabled={contentLoading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text border border-mc-border rounded hover:bg-mc-bg transition-colors disabled:opacity-50"
      >
        <FileText className="w-3.5 h-3.5" />
        {contentLoading ? 'Loading...' : contentVisible ? 'Collapse' : 'View .md'}
      </button>

      {/* Inline content */}
      {contentVisible && (
        <div className="mt-3">
          {contentError ? (
            <p className="text-xs text-mc-accent-red">{contentError}</p>
          ) : (
            <pre className="overflow-x-auto rounded bg-mc-bg border border-mc-border p-3 text-xs">
              <code className="text-mc-text-secondary whitespace-pre-wrap">{content}</code>
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function SkillsRegistry() {
  const [skills, setSkills] = useState<SkillWithAgents[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const res = await fetch('/api/capabilities/skills-registry');
        if (!res.ok) {
          throw new Error(`Failed to load skills registry (${res.status})`);
        }
        const data: SkillWithAgents[] = await res.json();
        setSkills(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load skills');
      } finally {
        setLoading(false);
      }
    };

    fetchSkills();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-3 bg-mc-accent-red/10 border border-mc-accent-red/30 rounded text-sm text-mc-accent-red">
        {error}
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="w-10 h-10 mx-auto mb-3 text-mc-text-secondary opacity-50" />
        <p className="text-mc-text-secondary">No skills registered yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {skills.map((skill) => (
        <SkillCard key={skill.id} skill={skill} />
      ))}
    </div>
  );
}
