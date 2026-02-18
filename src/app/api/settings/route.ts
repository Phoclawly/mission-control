import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/settings
 * Returns server-side environment configuration for display in the Settings UI.
 * Only exposes non-sensitive path/URL configuration.
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json({
    workspaceBasePath: process.env.WORKSPACE_BASE_PATH || '/home/node/.openclaw/workspace',
    projectsPath: process.env.PROJECTS_PATH || '/home/node/.openclaw/workspace/projects',
    squadStatusPath: process.env.SQUAD_STATUS_PATH || '/home/node/.openclaw/workspace/intel/status',
    missionControlUrl: process.env.MISSION_CONTROL_URL || 'http://localhost:4040',
    port: process.env.PORT || '4040',
  });
}
