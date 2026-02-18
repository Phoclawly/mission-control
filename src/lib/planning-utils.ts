import { getOpenClawClient } from './openclaw/client';

// Maximum input length for extractJSON to prevent ReDoS attacks
const MAX_EXTRACT_JSON_LENGTH = 1_000_000; // 1MB

/**
 * Extract JSON from a response that might have markdown code blocks or surrounding text.
 * Handles various formats:
 * - Direct JSON
 * - Markdown code blocks (```json ... ``` or ``` ... ```)
 * - JSON embedded in text (first { to last })
 */
export function extractJSON(text: string): object | null {
  // Security: Prevent ReDoS on massive inputs
  if (text.length > MAX_EXTRACT_JSON_LENGTH) {
    console.warn('[Planning Utils] Input exceeds maximum length for JSON extraction:', text.length);
    return null;
  }

  // First, try direct parse
  try {
    return JSON.parse(text.trim());
  } catch {
    // Continue to other methods
  }

  // Try to extract from markdown code block (```json ... ``` or ``` ... ```)
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // Continue
    }
  }

  // Try to find JSON object in the text (first { to last })
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      // Continue
    }
  }

  return null;
}

/**
 * Get messages from the in-memory planning buffer for a given session.
 *
 * Instead of calling `chat.history` (which the Gateway does not support for
 * planning sessions and causes a 30-second timeout), we rely on the WebSocket
 * event stream that is already being received by the singleton OpenClawClient.
 *
 * When a planning message is sent via `chat.send`, the Gateway processes it
 * and streams the response back as `type:"event" event:"agent"` frames.
 * The OpenClawClient now captures these into a `globalThis` buffer keyed by
 * sessionKey.  This function reads from that buffer — no extra RPC call needed.
 */
export async function getMessagesFromOpenClaw(
  sessionKey: string
): Promise<Array<{ role: string; content: string }>> {
  try {
    const client = getOpenClawClient();
    // Ensure client is connected so it can receive streaming events.
    if (!client.isConnected()) {
      await client.connect();
    }

    // Read from the in-memory planning buffer (populated by WebSocket events)
    const buffered = client.getPlanningMessages(sessionKey);

    return buffered.map((m) => ({ role: m.role, content: m.content }));
  } catch (err) {
    console.error('[Planning Utils] Failed to get messages from OpenClaw:', err);
    return [];
  }
}
