import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

interface WriteConfigBody {
  model?: string;
  soul_md?: string;
  tools_md?: string;
  user_md?: string;
  agents_md?: string;
}

/**
 * POST /api/agents/[id]/write-config
 *
 * Writes agent configuration changes to the VPS filesystem:
 * - model → openclaw.json (agents.{id}.model.primary)
 * - soul_md/tools_md/user_md/agents_md → workspace-{id}/*.md
 *
 * This runs AFTER the SQLite save and is non-blocking for the modal.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;

  // Security: validate agentId is alphanumeric + hyphens only (no path traversal)
  if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) {
    return NextResponse.json(
      { error: 'Invalid agent ID' },
      { status: 400 }
    );
  }

  let body: WriteConfigBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const wrote: { model: boolean; files: string[] } = { model: false, files: [] };

  try {
    // 1. Write model to openclaw.json
    if (body.model !== undefined) {
      const configPath = join(homedir(), '.openclaw', 'openclaw.json');

      if (existsSync(configPath)) {
        const raw = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(raw);

        // Backup before writing
        copyFileSync(configPath, configPath + '.bak');

        if (!config.agents) config.agents = {};

        // Get default model to compare
        const defaultModel = config.agents?.defaults?.model?.primary;

        if (body.model === '' || body.model === defaultModel) {
          // Use default — remove per-agent override
          if (config.agents[agentId]) {
            delete config.agents[agentId].model;
            if (Object.keys(config.agents[agentId]).length === 0) {
              delete config.agents[agentId];
            }
          }
        } else {
          if (!config.agents[agentId]) config.agents[agentId] = {};
          config.agents[agentId].model = { primary: body.model };
        }

        // Validate JSON is still valid before writing
        const newContent = JSON.stringify(config, null, 2);
        JSON.parse(newContent); // throws if invalid
        writeFileSync(configPath, newContent, 'utf-8');
        wrote.model = true;
      }
    }

    // 2. Write markdown files to workspace directory
    const wsDir = join(homedir(), '.openclaw', `workspace-${agentId}`);

    const fileMap: Record<string, string> = {
      soul_md: 'SOUL.md',
      tools_md: 'TOOLS.md',
      user_md: 'USER.md',
      agents_md: 'AGENTS.md',
    };

    for (const [field, filename] of Object.entries(fileMap)) {
      const value = body[field as keyof WriteConfigBody];
      if (value !== undefined && existsSync(wsDir)) {
        writeFileSync(join(wsDir, filename), value, 'utf-8');
        wrote.files.push(filename);
      }
    }

    return NextResponse.json({ success: true, wrote });
  } catch (error) {
    console.error(`[write-config] Error for agent ${agentId}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error', wrote },
      { status: 500 }
    );
  }
}
