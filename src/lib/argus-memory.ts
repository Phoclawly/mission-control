import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ARGUS_MEMORY_DIR = '/home/node/.openclaw/workspace-argus/memory';

function todayFile(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return join(ARGUS_MEMORY_DIR, `${yyyy}-${mm}-${dd}.md`);
}

export function appendArgusMemory(entry: string): void {
  try {
    if (!existsSync(ARGUS_MEMORY_DIR)) {
      mkdirSync(ARGUS_MEMORY_DIR, { recursive: true });
    }
    const file = todayFile();
    const needsHeader = !existsSync(file);
    const d = new Date();
    const header = needsHeader
      ? `# ${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}\n\n`
      : '';
    appendFileSync(file, `${header}- ${entry}\n`);
  } catch (err) {
    console.error('[MC] Failed to write Argus memory:', err);
  }
}
