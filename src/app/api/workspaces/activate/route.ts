import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import fs from 'fs';
import path from 'path';

interface ActivateWorkspaceRequest {
  workspace: string;
  agent_id?: string;
  initiative_id?: string;
  external_request_id?: string;
  source?: string;
}

const DEFAULT_STATUS = 'planning';

function appendInitiativeStatus(
  initiativeId: string,
  nextStatus: 'in-progress' | 'completed' | 'canceled',
  note: string,
  actor: string,
  externalRequestId?: string
) {
  try {
    const squadStatusPath = process.env.SQUAD_STATUS_PATH || '/home/node/.openclaw/workspace/intel/status';
    const initiativesPath = path.join(squadStatusPath, 'INITIATIVES.json');
    if (!fs.existsSync(initiativesPath)) return;

    const raw = fs.readFileSync(initiativesPath, 'utf-8');
    const data = JSON.parse(raw) as { initiatives?: Array<Record<string, unknown>>; lastUpdate?: string };
    if (!Array.isArray(data.initiatives)) return;

    const target = data.initiatives.find((init) => String((init as { id?: unknown }).id || '').toUpperCase() === initiativeId);
    if (!target) return;

    const now = new Date().toISOString();
    (target as { status?: string }).status = nextStatus;
    if (externalRequestId) {
      (target as { external_request_id?: string }).external_request_id = externalRequestId;
    }

    const history = (target as { history?: Array<Record<string, unknown>> }).history;
    if (!Array.isArray(history)) {
      (target as { history: Array<Record<string, unknown>> }).history = [];
    }

    (target as { history: Array<Record<string, unknown>> }).history.push({
      status: nextStatus,
      at: now,
      by: actor,
      note,
    });

    data.lastUpdate = now;
    const tmpPath = `${initiativesPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, initiativesPath);
  } catch (err) {
    console.warn('[POST /api/workspaces/activate] INITIATIVES status append failed:', err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ActivateWorkspaceRequest;
    const workspaceSlug = (body.workspace || '').trim().toLowerCase();

    if (!workspaceSlug) {
      return NextResponse.json({ error: 'workspace is required' }, { status: 400 });
    }

    const workspace = queryOne<{ id: string; slug: string; name: string }>(
      'SELECT id, slug, name FROM workspaces WHERE slug = ? OR id = ? LIMIT 1',
      [workspaceSlug, workspaceSlug]
    );

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const source = body.source || 'mission-control';
    const requestedAgentId = (body.agent_id || '').trim();
    const externalRequestId = body.external_request_id || uuidv4();

    const existing = queryOne<{ id: string; initiative_id?: string }>(
      'SELECT id, initiative_id FROM tasks WHERE source = ? AND external_request_id = ?',
      [source, externalRequestId]
    );

    if (existing) {
      return NextResponse.json({
        success: true,
        idempotent: true,
        task_id: existing.id,
        workspace: workspace.slug,
        initiative_id: existing.initiative_id || null,
      });
    }

    const now = new Date().toISOString();
    const taskId = uuidv4();
    const generatedInitiativeId = `INIT-${now.slice(11, 19).replace(/:/g, '')}`;
    const requestedInitiativeId = body.initiative_id?.toUpperCase();

    const pendingInitiative = !requestedInitiativeId
      ? queryOne<{ initiative_id: string | null }>(
          `SELECT initiative_id
           FROM tasks
           WHERE workspace_id = ?
             AND source = 'mission-control'
             AND status = 'planning'
             AND initiative_id IS NOT NULL
           ORDER BY created_at DESC
           LIMIT 1`,
          [workspace.id]
        )
      : null;

    const initiativeId =
      requestedInitiativeId || pendingInitiative?.initiative_id || generatedInitiativeId;

    const existingWorkspaceAgent = queryOne<{ id: string }>(
      'SELECT id FROM agents WHERE id = ? AND workspace_id = ? LIMIT 1',
      [requestedAgentId, workspace.id]
    );
    const fallbackWorkspaceAgent = queryOne<{ id: string }>(
      `SELECT id
       FROM agents
       WHERE workspace_id = ?
       ORDER BY is_master DESC, id ASC
       LIMIT 1`,
      [workspace.id]
    );
    const targetAgentId = existingWorkspaceAgent?.id || fallbackWorkspaceAgent?.id || workspace.slug;

    run(
      `INSERT INTO tasks (
        id, title, description, status, priority,
        assigned_agent_id, workspace_id,
        initiative_id, external_request_id, source,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        `Activate Workspace (${workspace.slug})`,
        `Activation request from panel for workspace ${workspace.slug}`,
        DEFAULT_STATUS,
        'high',
        targetAgentId,
        workspace.id,
        initiativeId,
        externalRequestId,
        source,
        now,
        now,
      ]
    );

    run(
      `INSERT INTO events (id, type, task_id, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        'task_created',
        taskId,
        `Workspace ${workspace.slug} activated from panel`,
        JSON.stringify({
          source,
          workspace: workspace.slug,
          agent_id: targetAgentId,
          initiative_id: initiativeId,
          external_request_id: externalRequestId,
        }),
        now,
      ]
    );

    run(
      `UPDATE tasks
       SET status = 'in_progress', updated_at = ?
       WHERE initiative_id = ? AND workspace_id = ?`,
      [now, initiativeId, workspace.id]
    );

    run(
      `INSERT INTO events (id, type, task_id, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        'task_status_changed',
        taskId,
        `Workspace ${workspace.slug} activation moved initiative ${initiativeId} to in_progress`,
        JSON.stringify({
          source,
          workspace: workspace.slug,
          agent_id: targetAgentId,
          initiative_id: initiativeId,
          external_request_id: externalRequestId,
          next_status: 'in_progress',
        }),
        now,
      ]
    );

    appendInitiativeStatus(
      initiativeId,
      'in-progress',
      `Activated from Mission Control panel for workspace ${workspace.slug}`,
      source,
      externalRequestId
    );

    let gatewayTriggered = false;
    let gatewayWarning: string | null = null;

    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch {
        gatewayWarning = 'Task created but could not connect to OpenClaw Gateway for spawn trigger';
      }
    }

    if (!gatewayWarning) {
      const missionControlUrl = `http://127.0.0.1:${process.env.PORT || '4040'}`;
      const spawnInstruction = [
        `Mission Control activation request`,
        `source: mission-control`,
        `external_request_id: ${externalRequestId}`,
        initiativeId ? `initiative_id: ${initiativeId}` : null,
        `workspace: ${workspace.slug}`,
        `agent_id: ${targetAgentId}`,
        '',
        `Use sessions_spawn to ${targetAgentId} and execute this initiative in workspace ${workspace.slug}.`,
        `If initiative_id is present, link to that initiative and avoid duplicates.`,
        `Update initiative/state before final report.`
      ]
        .filter(Boolean)
        .join('\n');

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (process.env.MC_API_TOKEN) {
          headers.Authorization = `Bearer ${process.env.MC_API_TOKEN}`;
        }

        const dispatchRes = await fetch(`${missionControlUrl}/api/tasks/${taskId}/dispatch`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            override_message: spawnInstruction,
            source: 'mission-control',
            external_request_id: externalRequestId,
          }),
        });
        if (dispatchRes.ok) {
          gatewayTriggered = true;
        } else {
          gatewayWarning = 'Task created but dispatch endpoint returned an error';
        }
      } catch {
        gatewayWarning = 'Task created but failed to dispatch activation message';
      }
    }

    return NextResponse.json({
      success: true,
      task_id: taskId,
      workspace: workspace.slug,
      agent_id: targetAgentId,
      source,
      external_request_id: externalRequestId,
      initiative_id: initiativeId,
      gateway_triggered: gatewayTriggered,
      warning: gatewayWarning || undefined,
    });
  } catch (error) {
    console.error('Failed to activate workspace:', error);
    return NextResponse.json({ error: 'Failed to activate workspace' }, { status: 500 });
  }
}
