import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { sendWhatsApp } from '@/lib/notify';

const COMPLETED_DIR = '/home/node/.openclaw/escalation/completed';

// Track which escalations we already sent WA notifications for
const notifiedSet = new Set<string>();

// GET /api/openclaw/update/status?file=update-123456.json
// Polls the escalation completed directory for the result
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('file');

  if (!filename) {
    return NextResponse.json({ error: 'file param required' }, { status: 400 });
  }

  const completedPath = join(COMPLETED_DIR, filename);

  if (!existsSync(completedPath)) {
    return NextResponse.json({ pending: true });
  }

  try {
    const data = JSON.parse(readFileSync(completedPath, 'utf-8'));
    const success = data.result === 'ok';

    // Send WA notification once per escalation
    if (!notifiedSet.has(filename)) {
      notifiedSet.add(filename);
      const version = data.version || filename.replace(/^update-|\.\w+$/g, '');
      const msg = success
        ? `✅ *OpenClaw updated successfully* via Mission Control\nProcessed at ${data.processed_at || 'unknown'}`
        : `❌ *OpenClaw update failed*\nError: ${data.error || 'unknown'}\nProcessed at ${data.processed_at || 'unknown'}`;
      sendWhatsApp(msg).catch(() => {});
    }

    return NextResponse.json({
      pending: false,
      success,
      result: data.result,
      error: data.error || null,
      processedAt: data.processed_at,
    });
  } catch {
    return NextResponse.json({ pending: true });
  }
}
