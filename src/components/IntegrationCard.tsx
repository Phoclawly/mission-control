'use client';

import { useState } from 'react';
import { Plug, ExternalLink, RefreshCw, Pencil } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Integration, IntegrationStatus } from '@/lib/types';
import { IntegrationModal } from '@/components/modals/IntegrationModal';

interface IntegrationCardProps {
  integration: Integration;
  onTestConnection: (id: string) => void;
  onUpdate?: (updated: Integration) => void;
}

function getStatusIndicator(status: IntegrationStatus) {
  const map: Record<IntegrationStatus, { label: string; dotClass: string; textClass: string }> = {
    connected: {
      label: 'Connected',
      dotClass: 'bg-mc-accent-green',
      textClass: 'text-mc-accent-green',
    },
    expired: {
      label: 'Expired',
      dotClass: 'bg-mc-accent-yellow',
      textClass: 'text-mc-accent-yellow',
    },
    broken: {
      label: 'Broken',
      dotClass: 'bg-mc-accent-red',
      textClass: 'text-mc-accent-red',
    },
    unconfigured: {
      label: 'Unconfigured',
      dotClass: 'bg-mc-text-secondary',
      textClass: 'text-mc-text-secondary',
    },
    unknown: {
      label: 'Unknown',
      dotClass: 'bg-mc-text-secondary',
      textClass: 'text-mc-text-secondary',
    },
  };
  return map[status] ?? map.unknown;
}

const typeLabels: Record<string, string> = {
  mcp_plugin: 'MCP Plugin',
  oauth_token: 'OAuth Token',
  api_key: 'API Key',
  cli_auth: 'CLI Auth',
  browser_profile: 'Browser Profile',
  cron_job: 'Cron Job',
  webhook: 'Webhook',
  credential_provider: 'Credential Provider',
};

export function IntegrationCard({ integration, onTestConnection, onUpdate }: IntegrationCardProps) {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const statusInfo = getStatusIndicator(integration.status);

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/integrations/${integration.id}/test`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setTestResult('Connection successful');
        onTestConnection(integration.id);
        if (onUpdate) onUpdate(updated);
      } else {
        const errorData = await res.json().catch(() => ({}));
        setTestResult(errorData.message ?? 'Connection failed');
      }
    } catch (error) {
      setTestResult('Connection failed');
      console.error('Failed to test connection:', error);
    } finally {
      setIsTestingConnection(false);
    }
  };

  return (
    <>
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 hover:border-mc-accent/50 transition-colors">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-mc-accent-purple/10 rounded-lg">
              <Plug className="w-4 h-4 text-mc-accent-purple" />
            </div>
            <div>
              <h3 className="font-medium text-mc-text">{integration.name}</h3>
              <span className="text-xs px-2 py-0.5 rounded bg-mc-bg-tertiary text-mc-text-secondary">
                {typeLabels[integration.type] ?? integration.type}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Status indicator */}
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${statusInfo.dotClass}`} />
              <span className={`text-xs font-medium ${statusInfo.textClass}`}>
                {statusInfo.label}
              </span>
            </div>

            {/* Edit button */}
            <button
              onClick={() => setEditModalOpen(true)}
              className="p-1.5 rounded hover:bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text transition-colors"
              title="Edit integration"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Provider */}
        {integration.provider && (
          <div className="flex items-center gap-1.5 text-xs text-mc-text-secondary mb-2">
            <ExternalLink className="w-3 h-3" />
            <span>{integration.provider}</span>
          </div>
        )}

        {/* Credential source */}
        {integration.credential_source && (
          <div className="text-xs text-mc-text-secondary mb-2">
            <span className="text-mc-text-secondary">Credential: </span>
            <span className="text-mc-text">{integration.credential_source}</span>
          </div>
        )}

        {/* Validation message */}
        {integration.validation_message && (
          <p className="text-xs text-mc-text-secondary mb-3 line-clamp-2">
            {integration.validation_message}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-mc-border/50">
          <span className="text-xs text-mc-text-secondary">
            {integration.last_validated
              ? `Validated ${formatDistanceToNow(new Date(integration.last_validated), { addSuffix: true })}`
              : 'Never validated'}
          </span>
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={handleTestConnection}
              disabled={isTestingConnection}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text rounded hover:bg-mc-bg transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-3 h-3 ${isTestingConnection ? 'animate-spin' : ''}`} />
              {isTestingConnection ? 'Testing...' : 'Test Connection'}
            </button>
            {testResult && (
              <span
                className={`text-xs ${
                  testResult === 'Connection successful'
                    ? 'text-mc-accent-green'
                    : 'text-mc-accent-red'
                }`}
              >
                {testResult}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editModalOpen && (
        <IntegrationModal
          integration={integration}
          onClose={() => setEditModalOpen(false)}
          onSaved={(updated) => {
            setEditModalOpen(false);
            if (onUpdate) onUpdate(updated);
          }}
        />
      )}
    </>
  );
}
