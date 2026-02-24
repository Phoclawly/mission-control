'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Shield, Plug, Clock, Activity } from 'lucide-react';
import { Header } from '@/components/Header';
import { CapabilitiesOverview } from '@/components/CapabilitiesOverview';
import { AlertsBanner } from '@/components/AlertsBanner';
import { CapabilityTable } from '@/components/CapabilityTable';
import { IntegrationCard } from '@/components/IntegrationCard';
import { CronJobsTable } from '@/components/CronJobsTable';
import { HealthLog } from '@/components/HealthLog';
import { IntegrationModal } from '@/components/modals/IntegrationModal';
import { useMissionControl } from '@/lib/store';
import { useSSE } from '@/hooks/useSSE';
import type { Workspace, CapabilitiesOverview as CapabilitiesOverviewType, Integration, Agent } from '@/lib/types';

type TabId = 'capabilities' | 'integrations' | 'crons' | 'health';

const tabDefs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'capabilities', label: 'Capabilities', icon: Shield },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'crons', label: 'Crons', icon: Clock },
  { id: 'health', label: 'Health Log', icon: Activity },
];

export default function CapabilitiesPage() {
  const params = useParams();
  const slug = params.slug as string;

  const { setAgents, setIsOnline, setIsLoading, isLoading } = useMissionControl();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('capabilities');
  const [overview, setOverview] = useState<CapabilitiesOverviewType | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [agents, setLocalAgents] = useState<Agent[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Integration modal state
  const [integrationModalOpen, setIntegrationModalOpen] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<Integration | undefined>(undefined);

  // Connect to SSE for real-time updates
  useSSE();

  // Load workspace data
  useEffect(() => {
    async function loadWorkspace() {
      try {
        const res = await fetch(`/api/workspaces/${slug}`);
        if (res.ok) {
          const data = await res.json();
          setWorkspace(data);
        } else if (res.status === 404) {
          setNotFound(true);
          setIsLoading(false);
          return;
        }
      } catch (error) {
        console.error('Failed to load workspace:', error);
        setNotFound(true);
        setIsLoading(false);
        return;
      }
    }

    loadWorkspace();
  }, [slug, setIsLoading]);

  // Load overview & agents
  useEffect(() => {
    if (!workspace) return;

    async function loadData() {
      try {
        const [overviewRes, agentsRes, integrationsRes] = await Promise.all([
          fetch('/api/capabilities/overview'),
          fetch(`/api/agents?workspace_id=${workspace!.id}`),
          fetch('/api/integrations'),
        ]);

        if (overviewRes.ok) {
          const data = await overviewRes.json();
          setOverview(data);
        }
        if (agentsRes.ok) {
          const agentsData: Agent[] = await agentsRes.json();
          setAgents(agentsData);
          setLocalAgents(agentsData);
        }
        if (integrationsRes.ok) {
          setIntegrations(await integrationsRes.json());
        }
      } catch (error) {
        console.error('Failed to load capabilities data:', error);
      } finally {
        setOverviewLoading(false);
        setIsLoading(false);
      }
    }

    // Check OpenClaw connection separately (non-blocking)
    async function checkOpenClaw() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch('/api/openclaw/status', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const status = await res.json();
          setIsOnline(status.connected);
        }
      } catch {
        setIsOnline(false);
      }
    }

    loadData();
    checkOpenClaw();
  }, [workspace, setAgents, setIsOnline, setIsLoading]);

  const handleTestConnection = async (integrationId: string) => {
    try {
      const res = await fetch(`/api/integrations/${integrationId}/test`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setIntegrations((prev) =>
          prev.map((i) => (i.id === integrationId ? updated : i))
        );
      }
    } catch (error) {
      console.error('Failed to test connection:', error);
    }
  };

  const handleIntegrationUpdated = (updated: Integration) => {
    setIntegrations((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">&#128269;</div>
          <h1 className="text-2xl font-bold mb-2">Workspace Not Found</h1>
          <p className="text-mc-text-secondary mb-6">
            The workspace &ldquo;{slug}&rdquo; doesn&apos;t exist.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-mc-accent text-mc-bg rounded-lg font-medium hover:bg-mc-accent/90"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading || !workspace) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">&#128737;</div>
          <p className="text-mc-text-secondary">Loading capabilities...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-mc-bg overflow-hidden">
      <Header workspace={workspace} />

      {/* Page header */}
      <div className="border-b border-mc-border bg-mc-bg-secondary px-6 py-4">
        <div className="flex items-center gap-3 mb-4">
          <Link
            href={`/workspace/${slug}`}
            className="p-1 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary hover:text-mc-text transition-colors"
            title="Back to workspace"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <Shield className="w-5 h-5 text-mc-accent" />
          <h1 className="text-xl font-semibold text-mc-text">Capabilities</h1>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1">
          {tabDefs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t transition-colors ${
                  activeTab === tab.id
                    ? 'bg-mc-bg text-mc-accent border-b-2 border-mc-accent'
                    : 'text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Summary cards (always shown) */}
        {!overviewLoading && overview && (
          <>
            <CapabilitiesOverview overview={overview} />
            {overview.alerts.length > 0 && (
              <AlertsBanner alerts={overview.alerts} />
            )}
          </>
        )}

        {/* Tab content */}
        {activeTab === 'capabilities' && (
          <CapabilityTable
            agents={agents}
          />
        )}

        {activeTab === 'integrations' && (
          <div>
            {integrations.length === 0 ? (
              <div className="text-center py-12">
                <Plug className="w-10 h-10 mx-auto mb-3 text-mc-text-secondary opacity-50" />
                <p className="text-mc-text-secondary">No integrations configured.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {integrations.map((integration) => (
                  <IntegrationCard
                    key={integration.id}
                    integration={integration}
                    onTestConnection={handleTestConnection}
                    onUpdate={handleIntegrationUpdated}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'crons' && <CronJobsTable agents={agents} />}
        {activeTab === 'health' && <HealthLog />}
      </div>

      {/* Integration Modal (page-level) */}
      {integrationModalOpen && (
        <IntegrationModal
          integration={editingIntegration}
          onClose={() => { setIntegrationModalOpen(false); setEditingIntegration(undefined); }}
          onSaved={(updated) => {
            setIntegrationModalOpen(false);
            setEditingIntegration(undefined);
            setIntegrations((prev) =>
              prev.map((i) => (i.id === updated.id ? updated : i))
            );
          }}
        />
      )}
    </div>
  );
}
