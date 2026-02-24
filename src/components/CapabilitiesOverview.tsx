'use client';

import { CheckCircle, XCircle, Plug, Wrench, BookOpen } from 'lucide-react';
import type { CapabilitiesOverview as CapabilitiesOverviewType } from '@/lib/types';

interface CapabilitiesOverviewProps {
  overview: CapabilitiesOverviewType;
}

export function CapabilitiesOverview({ overview }: CapabilitiesOverviewProps) {
  const healthyCount = (overview.capabilities.byStatus?.healthy ?? 0) + (overview.integrations.byStatus?.connected ?? 0);
  const brokenCount = (overview.capabilities.byStatus?.broken ?? 0) + (overview.capabilities.byStatus?.degraded ?? 0) + (overview.integrations.byStatus?.broken ?? 0);
  const integrationsCount = overview.integrations.total;

  // Tools: cli_tool + browser_automation
  const toolsCount = (overview.capabilities.byCategory?.cli_tool ?? 0) + (overview.capabilities.byCategory?.browser_automation ?? 0);

  // Skills: skill category
  const skillsCount = overview.capabilities.byCategory?.skill ?? 0;

  const cards = [
    {
      label: 'Tools',
      value: toolsCount,
      icon: Wrench,
      colorClass: 'text-mc-accent-cyan',
      bgClass: 'bg-mc-accent-cyan/10',
      borderClass: 'border-mc-accent-cyan/30',
    },
    {
      label: 'Skills',
      value: skillsCount,
      icon: BookOpen,
      colorClass: 'text-mc-accent-purple',
      bgClass: 'bg-mc-accent-purple/10',
      borderClass: 'border-mc-accent-purple/30',
    },
    {
      label: 'Healthy',
      value: healthyCount,
      icon: CheckCircle,
      colorClass: 'text-mc-accent-green',
      bgClass: 'bg-mc-accent-green/10',
      borderClass: 'border-mc-accent-green/30',
    },
    {
      label: 'Broken / Degraded',
      value: brokenCount,
      icon: XCircle,
      colorClass: 'text-mc-accent-red',
      bgClass: 'bg-mc-accent-red/10',
      borderClass: 'border-mc-accent-red/30',
    },
    {
      label: 'Integrations',
      value: integrationsCount,
      icon: Plug,
      colorClass: 'text-mc-accent-yellow',
      bgClass: 'bg-mc-accent-yellow/10',
      borderClass: 'border-mc-accent-yellow/30',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`${card.bgClass} border ${card.borderClass} rounded-lg p-4`}
        >
          <div className="flex items-center gap-3 mb-2">
            <card.icon className={`w-5 h-5 ${card.colorClass}`} />
            <span className="text-xs text-mc-text-secondary uppercase tracking-wider">
              {card.label}
            </span>
          </div>
          <div className={`text-3xl font-bold ${card.colorClass}`}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
