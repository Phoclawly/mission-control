'use client';

import { FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface AgentMarkdownTabProps {
  content: string | undefined;
}

export function AgentMarkdownTab({ content }: AgentMarkdownTabProps) {
  if (content) {
    return (
      <div className="prose prose-invert prose-sm max-w-none prose-headings:text-mc-text prose-p:text-mc-text-secondary prose-a:text-mc-accent prose-strong:text-mc-text prose-code:text-mc-accent-cyan prose-code:bg-mc-bg prose-code:px-1 prose-code:rounded prose-pre:bg-mc-bg prose-pre:border prose-pre:border-mc-border">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="text-center text-mc-text-secondary py-8">
      <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
      <p>No content yet</p>
    </div>
  );
}
