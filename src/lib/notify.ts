import { execFile } from 'child_process';

const SQUAD_OPS_JID = '120363409108210030@g.us';

export function sendWhatsApp(text: string, jid: string = SQUAD_OPS_JID): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'node',
      ['/app/openclaw.mjs', 'message', 'send', '--channel', 'whatsapp', '--target', jid, '--text', text],
      { timeout: 15000 },
      (error) => {
        if (error) {
          console.error('[MC] WhatsApp notify failed:', error.message);
          reject(error);
        } else {
          resolve();
        }
      }
    );
  });
}
