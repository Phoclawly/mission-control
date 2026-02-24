'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface AlertsBannerProps {
  alerts: { type: string; target: string; message: string }[];
}

export function AlertsBanner({ alerts }: AlertsBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || alerts.length === 0) return null;

  return (
    <div className="bg-mc-accent-yellow/10 border border-mc-accent-yellow/30 rounded-lg p-4 relative">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 p-1 hover:bg-mc-accent-yellow/20 rounded text-mc-accent-yellow"
        title="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-mc-accent-yellow flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-mc-accent-yellow mb-2">
            {alerts.length} Alert{alerts.length !== 1 ? 's' : ''} Require Attention
          </h3>
          <ul className="space-y-1">
            {alerts.map((alert, idx) => (
              <li key={idx} className="text-sm text-mc-text-secondary flex items-start gap-2">
                <span className="text-mc-accent-yellow mt-1">&#8226;</span>
                <span>
                  <span className="text-mc-text font-medium">{alert.target}</span>
                  {' '}&mdash; {alert.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
