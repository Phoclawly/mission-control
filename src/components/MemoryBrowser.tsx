'use client';

import { BookOpen, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface MemoryBrowserProps {
  agentId: string;
  date: string | null;
  content: string | null;
  loading: boolean;
}

export function MemoryBrowser({ agentId, date, content, loading }: MemoryBrowserProps) {
  if (!date) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="w-12 h-12 mx-auto mb-3 text-mc-text-secondary opacity-50" />
          <p className="text-mc-text-secondary">Select a date to view memory</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-2 text-mc-accent animate-spin" />
          <p className="text-sm text-mc-text-secondary">Loading memory for {date}...</p>
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="w-8 h-8 mx-auto mb-2 text-mc-text-secondary opacity-50" />
          <p className="text-mc-text-secondary">No memory content for {date}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-4">
        <h3 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider">
          Memory for {date}
        </h3>
      </div>
      <div className="prose prose-invert prose-sm max-w-none prose-headings:text-mc-text prose-p:text-mc-text-secondary prose-a:text-mc-accent prose-strong:text-mc-text prose-code:text-mc-accent-cyan prose-code:bg-mc-bg prose-code:px-1 prose-code:rounded prose-pre:bg-mc-bg prose-pre:border prose-pre:border-mc-border">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
