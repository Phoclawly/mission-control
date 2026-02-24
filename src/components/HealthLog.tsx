'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, MinusCircle, RefreshCw, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { HealthCheck, HealthCheckStatus } from '@/lib/types';

function getStatusIcon(status: HealthCheckStatus) {
  switch (status) {
    case 'pass':
      return <CheckCircle className="w-4 h-4 text-mc-accent-green" />;
    case 'fail':
      return <XCircle className="w-4 h-4 text-mc-accent-red" />;
    case 'warn':
      return <AlertTriangle className="w-4 h-4 text-mc-accent-yellow" />;
    case 'skip':
      return <MinusCircle className="w-4 h-4 text-mc-text-secondary" />;
    default:
      return <MinusCircle className="w-4 h-4 text-mc-text-secondary" />;
  }
}

function getStatusColor(status: HealthCheckStatus) {
  switch (status) {
    case 'pass':
      return 'border-mc-accent-green/30';
    case 'fail':
      return 'border-mc-accent-red/30';
    case 'warn':
      return 'border-mc-accent-yellow/30';
    default:
      return 'border-transparent';
  }
}

export function HealthLog() {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/health/history?limit=50');
      if (res.ok) {
        const data = await res.json();
        setChecks(data);
      }
    } catch (error) {
      console.error('Failed to fetch health history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchHistory, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-2xl animate-pulse mb-2">&#128154;</div>
        <p className="text-sm text-mc-text-secondary">Loading health log...</p>
      </div>
    );
  }

  if (checks.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle className="w-10 h-10 mx-auto mb-3 text-mc-text-secondary opacity-50" />
        <p className="text-mc-text-secondary">No health checks recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-mc-text-secondary">
          Showing latest {checks.length} check{checks.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => {
            setLoading(true);
            fetchHistory();
          }}
          className="flex items-center gap-1.5 px-3 py-1 text-sm text-mc-text-secondary hover:text-mc-text bg-mc-bg-tertiary rounded hover:bg-mc-bg transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Log entries */}
      <div className="space-y-1">
        {checks.map((check) => (
          <div
            key={check.id}
            className={`flex items-start gap-3 p-3 rounded border-l-2 hover:bg-mc-bg-tertiary/50 transition-colors ${getStatusColor(check.status)}`}
          >
            <div className="mt-0.5 flex-shrink-0">
              {getStatusIcon(check.status)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium text-mc-text">
                  {check.target_name ?? check.target_id}
                </span>
                <span className="text-xs px-1.5 py-0 rounded bg-mc-bg-tertiary text-mc-text-secondary">
                  {check.target_type}
                </span>
              </div>
              {check.message && (
                <p className="text-xs text-mc-text-secondary line-clamp-2">
                  {check.message}
                </p>
              )}
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1 text-xs text-mc-text-secondary">
                  <Clock className="w-3 h-3" />
                  {formatDistanceToNow(new Date(check.checked_at), { addSuffix: true })}
                </div>
                {check.duration_ms != null && (
                  <span className="text-xs text-mc-text-secondary">
                    {check.duration_ms}ms
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
