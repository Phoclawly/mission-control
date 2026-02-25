import { NextRequest, NextResponse } from 'next/server';
import { getDb, queryOne, run } from '@/lib/db';
import { buildPatchQuery, notFound } from '@/lib/api-helpers';

// GET /api/workspaces/[id] - Get a single workspace
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    const db = getDb();
    
    // Try to find by ID or slug
    const workspace = db.prepare(
      'SELECT * FROM workspaces WHERE id = ? OR slug = ?'
    ).get(id, id);
    
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }
    
    return NextResponse.json(workspace);
  } catch (error) {
    console.error('Failed to fetch workspace:', error);
    return NextResponse.json({ error: 'Failed to fetch workspace' }, { status: 500 });
  }
}

// PATCH /api/workspaces/[id] - Update a workspace
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    const body = await request.json();

    // Check workspace exists
    const existing = queryOne('SELECT * FROM workspaces WHERE id = ?', [id]);
    if (!existing) return notFound('Workspace');

    const patch = buildPatchQuery('workspaces', id, body, ['name', 'description', 'icon']);
    if (!patch) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    run(patch.sql, patch.values);

    const workspace = queryOne('SELECT * FROM workspaces WHERE id = ?', [id]);
    return NextResponse.json(workspace);
  } catch (error) {
    console.error('Failed to update workspace:', error);
    return NextResponse.json({ error: 'Failed to update workspace' }, { status: 500 });
  }
}

// DELETE /api/workspaces/[id] - Delete a workspace
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    const db = getDb();
    
    // Don't allow deleting the default workspace
    if (id === 'default') {
      return NextResponse.json({ error: 'Cannot delete the default workspace' }, { status: 400 });
    }
    
    // Check workspace exists
    const existing = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
    if (!existing) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }
    
    // Check if workspace has tasks or agents
    const taskCount = db.prepare(
      'SELECT COUNT(*) as count FROM tasks WHERE workspace_id = ?'
    ).get(id) as { count: number };
    
    const agentCount = db.prepare(
      'SELECT COUNT(*) as count FROM agents WHERE workspace_id = ?'
    ).get(id) as { count: number };
    
    if (taskCount.count > 0 || agentCount.count > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete workspace with existing tasks or agents',
        taskCount: taskCount.count,
        agentCount: agentCount.count
      }, { status: 400 });
    }
    
    db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete workspace:', error);
    return NextResponse.json({ error: 'Failed to delete workspace' }, { status: 500 });
  }
}
