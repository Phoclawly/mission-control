import { NextResponse } from 'next/server';

/**
 * Build a dynamic SQL UPDATE query from a partial body object.
 * Returns null if no fields to update.
 */
export function buildPatchQuery(
  table: string,
  id: string,
  body: Record<string, unknown>,
  allowedFields: string[]
): { sql: string; values: unknown[] } | null {
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(body[field]);
    }
  }

  if (updates.length === 0) return null;

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  return {
    sql: `UPDATE ${table} SET ${updates.join(', ')} WHERE id = ?`,
    values,
  };
}

export function notFound(resource: string) {
  return NextResponse.json({ error: `${resource} not found` }, { status: 404 });
}
