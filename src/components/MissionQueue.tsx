'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, ChevronRight, ChevronDown, GripVertical, Layers } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import { triggerAutoDispatch, shouldTriggerAutoDispatch } from '@/lib/auto-dispatch';
import type { Task, TaskStatus, Initiative, InitiativeStatus } from '@/lib/types';
import { TaskModal } from './TaskModal';
import { InitiativeModal } from './InitiativeModal';
import { formatDistanceToNow } from 'date-fns';
import { getTaskTypeMetadata } from '@/lib/task-types';

// ─── Constants ───────────────────────────────────────────────────────────────

interface MissionQueueProps {
  workspaceId?: string;
}

type ViewMode = 'flat' | 'by-initiative';

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'planning', label: 'PLANNING', color: 'border-t-mc-accent-purple' },
  { id: 'inbox', label: 'INBOX', color: 'border-t-mc-accent-pink' },
  { id: 'assigned', label: 'ASSIGNED', color: 'border-t-mc-accent-yellow' },
  { id: 'in_progress', label: 'IN PROGRESS', color: 'border-t-mc-accent' },
  { id: 'testing', label: 'TESTING', color: 'border-t-mc-accent-cyan' },
  { id: 'review', label: 'REVIEW', color: 'border-t-mc-accent-purple' },
  { id: 'done', label: 'DONE', color: 'border-t-mc-accent-green' },
];

const INITIATIVE_STATUS_COLORS: Record<InitiativeStatus, string> = {
  planned: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'in-progress': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
  canceled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  blocked: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const INITIATIVE_CHIP_COLORS: Record<InitiativeStatus, string> = {
  planned: 'bg-purple-500/15 text-purple-400',
  'in-progress': 'bg-cyan-500/15 text-cyan-400',
  completed: 'bg-green-500/15 text-green-400',
  canceled: 'bg-gray-500/15 text-gray-400',
  blocked: 'bg-red-500/15 text-red-400',
};

// ─── Main Component ──────────────────────────────────────────────────────────

export function MissionQueue({ workspaceId }: MissionQueueProps) {
  const { tasks, initiatives, agents, updateTaskStatus, addEvent } = useMissionControl();
  const [viewMode, setViewMode] = useState<ViewMode>('flat');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInitiativeModal, setShowInitiativeModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    if (!draggedTask || draggedTask.status === targetStatus) {
      setDraggedTask(null);
      return;
    }

    updateTaskStatus(draggedTask.id, targetStatus);

    try {
      const res = await fetch(`/api/tasks/${draggedTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });

      if (res.ok) {
        addEvent({
          id: crypto.randomUUID(),
          type: targetStatus === 'done' ? 'task_completed' : 'task_status_changed',
          task_id: draggedTask.id,
          message: `Task "${draggedTask.title}" moved to ${targetStatus}`,
          created_at: new Date().toISOString(),
        });

        if (shouldTriggerAutoDispatch(draggedTask.status, targetStatus, draggedTask.assigned_agent_id)) {
          const result = await triggerAutoDispatch({
            taskId: draggedTask.id,
            taskTitle: draggedTask.title,
            agentId: draggedTask.assigned_agent_id,
            agentName: draggedTask.assigned_agent?.name || 'Unknown Agent',
            workspaceId: draggedTask.workspace_id,
          });
          if (!result.success) {
            console.error('Auto-dispatch failed:', result.error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to update task status:', error);
      updateTaskStatus(draggedTask.id, draggedTask.status);
    }

    setDraggedTask(null);
  };

  // Build initiative lookup for chip display in flat view
  const initiativeMap = useMemo(() => {
    const map = new Map<string, Initiative>();
    for (const init of initiatives) map.set(init.id, init);
    return map;
  }, [initiatives]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-mc-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4 text-mc-text-secondary" />
            <span className="text-sm font-medium uppercase tracking-wider">Mission Queue</span>
          </div>
          {/* View Toggle */}
          <ViewToggle viewMode={viewMode} onChange={setViewMode} />
        </div>
        {/* Plus Dropdown */}
        <PlusDropdown
          open={showPlusMenu}
          onToggle={() => setShowPlusMenu((v) => !v)}
          onClose={() => setShowPlusMenu(false)}
          onNewTask={() => { setShowCreateModal(true); setShowPlusMenu(false); }}
          onNewInitiative={() => { setShowInitiativeModal(true); setShowPlusMenu(false); }}
        />
      </div>

      {/* Board Content */}
      {viewMode === 'flat' ? (
        <FlatView
          tasks={tasks}
          agents={agents}
          initiativeMap={initiativeMap}
          draggedTask={draggedTask}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onTaskClick={(task) => setEditingTask(task)}
        />
      ) : (
        <InitiativeView
          tasks={tasks}
          initiatives={initiatives}
          agents={agents}
          draggedTask={draggedTask}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onTaskClick={(task) => setEditingTask(task)}
        />
      )}

      {/* Modals */}
      {showCreateModal && (
        <TaskModal onClose={() => setShowCreateModal(false)} workspaceId={workspaceId} />
      )}
      {editingTask && (
        <TaskModal task={editingTask} onClose={() => setEditingTask(null)} workspaceId={workspaceId} />
      )}
      {showInitiativeModal && (
        <InitiativeModal onClose={() => setShowInitiativeModal(false)} workspaceId={workspaceId} />
      )}
    </div>
  );
}

// ─── View Toggle ─────────────────────────────────────────────────────────────

function ViewToggle({ viewMode, onChange }: { viewMode: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex items-center bg-mc-bg-tertiary rounded p-0.5">
      <button
        onClick={() => onChange('flat')}
        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
          viewMode === 'flat'
            ? 'bg-mc-bg-secondary text-mc-text shadow-sm'
            : 'text-mc-text-secondary hover:text-mc-text'
        }`}
      >
        Flat
      </button>
      <button
        onClick={() => onChange('by-initiative')}
        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
          viewMode === 'by-initiative'
            ? 'bg-mc-bg-secondary text-mc-text shadow-sm'
            : 'text-mc-text-secondary hover:text-mc-text'
        }`}
      >
        <Layers className="w-3 h-3" />
        By Initiative
      </button>
    </div>
  );
}

// ─── Plus Dropdown ───────────────────────────────────────────────────────────

function PlusDropdown({
  open,
  onToggle,
  onClose,
  onNewTask,
  onNewInitiative,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onNewTask: () => void;
  onNewInitiative: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onToggle}
        className="flex items-center justify-center w-8 h-8 bg-mc-accent text-mc-bg rounded-lg hover:bg-mc-accent/90 transition-colors"
      >
        <Plus className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-mc-bg-secondary border border-mc-border rounded-lg shadow-xl z-40 py-1 overflow-hidden">
          <button
            onClick={onNewInitiative}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-mc-text hover:bg-mc-bg-tertiary transition-colors"
          >
            <Layers className="w-4 h-4 text-mc-accent-cyan" />
            New Initiative
          </button>
          <button
            onClick={onNewTask}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-mc-text hover:bg-mc-bg-tertiary transition-colors"
          >
            <Plus className="w-4 h-4 text-mc-accent-pink" />
            New Task
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Flat View (original Kanban) ─────────────────────────────────────────────

interface FlatViewProps {
  tasks: Task[];
  agents: { id: string; status: string; avatar_emoji: string; name: string }[];
  initiativeMap: Map<string, Initiative>;
  draggedTask: Task | null;
  onDragStart: (e: React.DragEvent, task: Task) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, status: TaskStatus) => void;
  onTaskClick: (task: Task) => void;
}

function FlatView({ tasks, agents, initiativeMap, draggedTask, onDragStart, onDragOver, onDrop, onTaskClick }: FlatViewProps) {
  const getTasksByStatus = (status: TaskStatus) => tasks.filter((t) => t.status === status);

  return (
    <div className="flex-1 flex gap-3 p-3 overflow-x-auto">
      {COLUMNS.map((column) => {
        const columnTasks = getTasksByStatus(column.id);
        return (
          <div
            key={column.id}
            className={`flex-1 min-w-[220px] max-w-[300px] flex flex-col bg-mc-bg rounded-lg border border-mc-border/50 border-t-2 ${column.color}`}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, column.id)}
          >
            <div className="p-2 border-b border-mc-border flex items-center justify-between">
              <span className="text-xs font-medium uppercase text-mc-text-secondary">{column.label}</span>
              <span className="text-xs bg-mc-bg-tertiary px-2 py-0.5 rounded text-mc-text-secondary">
                {columnTasks.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {columnTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  agents={agents}
                  initiative={task.initiative_id ? initiativeMap.get(task.initiative_id) : undefined}
                  showInitiativeChip
                  onDragStart={onDragStart}
                  onClick={() => onTaskClick(task)}
                  isDragging={draggedTask?.id === task.id}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Initiative View (Swimlanes) ─────────────────────────────────────────────

interface InitiativeViewProps {
  tasks: Task[];
  initiatives: Initiative[];
  agents: { id: string; status: string; avatar_emoji: string; name: string }[];
  draggedTask: Task | null;
  onDragStart: (e: React.DragEvent, task: Task) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, status: TaskStatus) => void;
  onTaskClick: (task: Task) => void;
}

function InitiativeView({ tasks, initiatives, agents, draggedTask, onDragStart, onDragOver, onDrop, onTaskClick }: InitiativeViewProps) {
  // Group tasks by initiative_id
  const grouped = useMemo(() => {
    const map = new Map<string | null, Task[]>();
    for (const task of tasks) {
      const key = task.initiative_id || null;
      const arr = map.get(key) || [];
      arr.push(task);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  // Sort initiatives: in-progress first, completed last
  const sortedInitiatives = useMemo(() => {
    return [...initiatives].sort((a, b) => {
      const order: Record<string, number> = { 'in-progress': 0, blocked: 1, planned: 2, completed: 3, canceled: 4 };
      return (order[a.status] ?? 2) - (order[b.status] ?? 2);
    });
  }, [initiatives]);

  // Default collapsed state: completed initiatives start collapsed
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const init of initiatives) {
      if (init.status === 'completed' || init.status === 'canceled') set.add(init.id);
    }
    return set;
  });

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const ungroupedTasks = grouped.get(null) || [];

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {sortedInitiatives.map((init) => {
        const initTasks = grouped.get(init.id) || [];
        const isCollapsed = collapsed.has(init.id);
        return (
          <InitiativeSwimlane
            key={init.id}
            initiative={init}
            tasks={initTasks}
            agents={agents}
            isCollapsed={isCollapsed}
            onToggle={() => toggle(init.id)}
            draggedTask={draggedTask}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onTaskClick={onTaskClick}
          />
        );
      })}

      {/* Ungrouped swimlane */}
      {ungroupedTasks.length > 0 && (
        <UngroupedSwimlane
          tasks={ungroupedTasks}
          agents={agents}
          draggedTask={draggedTask}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onTaskClick={onTaskClick}
        />
      )}
    </div>
  );
}

// ─── Initiative Swimlane ─────────────────────────────────────────────────────

interface InitiativeSwimlaneProps {
  initiative: Initiative;
  tasks: Task[];
  agents: { id: string; status: string; avatar_emoji: string; name: string }[];
  isCollapsed: boolean;
  onToggle: () => void;
  draggedTask: Task | null;
  onDragStart: (e: React.DragEvent, task: Task) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, status: TaskStatus) => void;
  onTaskClick: (task: Task) => void;
}

function InitiativeSwimlane({
  initiative,
  tasks,
  agents,
  isCollapsed,
  onToggle,
  draggedTask,
  onDragStart,
  onDragOver,
  onDrop,
  onTaskClick,
}: InitiativeSwimlaneProps) {
  const taskCount = initiative.task_count ?? tasks.length;
  const completedCount = initiative.completed_task_count ?? tasks.filter((t) => t.status === 'done').length;
  const progress = taskCount > 0 ? (completedCount / taskCount) * 100 : 0;
  const statusColors = INITIATIVE_STATUS_COLORS[initiative.status] || INITIATIVE_STATUS_COLORS.planned;

  return (
    <div className="border border-mc-border/50 rounded-lg bg-mc-bg overflow-hidden">
      {/* Header bar */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-mc-bg-secondary/50 transition-colors"
      >
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
        )}

        <span className="text-sm font-medium truncate">{initiative.title}</span>

        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border flex-shrink-0 ${statusColors}`}>
          {initiative.status}
        </span>

        {initiative.lead && (
          <span className="text-xs text-mc-text-secondary flex-shrink-0">
            Lead: {initiative.lead}
          </span>
        )}

        {/* Progress bar */}
        <div className="flex items-center gap-2 ml-auto flex-shrink-0">
          <span className="text-xs text-mc-text-secondary">
            {completedCount}/{taskCount}
          </span>
          <div className="w-24 h-1.5 bg-mc-bg-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-mc-accent-green rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </button>

      {/* Swimlane columns */}
      {!isCollapsed && (
        <div className="flex gap-1 px-2 pb-2 overflow-x-auto">
          {COLUMNS.map((column) => {
            const columnTasks = tasks.filter((t) => t.status === column.id);
            return (
              <div
                key={column.id}
                className="flex-1 min-w-[160px] flex flex-col"
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, column.id)}
              >
                <div className="px-1.5 py-1 flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase text-mc-text-secondary/60">
                    {column.label}
                  </span>
                  {columnTasks.length > 0 && (
                    <span className="text-[10px] text-mc-text-secondary/40">{columnTasks.length}</span>
                  )}
                </div>
                <div className="flex-1 space-y-1.5 min-h-[40px]">
                  {columnTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      agents={agents}
                      showInitiativeChip={false}
                      onDragStart={onDragStart}
                      onClick={() => onTaskClick(task)}
                      isDragging={draggedTask?.id === task.id}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Ungrouped Swimlane ──────────────────────────────────────────────────────

function UngroupedSwimlane({
  tasks,
  agents,
  draggedTask,
  onDragStart,
  onDragOver,
  onDrop,
  onTaskClick,
}: Omit<InitiativeSwimlaneProps, 'initiative' | 'isCollapsed' | 'onToggle'>) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="border border-mc-border/30 border-dashed rounded-lg bg-mc-bg overflow-hidden">
      <button
        onClick={() => setIsCollapsed((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-mc-bg-secondary/50 transition-colors"
      >
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
        )}
        <span className="text-sm font-medium text-mc-text-secondary">Ungrouped</span>
        <span className="text-xs text-mc-text-secondary/60 ml-auto">{tasks.length} tasks</span>
      </button>

      {!isCollapsed && (
        <div className="flex gap-1 px-2 pb-2 overflow-x-auto">
          {COLUMNS.map((column) => {
            const columnTasks = tasks.filter((t) => t.status === column.id);
            return (
              <div
                key={column.id}
                className="flex-1 min-w-[160px] flex flex-col"
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, column.id)}
              >
                <div className="px-1.5 py-1 flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase text-mc-text-secondary/60">
                    {column.label}
                  </span>
                  {columnTasks.length > 0 && (
                    <span className="text-[10px] text-mc-text-secondary/40">{columnTasks.length}</span>
                  )}
                </div>
                <div className="flex-1 space-y-1.5 min-h-[40px]">
                  {columnTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      agents={agents}
                      showInitiativeChip={false}
                      onDragStart={onDragStart}
                      onClick={() => onTaskClick(task)}
                      isDragging={draggedTask?.id === task.id}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Task Card ───────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  agents: { id: string; status: string; avatar_emoji: string; name: string }[];
  initiative?: Initiative;
  showInitiativeChip: boolean;
  onDragStart: (e: React.DragEvent, task: Task) => void;
  onClick: () => void;
  isDragging: boolean;
}

function TaskCard({ task, agents, initiative, showInitiativeChip, onDragStart, onClick, isDragging }: TaskCardProps) {
  const priorityDots: Record<string, string> = {
    low: 'bg-mc-text-secondary/40',
    normal: 'bg-mc-accent',
    high: 'bg-mc-accent-yellow',
    urgent: 'bg-mc-accent-red',
  };

  const priorityStyles: Record<string, string> = {
    low: 'text-mc-text-secondary',
    normal: 'text-mc-accent',
    high: 'text-mc-accent-yellow',
    urgent: 'text-mc-accent-red',
  };

  const isPlanning = task.status === 'planning';

  // Find agent info for avatar + working status
  const assignedAgent = task.assigned_agent as (typeof agents)[number] | undefined;
  const agentFromStore = assignedAgent
    ? agents.find((a) => a.id === (assignedAgent as unknown as { id: string }).id)
    : task.assigned_agent_id
      ? agents.find((a) => a.id === task.assigned_agent_id)
      : undefined;

  const isWorking = agentFromStore?.status === 'working';
  const agentEmoji = assignedAgent
    ? (assignedAgent as unknown as { avatar_emoji: string }).avatar_emoji
    : agentFromStore?.avatar_emoji;
  const agentName = assignedAgent
    ? (assignedAgent as unknown as { name: string }).name
    : agentFromStore?.name;

  // Subtask info
  const subtasks = task.subtasks;
  const hasSubtasks = subtasks && subtasks.length > 0;
  const subtasksDone = hasSubtasks ? subtasks.filter((s) => s.status === 'done').length : 0;
  const subtasksTotal = hasSubtasks ? subtasks.length : 0;
  const subtaskProgress = subtasksTotal > 0 ? (subtasksDone / subtasksTotal) * 100 : 0;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={onClick}
      className={`group bg-mc-bg-secondary border rounded-lg cursor-pointer transition-all hover:shadow-lg hover:shadow-black/20 ${
        isDragging ? 'opacity-50 scale-95' : ''
      } ${isPlanning ? 'border-purple-500/40 hover:border-purple-500' : 'border-mc-border/50 hover:border-mc-accent/40'}`}
    >
      {/* Drag handle bar */}
      <div className="flex items-center justify-center py-1.5 border-b border-mc-border/30 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="w-4 h-4 text-mc-text-secondary/50 cursor-grab" />
      </div>

      {/* Card content */}
      <div className="p-3">
        {/* Agent avatar row */}
        {agentEmoji && (
          <div className="flex items-center gap-2 mb-2">
            <div className="relative">
              <span className="text-lg leading-none">{agentEmoji}</span>
              {isWorking && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border border-mc-bg-secondary animate-pulse" />
              )}
            </div>
            <span className="text-xs text-mc-text-secondary truncate">{agentName}</span>
          </div>
        )}

        {/* Initiative chip (flat view only) */}
        {showInitiativeChip && initiative && (
          <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded mb-2 ${INITIATIVE_CHIP_COLORS[initiative.status] || 'bg-mc-bg-tertiary text-mc-text-secondary'}`}>
            {initiative.id}
          </span>
        )}

        {/* Title */}
        <h4 className="text-sm font-medium leading-snug line-clamp-2 mb-2">
          {task.title}
        </h4>

        {/* Task type badge (hidden for openclaw-native) */}
        {task.task_type && task.task_type !== 'openclaw-native' && (
          <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded mb-2 ${getTaskTypeMetadata(task.task_type).badgeColor}`}>
            {getTaskTypeMetadata(task.task_type).badge}
          </span>
        )}

        {/* Planning mode indicator */}
        {isPlanning && (
          <div className="flex items-center gap-2 mb-2 py-2 px-3 bg-purple-500/10 rounded-md border border-purple-500/20">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse flex-shrink-0" />
            <span className="text-xs text-purple-400 font-medium">Continue planning</span>
          </div>
        )}

        {/* Subtask indicator */}
        {hasSubtasks && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-mc-text-secondary">
              {subtasksDone}/{subtasksTotal} subtasks
            </span>
            <div className="flex-1 h-1 bg-mc-bg-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-mc-accent-green rounded-full transition-all"
                style={{ width: `${subtaskProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer: priority + timestamp */}
        <div className="flex items-center justify-between pt-2 border-t border-mc-border/20">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${priorityDots[task.priority]}`} />
            <span className={`text-xs capitalize ${priorityStyles[task.priority]}`}>
              {task.priority}
            </span>
          </div>
          <span className="text-[10px] text-mc-text-secondary/60">
            {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
          </span>
        </div>
      </div>
    </div>
  );
}
