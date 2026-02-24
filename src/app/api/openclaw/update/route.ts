import { NextResponse } from 'next/server';
import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { sendWhatsApp } from '@/lib/notify';
import { appendArgusMemory } from '@/lib/argus-memory';

const ESCALATION_DIR = '/home/node/.openclaw/escalation/pending';
const DOCKER_IMAGE_BASE = 'ghcr.io/openclaw/openclaw';

// POST /api/openclaw/update — triggers host-level update via escalation system
export async function POST(request: Request) {
  try {
    const { version } = await request.json();

    if (!version) {
      return NextResponse.json({ error: 'Version is required' }, { status: 400 });
    }

    // Ensure escalation directory exists
    if (!existsSync(ESCALATION_DIR)) {
      mkdirSync(ESCALATION_DIR, { recursive: true });
    }

    const tag = `${DOCKER_IMAGE_BASE}:${version}`;
    const filename = `update-${Date.now()}.json`;
    const filepath = join(ESCALATION_DIR, filename);

    writeFileSync(filepath, JSON.stringify({
      type: 'update',
      tag,
      version,
      requestedBy: 'mission-control',
      requestedAt: new Date().toISOString(),
    }, null, 2));

    // Notify via WhatsApp (fire-and-forget)
    sendWhatsApp(
      `🔄 *OpenClaw update requested* via Mission Control\nTarget: v${version}\nHost watcher will process within ~5 min`
    ).catch(() => {});

    // Inject into Argus memory
    appendArgusMemory(
      `OpenClaw update to v${version} requested via Mission Control UI. Escalation file: ${filename}. Host watcher will pull image ${tag} and restart container.`
    );

    return NextResponse.json({
      success: true,
      message: `Update to v${version} queued. Host watcher will process within 5 minutes.`,
      escalation: filename,
    });
  } catch (error) {
    console.error('Update request failed:', error);
    return NextResponse.json(
      { error: 'Failed to create update request' },
      { status: 500 }
    );
  }
}
