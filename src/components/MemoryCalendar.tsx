'use client';

import { Calendar, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface MemoryEntry {
  date: string;
  entry_count: number;
  file_size_bytes: number;
}

interface MemoryCalendarProps {
  entries: MemoryEntry[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MemoryCalendar({ entries, selectedDate, onSelectDate }: MemoryCalendarProps) {
  // Sort entries newest first
  const sortedEntries = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  if (sortedEntries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Calendar className="w-10 h-10 mb-3 text-mc-text-secondary opacity-50" />
        <p className="text-sm text-mc-text-secondary">No memory entries found</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-medium text-mc-text-secondary uppercase tracking-wider mb-3 px-2">
        Memory Entries ({sortedEntries.length})
      </h3>
      {sortedEntries.map((entry) => {
        const isSelected = selectedDate === entry.date;
        let formattedDate: string;
        try {
          formattedDate = format(parseISO(entry.date), 'MMM d, yyyy');
        } catch {
          formattedDate = entry.date;
        }

        return (
          <button
            key={entry.date}
            onClick={() => onSelectDate(entry.date)}
            className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center gap-3 ${
              isSelected
                ? 'bg-mc-accent/20 border border-mc-accent/30 text-mc-accent'
                : 'hover:bg-mc-bg-tertiary border border-transparent text-mc-text'
            }`}
          >
            {/* Dot indicator */}
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              entry.entry_count > 0
                ? isSelected
                  ? 'bg-mc-accent'
                  : 'bg-mc-accent-green'
                : 'border border-mc-text-secondary'
            }`} />

            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{formattedDate}</div>
              <div className="flex items-center gap-3 text-xs text-mc-text-secondary mt-0.5">
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {entry.entry_count} {entry.entry_count === 1 ? 'entry' : 'entries'}
                </span>
                <span>{formatFileSize(entry.file_size_bytes)}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
