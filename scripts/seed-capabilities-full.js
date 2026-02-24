#!/usr/bin/env node
/**
 * seed-capabilities-full.js — Comprehensive seed for capabilities, agent_capabilities, and integrations
 *
 * Seeds ALL discovered tools, skills, browser automation, CLI tools, workflows,
 * and integrations from the vpsopenclaw inventory audit (2026-02-24).
 *
 * Idempotent: uses INSERT OR REPLACE (upsert) pattern.
 *
 * Env:
 *   DATABASE_PATH       - Path to mission-control.db
 *   WORKSPACE_BASE_PATH - Fallback for DB location
 *
 * Run: node scripts/seed-capabilities-full.js
 */

'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const WORKSPACE = process.env.WORKSPACE_BASE_PATH || '/home/node/.openclaw/workspace';
const DB_PATH = process.env.DATABASE_PATH || path.join(WORKSPACE, 'mission-control.db');

function now() {
  return new Date().toISOString();
}

// ─── Capability Definitions ─────────────────────────────────────────────────

const capabilities = [
  // === SKILLS (repo skills/ directory) ===
  {
    id: 'skill-coding-router',
    name: 'coding-router',
    category: 'skill',
    description: 'Mandatory routing layer for all coding tasks. Routes to Cursor, Claude Code, RALF TUI, Oz, or Codex backends.',
    provider: 'custom',
    is_shared: 0,
  },
  {
    id: 'skill-code-supervisor',
    name: 'code-supervisor',
    category: 'skill',
    description: 'Claude Code headless supervisor. Single-file bug fixes and small code changes via background process.',
    provider: 'custom',
    is_shared: 0,
  },
  {
    id: 'skill-cursor-supervisor',
    name: 'cursor-supervisor',
    category: 'skill',
    description: 'Cursor CLI agent supervisor via tmux. General coding with multi-model AI (GPT-5, Claude, Gemini).',
    provider: 'custom',
    is_shared: 0,
  },
  {
    id: 'skill-codex-supervisor',
    name: 'codex-supervisor',
    category: 'skill',
    description: 'OpenAI Codex headless supervisor. GPT model tasks via codex exec CLI.',
    provider: 'custom',
    is_shared: 0,
  },
  {
    id: 'skill-ralph-supervisor',
    name: 'ralph-supervisor',
    category: 'skill',
    description: 'RALF TUI multi-task orchestrator. PRD-driven autonomous coding projects.',
    provider: 'custom',
    is_shared: 0,
  },
  {
    id: 'skill-oz-supervisor',
    name: 'oz-supervisor',
    category: 'skill',
    description: 'Warp Oz cloud agent supervisor. Async background tasks on cloud VMs.',
    provider: 'custom',
    is_shared: 0,
  },
  {
    id: 'skill-email-router',
    name: 'email-router',
    category: 'skill',
    description: 'Route incoming emails from pho@agentmail.to to specialized handlers.',
    provider: 'custom',
    is_shared: 0,
  },
  {
    id: 'skill-agentmail',
    name: 'agentmail',
    category: 'skill',
    description: 'Email management via AgentMail API. Send, receive, manage, archive emails for pho@agentmail.to.',
    provider: 'custom',
    is_shared: 0,
  },
  {
    id: 'skill-meetings-organizer-v2',
    name: 'meetings-organizer-v2',
    category: 'skill',
    description: 'Classify Google Meet transcripts and move them to correct Drive folder via Apps Script API.',
    provider: 'custom',
    is_shared: 0,
  },
  {
    id: 'skill-meets-transcripts-organizer',
    name: 'meets-transcripts-organizer',
    category: 'skill',
    description: 'Process Gemini meeting note emails. Move Google Docs to Drive using browser relay.',
    provider: 'custom',
    is_shared: 0,
  },
  {
    id: 'skill-notion-tasks',
    name: 'notion-tasks',
    category: 'skill',
    description: 'Manage Notion workspace with direct API calls. Create/query/update tasks, pages, databases.',
    provider: 'custom',
    is_shared: 0,
  },
  {
    id: 'skill-system-consultor',
    name: 'system-consultor',
    category: 'skill',
    description: 'External diagnostic & repair agent. Runs Codex/Gemini/Claude to diagnose and fix system issues.',
    provider: 'custom',
    is_shared: 0,
  },
  {
    id: 'skill-browser-use',
    name: 'browser-use',
    category: 'skill',
    description: 'Browser-Use Cloud API automation. Cloud mode with persistent profiles, anti-detection.',
    provider: 'browser-use',
    is_shared: 1,
  },
  {
    id: 'skill-agent-browser',
    name: 'agent-browser',
    category: 'skill',
    description: 'Browser automation CLI wrapper. Delegates to browser-use remote mode.',
    provider: 'custom',
    is_shared: 1,
  },
  {
    id: 'skill-browserstack-automation',
    name: 'browserstack-automation',
    category: 'skill',
    description: 'Cross-browser screenshots, visual regression, video recording via BrowserStack.',
    provider: 'browserstack',
    is_shared: 0,
  },
  {
    id: 'skill-frontend-design',
    name: 'frontend-design',
    category: 'skill',
    description: 'Production-grade frontend interface design guidance. Avoids generic AI aesthetics.',
    provider: 'anthropic',
    is_shared: 0,
  },
  {
    id: 'skill-last30days',
    name: 'last30days',
    category: 'skill',
    description: 'Social media research tool for trends in Reddit, X, and web from the last 30 days.',
    provider: 'custom',
    is_shared: 0,
  },
  {
    id: 'skill-skill-creator',
    name: 'skill-creator',
    category: 'skill',
    description: 'Guide for creating effective skills. Extends Claude capabilities with specialized knowledge.',
    provider: 'custom',
    is_shared: 1,
  },
  {
    id: 'skill-krea-ai',
    name: 'krea-ai',
    category: 'skill',
    description: 'AI image/video generation via Krea.ai. Flux, ChatGPT Image, Ideogram, LoRA, video.',
    provider: 'krea.ai',
    is_shared: 0,
  },
  {
    id: 'skill-superdesign',
    name: 'superdesign',
    category: 'skill',
    description: 'SuperDesigner CLI for quick design assets: backgrounds, patterns, 3D shapes, OG images.',
    provider: 'superdesign',
    is_shared: 0,
  },

  // === VPS-INSTALLED SKILLS (from SKILLS-INSTALLED.md) ===
  {
    id: 'skill-writing-plans',
    name: 'writing-plans',
    category: 'skill',
    description: 'TDD implementation plans with bite-sized tasks. Each task: write failing test, verify, implement, verify, commit.',
    provider: 'obra/superpowers',
    is_shared: 1,
  },
  {
    id: 'skill-systematic-debugging',
    name: 'systematic-debugging',
    category: 'skill',
    description: 'Systematic debugging: root cause tracing, condition-based waiting, defense-in-depth, test pollution finder.',
    provider: 'obra/superpowers',
    is_shared: 1,
  },
  {
    id: 'skill-test-driven-development',
    name: 'test-driven-development',
    category: 'skill',
    description: 'Strict TDD workflow enforcement: Red-Green-Refactor. No production code without failing test.',
    provider: 'obra/superpowers',
    is_shared: 1,
  },
  {
    id: 'skill-supabase-postgres',
    name: 'supabase-postgres-best-practices',
    category: 'skill',
    description: 'Supabase Postgres: query performance, connection management, schema design, RLS, monitoring.',
    provider: 'supabase/agent-skills',
    is_shared: 1,
  },
  {
    id: 'skill-cloudflare',
    name: 'cloudflare',
    category: 'skill',
    description: 'Cloudflare platform: Workers, Pages, KV, D1, R2, AI.',
    provider: 'cloudflare/skills',
    is_shared: 1,
  },
  {
    id: 'skill-ai-agents-architect',
    name: 'ai-agents-architect',
    category: 'skill',
    description: 'AI agent architecture: ReAct loops, tool use, memory systems, multi-agent orchestration.',
    provider: 'sickn33/antigravity-awesome-skills',
    is_shared: 1,
  },
  {
    id: 'skill-security-auditor',
    name: 'security-auditor',
    category: 'skill',
    description: 'Security vulnerability scanner: dependency scanning, secret detection, OWASP Top 10 SAST.',
    provider: 'erichowens/some_claude_skills',
    is_shared: 1,
  },
  {
    id: 'skill-github-actions-expert',
    name: 'github-actions-expert',
    category: 'skill',
    description: 'GitHub Actions CI/CD: workflow YAML, matrix builds, caching, OIDC security.',
    provider: 'cin12211/orca-q',
    is_shared: 1,
  },
  {
    id: 'skill-copywriting',
    name: 'copywriting',
    category: 'skill',
    description: 'Copywriting frameworks: AIDA, PAS, BAB, 4Ps. Headlines, CTAs, email sequences.',
    provider: 'coreyhaines31/marketingskills',
    is_shared: 0,
  },
  {
    id: 'skill-content-strategy',
    name: 'content-strategy',
    category: 'skill',
    description: 'Content planning, editorial calendars, content pillars.',
    provider: 'coreyhaines31/marketingskills',
    is_shared: 0,
  },
  {
    id: 'skill-product-marketing-context',
    name: 'product-marketing-context',
    category: 'skill',
    description: 'Positioning, messaging, value props, competitive positioning.',
    provider: 'coreyhaines31/marketingskills',
    is_shared: 0,
  },
  {
    id: 'skill-seo-audit',
    name: 'seo-audit',
    category: 'skill',
    description: 'Full SEO audit checklists: technical SEO, on-page, off-page.',
    provider: 'coreyhaines31/marketingskills',
    is_shared: 0,
  },
  {
    id: 'skill-programmatic-seo',
    name: 'programmatic-seo',
    category: 'skill',
    description: 'Scalable/programmatic SEO: templates, automation, data-driven pages.',
    provider: 'coreyhaines31/marketingskills',
    is_shared: 0,
  },
  {
    id: 'skill-marketing-psychology',
    name: 'marketing-psychology',
    category: 'skill',
    description: '70+ mental models for marketing: cognitive biases, persuasion, decision-making.',
    provider: 'skills.sh',
    is_shared: 0,
  },
  {
    id: 'skill-remotion-best-practices',
    name: 'remotion-best-practices',
    category: 'skill',
    description: 'React video framework: compositions, animations, audio, subtitles, templates.',
    provider: 'remotion (official)',
    is_shared: 0,
  },
  {
    id: 'skill-radio-producer',
    name: 'radio-producer',
    category: 'skill',
    description: 'Radio interview briefing generator.',
    provider: 'custom',
    is_shared: 0,
  },
  {
    id: 'skill-cua-desktop',
    name: 'cua-desktop',
    category: 'skill',
    description: 'CUA cloud sandbox runner. Ephemeral Linux/Windows desktop VMs for automation.',
    provider: 'cua.ai',
    is_shared: 0,
  },

  // === CLI TOOLS ===
  {
    id: 'cli-op',
    name: '1Password CLI (op)',
    category: 'cli_tool',
    description: 'Secret management CLI. Read credentials from Openclaw vault.',
    provider: '1password',
    is_shared: 1,
  },
  {
    id: 'cli-gog',
    name: 'Google CLI (gog)',
    category: 'cli_tool',
    description: 'Google Workspace CLI: Gmail, Calendar, Drive, Sheets, Contacts, Tasks.',
    provider: 'gogcli',
    is_shared: 0,
  },
  {
    id: 'cli-firecrawl',
    name: 'Firecrawl CLI',
    category: 'cli_tool',
    description: 'Web scraping, search, and deep research CLI.',
    provider: 'firecrawl',
    is_shared: 1,
  },
  {
    id: 'cli-browser-use',
    name: 'browser-use CLI',
    category: 'cli_tool',
    description: 'Browser automation CLI. Local headless, real Chrome, or cloud remote modes.',
    provider: 'browser-use',
    is_shared: 1,
  },
  {
    id: 'cli-summarize',
    name: 'Summarize CLI',
    category: 'cli_tool',
    description: 'Summarize URLs, YouTube videos, podcasts, PDFs using LLM providers.',
    provider: '@steipete/summarize',
    is_shared: 1,
  },
  {
    id: 'cli-uv',
    name: 'uv (Python)',
    category: 'cli_tool',
    description: 'Fast Python package manager and virtual environment tool.',
    provider: 'astral',
    is_shared: 1,
  },
  {
    id: 'cli-yt-dlp',
    name: 'yt-dlp',
    category: 'cli_tool',
    description: 'YouTube audio/video downloader. Used with residential proxy.',
    provider: 'yt-dlp',
    is_shared: 0,
  },
  {
    id: 'cli-wrangler',
    name: 'Wrangler CLI',
    category: 'cli_tool',
    description: 'Cloudflare Workers deployment and management CLI.',
    provider: 'cloudflare',
    is_shared: 0,
  },
  {
    id: 'cli-claude',
    name: 'Claude Code CLI',
    category: 'cli_tool',
    description: 'Claude Code for headless coding sessions inside container.',
    provider: 'anthropic',
    is_shared: 0,
  },
  {
    id: 'cli-cursor-agent',
    name: 'Cursor Agent CLI',
    category: 'cli_tool',
    description: 'Cursor CLI agent for coding tasks via tmux.',
    provider: 'cursor',
    is_shared: 0,
  },
  {
    id: 'cli-codex',
    name: 'Codex CLI',
    category: 'cli_tool',
    description: 'OpenAI Codex CLI for GPT-powered coding tasks.',
    provider: 'openai',
    is_shared: 0,
  },
  {
    id: 'cli-ralph-tui',
    name: 'RALF TUI',
    category: 'cli_tool',
    description: 'Multi-task PRD-driven coding orchestrator.',
    provider: 'ralf',
    is_shared: 0,
  },
  {
    id: 'cli-superdesign',
    name: 'SuperDesigner CLI',
    category: 'cli_tool',
    description: 'Quick design assets: backgrounds, patterns, 3D shapes, OG images.',
    provider: 'superdesign',
    is_shared: 0,
  },

  // === BROWSER AUTOMATION ===
  {
    id: 'browser-use-cloud',
    name: 'Browser-Use Cloud API',
    category: 'browser_automation',
    description: 'Cloud browser with persistent profiles, anti-detection, residential proxies. Primary for DDoS-Guard sites.',
    provider: 'browser-use',
    is_shared: 1,
  },
  {
    id: 'browser-openclaw-headless',
    name: 'OpenClaw Native Browser (headless)',
    category: 'browser_automation',
    description: 'Headless Chrome (chrome-headless-shell) with 1440x900 viewport. Default for general browsing.',
    provider: 'openclaw',
    is_shared: 1,
  },
  {
    id: 'browser-openclaw-chrome',
    name: 'OpenClaw Native Browser (chrome relay)',
    category: 'browser_automation',
    description: 'Chrome extension relay to users real Brave/Chrome browser. For authenticated sites.',
    provider: 'openclaw',
    is_shared: 1,
  },
  {
    id: 'browser-browserstack',
    name: 'BrowserStack Testing',
    category: 'browser_automation',
    description: 'Cross-browser/device testing. 3500+ real browsers/devices. Screenshots, video, Percy visual regression.',
    provider: 'browserstack',
    is_shared: 0,
  },
  {
    id: 'browser-cua-desktop',
    name: 'CUA Desktop Sandboxes',
    category: 'browser_automation',
    description: 'Cloud desktop VMs (Linux/Windows) for computer use automation. 1000 credits available.',
    provider: 'cua.ai',
    is_shared: 0,
  },

  // === MCP SERVERS ===
  {
    id: 'mcp-perplexity',
    name: 'Perplexity Search MCP',
    category: 'mcp_server',
    description: 'Structured AI-powered search with cited sources via Smithery HTTP proxy.',
    provider: 'perplexity',
    is_shared: 1,
  },
  {
    id: 'mcp-notion',
    name: 'Notion MCP',
    category: 'mcp_server',
    description: 'Notion workspace integration via Smithery HTTP proxy. Create/read/update pages.',
    provider: 'notion',
    is_shared: 1,
  },
  {
    id: 'mcp-context7',
    name: 'Context7 MCP',
    category: 'mcp_server',
    description: 'Library documentation lookups. Free tier, no auth needed.',
    provider: 'context7',
    is_shared: 1,
  },

  // === WORKFLOW (lobster scripts) ===
  {
    id: 'workflow-daily-libs-update',
    name: 'daily-libs-update',
    category: 'workflow',
    description: 'Daily reinstall of ephemeral CLI tools (summarize, yt-dlp, deno, browser-use, etc.).',
    provider: 'lobster/cron',
    is_shared: 1,
  },
  {
    id: 'workflow-health-checks',
    name: 'health-checks',
    category: 'workflow',
    description: 'System health checks for container, sessions, tools, and services.',
    provider: 'lobster/cron',
    is_shared: 1,
  },
  {
    id: 'workflow-email-check',
    name: 'email-check',
    category: 'workflow',
    description: 'Periodic check of pho@agentmail.to inbox for new messages.',
    provider: 'lobster/cron',
    is_shared: 1,
  },
  {
    id: 'workflow-scan-daily-intel',
    name: 'scan-daily-intel',
    category: 'workflow',
    description: 'Scan daily intelligence reports across agent workspaces.',
    provider: 'lobster/cron',
    is_shared: 1,
  },
  {
    id: 'workflow-argus-proactive',
    name: 'argus-proactive',
    category: 'workflow',
    description: 'Proactive Argus maintenance: stale initiatives, escalation watching.',
    provider: 'lobster/cron',
    is_shared: 1,
  },
  {
    id: 'workflow-system-consultor',
    name: 'system-consultor',
    category: 'workflow',
    description: 'External diagnostic agent run. Launches Codex/Gemini/Claude for system repair.',
    provider: 'lobster/manual',
    is_shared: 1,
  },
  {
    id: 'workflow-post-container-bootstrap',
    name: 'post-container-bootstrap',
    category: 'workflow',
    description: 'Container bootstrap after restart: restore symlinks, configs, tools.',
    provider: 'lobster/startup',
    is_shared: 1,
  },

  // === CREDENTIAL PROVIDERS ===
  {
    id: 'credential-1password',
    name: '1Password Vault',
    category: 'credential_provider',
    description: 'Openclaw vault with all service credentials. CLI at /home/node/.openclaw/bin/op.',
    provider: '1password',
    is_shared: 1,
  },
];

// ─── Agent-Capability Mappings ──────────────────────────────────────────────

const agentCapabilities = [
  // Pho (Commander) — has everything
  { agent_id: 'pho', capabilities: [
    'skill-coding-router', 'skill-code-supervisor', 'skill-cursor-supervisor',
    'skill-codex-supervisor', 'skill-ralph-supervisor', 'skill-oz-supervisor',
    'skill-email-router', 'skill-agentmail', 'skill-meetings-organizer-v2',
    'skill-meets-transcripts-organizer', 'skill-notion-tasks', 'skill-system-consultor',
    'skill-browser-use', 'skill-agent-browser', 'skill-krea-ai', 'skill-superdesign',
    'cli-op', 'cli-gog', 'cli-firecrawl', 'cli-summarize', 'cli-claude',
    'browser-use-cloud', 'browser-openclaw-headless', 'browser-openclaw-chrome',
    'mcp-perplexity', 'mcp-notion', 'credential-1password',
  ]},

  // Apollo (Marketing)
  { agent_id: 'apollo', capabilities: [
    'skill-browser-use', 'skill-agent-browser', 'skill-browserstack-automation',
    'skill-krea-ai', 'skill-superdesign', 'skill-last30days', 'skill-frontend-design',
    'skill-copywriting', 'skill-content-strategy', 'skill-product-marketing-context',
    'skill-seo-audit', 'skill-programmatic-seo', 'skill-marketing-psychology',
    'skill-remotion-best-practices',
    'cli-firecrawl', 'cli-summarize', 'cli-superdesign',
    'browser-use-cloud', 'browser-openclaw-headless', 'browser-browserstack',
  ]},

  // Hephaestus (Developer)
  { agent_id: 'hephaestus', capabilities: [
    'skill-coding-router', 'skill-code-supervisor', 'skill-cursor-supervisor',
    'skill-codex-supervisor', 'skill-ralph-supervisor', 'skill-oz-supervisor',
    'skill-browser-use', 'skill-agent-browser', 'skill-browserstack-automation',
    'skill-superdesign', 'skill-frontend-design', 'skill-cua-desktop',
    'skill-writing-plans', 'skill-systematic-debugging', 'skill-test-driven-development',
    'cli-firecrawl', 'cli-summarize', 'cli-claude', 'cli-cursor-agent', 'cli-codex',
    'cli-ralph-tui', 'cli-superdesign',
    'browser-use-cloud', 'browser-openclaw-headless', 'browser-browserstack',
    'browser-cua-desktop',
  ]},

  // Ares (QA)
  { agent_id: 'ares', capabilities: [
    'skill-browser-use', 'skill-agent-browser', 'skill-browserstack-automation',
    'cli-firecrawl', 'cli-summarize',
    'browser-use-cloud', 'browser-openclaw-headless', 'browser-browserstack',
  ]},

  // Artemis (Research)
  { agent_id: 'artemis', capabilities: [
    'skill-browser-use', 'skill-agent-browser', 'skill-last30days',
    'cli-firecrawl', 'cli-summarize',
    'browser-use-cloud', 'browser-openclaw-headless',
    'mcp-perplexity',
  ]},

  // Athena (CTO)
  { agent_id: 'athena', capabilities: [
    'skill-browser-use', 'skill-agent-browser', 'skill-frontend-design',
    'cli-firecrawl', 'cli-summarize',
    'browser-use-cloud', 'browser-openclaw-headless',
  ]},

  // Hermes (PM)
  { agent_id: 'hermes', capabilities: [
    'skill-browser-use', 'skill-agent-browser',
    'cli-firecrawl', 'cli-summarize',
    'browser-use-cloud', 'browser-openclaw-headless',
  ]},

  // Argus (Ops)
  { agent_id: 'argus', capabilities: [
    'skill-browser-use', 'skill-agent-browser',
    'cli-op', 'cli-gog', 'cli-wrangler', 'cli-summarize',
    'browser-use-cloud', 'browser-openclaw-headless',
    'credential-1password',
    'workflow-daily-libs-update', 'workflow-health-checks',
    'workflow-argus-proactive', 'workflow-post-container-bootstrap',
  ]},

  // Plutus (CFO)
  { agent_id: 'plutus', capabilities: [
    'skill-browser-use', 'skill-agent-browser',
    'cli-op', 'cli-gog', 'cli-firecrawl', 'cli-summarize',
    'browser-use-cloud', 'browser-openclaw-headless',
    'credential-1password',
  ]},

  // Themis (Code Review)
  { agent_id: 'themis', capabilities: [
    'skill-browser-use', 'skill-agent-browser', 'skill-browserstack-automation',
    'skill-security-auditor',
    'cli-firecrawl', 'cli-summarize',
    'browser-use-cloud', 'browser-openclaw-headless', 'browser-browserstack',
  ]},

  // ElGrupito (Product Owner)
  { agent_id: 'elgrupito', capabilities: [
    'skill-browser-use', 'skill-agent-browser',
    'cli-summarize',
    'browser-use-cloud', 'browser-openclaw-headless',
  ]},

  // Innovaly (Product Owner + AE)
  { agent_id: 'innovaly', capabilities: [
    'skill-browser-use', 'skill-agent-browser', 'skill-notion-tasks',
    'skill-frontend-design',
    'cli-gog', 'cli-firecrawl', 'cli-summarize',
    'browser-use-cloud', 'browser-openclaw-headless',
    'mcp-notion',
  ]},

  // Ventanal (EA + Product Owner)
  { agent_id: 'ventanal', capabilities: [
    'skill-browser-use', 'skill-agent-browser', 'skill-notion-tasks',
    'skill-frontend-design',
    'cli-firecrawl', 'cli-summarize',
    'browser-use-cloud', 'browser-openclaw-headless',
    'mcp-notion',
  ]},

  // Personal (Copilot)
  { agent_id: 'personal', capabilities: [
    'skill-coding-router', 'skill-browser-use', 'skill-agent-browser',
    'skill-notion-tasks', 'skill-last30days', 'skill-radio-producer',
    'skill-frontend-design',
    'cli-gog', 'cli-firecrawl', 'cli-summarize', 'cli-claude',
    'browser-use-cloud', 'browser-openclaw-headless', 'browser-openclaw-chrome',
    'mcp-perplexity', 'mcp-notion',
  ]},
];

// ─── Integration Definitions ────────────────────────────────────────────────

const integrations = [
  {
    id: 'integration-1password',
    name: '1Password',
    type: 'credential_provider',
    provider: '1password',
    credential_source: 'OP_SERVICE_ACCOUNT_TOKEN',
    config: { cli: 'op', vault: 'Openclaw', auth_check: 'op whoami' },
    metadata: { description: '1Password CLI for credential management', persistent: true },
  },
  {
    id: 'integration-notion',
    name: 'Notion',
    type: 'mcp_plugin',
    provider: 'notion',
    credential_source: '1password:Openclaw/Notion - integration API',
    config: { vault: 'Openclaw', item: 'Notion - integration API', field: 'credential' },
    metadata: { description: 'Notion workspace integration via MCP plugin' },
  },
  {
    id: 'integration-slack',
    name: 'Slack',
    type: 'api_key',
    provider: 'slack',
    credential_source: 'openclaw.json:SLACK_BOT_TOKEN',
    config: { env_var: 'SLACK_BOT_TOKEN', channels: 30 },
    metadata: { description: 'Slack bot integration for 30+ channels' },
  },
  {
    id: 'integration-whatsapp',
    name: 'WhatsApp',
    type: 'webhook',
    provider: 'openclaw-gateway',
    credential_source: 'built-in',
    config: { channel: 'whatsapp', protocol: 'openclaw-gateway' },
    metadata: { description: 'Primary user messaging channel via OpenClaw gateway' },
  },
  {
    id: 'integration-telegram',
    name: 'Telegram',
    type: 'webhook',
    provider: 'openclaw-gateway',
    credential_source: 'built-in',
    config: { channel: 'telegram', protocol: 'openclaw-gateway' },
    metadata: { description: 'Secondary messaging channel via OpenClaw gateway' },
  },
  {
    id: 'integration-google-workspace',
    name: 'Google Workspace',
    type: 'cli_auth',
    provider: 'google',
    credential_source: 'gog:OAuth2',
    config: { cli: 'gog', account: 'david.atias.m@gmail.com', auth_check: 'gog auth status' },
    metadata: { description: 'Gmail, Calendar, Drive, Sheets, Contacts, Tasks via gog CLI' },
  },
  {
    id: 'integration-agentmail',
    name: 'AgentMail',
    type: 'api_key',
    provider: 'agentmail',
    credential_source: '.env:AGENTMAIL_API_KEY',
    config: { env_var: 'AGENTMAIL_API_KEY', inbox: 'pho@agentmail.to' },
    metadata: { description: 'Email for AI agents at pho@agentmail.to' },
  },
  {
    id: 'integration-firecrawl',
    name: 'Firecrawl',
    type: 'api_key',
    provider: 'firecrawl',
    credential_source: '.env:FIRECRAWL_API_KEY',
    config: { env_var: 'FIRECRAWL_API_KEY', credits_remaining: 80000 },
    metadata: { description: 'Web scraping and search API' },
  },
  {
    id: 'integration-browser-use',
    name: 'Browser-Use Cloud',
    type: 'api_key',
    provider: 'browser-use',
    credential_source: '1password:Openclaw/Browser-use API',
    config: { api_base: 'https://api.browser-use.com/api/v2' },
    metadata: { description: 'Cloud browser automation with persistent profiles' },
  },
  {
    id: 'integration-browserstack',
    name: 'BrowserStack',
    type: 'api_key',
    provider: 'browserstack',
    credential_source: '1password:Openclaw/BrowserStack API',
    config: { plan: 'Trial', expires: '2026-12-24', parallel_sessions: 1 },
    metadata: { description: 'Cross-browser/device testing. 3500+ devices.' },
  },
  {
    id: 'integration-krea',
    name: 'Krea.ai',
    type: 'api_key',
    provider: 'krea.ai',
    credential_source: '1password:Openclaw/Krea.ai',
    config: { plan: 'Pro', cost: '$35/mo', account: 'jackvds53@hotmail.com' },
    metadata: { description: 'AI image/video generation. Flux, ChatGPT Image, Ideogram, LoRA.' },
  },
  {
    id: 'integration-cua',
    name: 'CUA Desktop',
    type: 'api_key',
    provider: 'cua.ai',
    credential_source: '1password:Openclaw/CUA API key',
    config: { credits: 1000, api_base: 'https://api.cua.ai/v1' },
    metadata: { description: 'Cloud desktop VMs for computer use automation' },
  },
  {
    id: 'integration-brave-search',
    name: 'Brave Search',
    type: 'api_key',
    provider: 'brave',
    credential_source: '.env:BRAVE_API_KEY',
    config: { env_var: 'BRAVE_API_KEY' },
    metadata: { description: 'Web search API via Brave. Built-in web_search tool.' },
  },
  {
    id: 'integration-perplexity',
    name: 'Perplexity AI',
    type: 'api_key',
    provider: 'perplexity',
    credential_source: '.env:PERPLEXITY_API_KEY',
    config: { env_var: 'PERPLEXITY_API_KEY' },
    metadata: { description: 'AI-powered search with cited sources' },
  },
  {
    id: 'integration-openai',
    name: 'OpenAI',
    type: 'api_key',
    provider: 'openai',
    credential_source: '.env:OPENAI_API_KEY',
    config: { env_var: 'OPENAI_API_KEY', services: ['whisper', 'gpt', 'codex'] },
    metadata: { description: 'Whisper transcription, GPT models, Codex' },
  },
  {
    id: 'integration-xai',
    name: 'xAI (Grok)',
    type: 'api_key',
    provider: 'xai',
    credential_source: '.env:XAI_API_KEY',
    config: { env_var: 'XAI_API_KEY' },
    metadata: { description: 'X/Twitter research via Grok' },
  },
  {
    id: 'integration-groq',
    name: 'Groq',
    type: 'api_key',
    provider: 'groq',
    credential_source: '.env:GROQ_API_KEY',
    config: { env_var: 'GROQ_API_KEY' },
    metadata: { description: 'Fast LLM inference' },
  },
  {
    id: 'integration-elevenlabs',
    name: 'ElevenLabs',
    type: 'api_key',
    provider: 'elevenlabs',
    credential_source: '1password:Openclaw/ElevenLabs API',
    config: { format: 'ogg/opus', quality: '48kHz/64kbps' },
    metadata: { description: 'Text-to-speech voice notes (OGG/Opus for WhatsApp)' },
  },
  {
    id: 'integration-proxy-man',
    name: 'Proxy-man.com',
    type: 'api_key',
    provider: 'proxy-man',
    credential_source: '.env:PROXY_MAN_TOKEN',
    config: { env_var: 'PROXY_MAN_TOKEN', type: 'residential', region: 'Colombia' },
    metadata: { description: 'Residential proxy for YouTube downloads. Metered traffic.' },
  },
  {
    id: 'integration-privy',
    name: 'Privy (Crypto Wallet)',
    type: 'api_key',
    provider: 'privy',
    credential_source: '1password:Openclaw/Privy.io',
    config: { wallet: '0xa6DAb3C3403429fdf639C2f99dc05395023f7E80', chain: 'Base L2 (8453)' },
    metadata: { description: 'Crypto wallet on Base L2. Conservative policy: max 0.005 ETH/tx.' },
  },
  {
    id: 'integration-warp-oz',
    name: 'Warp Oz',
    type: 'api_key',
    provider: 'warp',
    credential_source: '.env:WARP_API_KEY',
    config: { env_var: 'WARP_API_KEY', api_base: 'https://app.warp.dev/api/v1' },
    metadata: { description: 'Cloud coding VMs for async background tasks' },
  },
  {
    id: 'integration-anthropic',
    name: 'Anthropic',
    type: 'api_key',
    provider: 'anthropic',
    credential_source: '1password:Openclaw/Anthropic API',
    config: { plan: '$200/mo max' },
    metadata: { description: 'Claude API for coding agents and sessions' },
  },
];

// ─── Entry Point ─────────────────────────────────────────────────────────────

function main() {
  const start = Date.now();
  console.log('[seed-full] Starting comprehensive seed at ' + now());

  if (!fs.existsSync(DB_PATH)) {
    console.error('[seed-full] Database not found at ' + DB_PATH);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  try {
    // ── Seed capabilities ──
    const upsertCap = db.prepare(`
      INSERT INTO capabilities (
        id, name, category, description, provider, version,
        install_path, config_ref, is_shared, status, metadata,
        created_at, updated_at
      )
      VALUES (
        @id, @name, @category, @description, @provider, @version,
        @install_path, @config_ref, @is_shared, @status, @metadata,
        @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        name         = excluded.name,
        category     = excluded.category,
        description  = excluded.description,
        provider     = excluded.provider,
        version      = excluded.version,
        is_shared    = excluded.is_shared,
        metadata     = excluded.metadata,
        updated_at   = excluded.updated_at
    `);

    const seedCaps = db.transaction(function (items) {
      var count = 0;
      for (var i = 0; i < items.length; i++) {
        var cap = items[i];
        upsertCap.run({
          id: cap.id,
          name: cap.name,
          category: cap.category,
          description: cap.description || null,
          provider: cap.provider || null,
          version: cap.version || null,
          install_path: cap.install_path || null,
          config_ref: cap.config_ref || null,
          is_shared: cap.is_shared !== undefined ? cap.is_shared : 1,
          status: 'unknown',
          metadata: cap.metadata ? JSON.stringify(cap.metadata) : null,
          created_at: now(),
          updated_at: now(),
        });
        count++;
      }
      return count;
    });

    var capCount = seedCaps(capabilities);
    console.log('[seed-full] Capabilities seeded: ' + capCount);

    // ── Seed agent-capability mappings ──
    const upsertAgentCap = db.prepare(`
      INSERT INTO agent_capabilities (agent_id, capability_id, enabled)
      VALUES (@agent_id, @capability_id, 1)
      ON CONFLICT(agent_id, capability_id) DO UPDATE SET
        enabled = 1
    `);

    const seedAgentCaps = db.transaction(function (mappings) {
      var count = 0;
      for (var i = 0; i < mappings.length; i++) {
        var mapping = mappings[i];
        // Check if agent exists
        var agentExists = db.prepare('SELECT 1 FROM agents WHERE id = ?').get(mapping.agent_id);
        if (!agentExists) {
          console.warn('[seed-full]   Agent not found: ' + mapping.agent_id + ' (skipping ' + mapping.capabilities.length + ' mappings)');
          continue;
        }

        for (var j = 0; j < mapping.capabilities.length; j++) {
          var capId = mapping.capabilities[j];
          // Check if capability exists
          var capExists = db.prepare('SELECT 1 FROM capabilities WHERE id = ?').get(capId);
          if (!capExists) {
            console.warn('[seed-full]   Capability not found: ' + capId);
            continue;
          }
          upsertAgentCap.run({ agent_id: mapping.agent_id, capability_id: capId });
          count++;
        }
      }
      return count;
    });

    var agentCapCount = seedAgentCaps(agentCapabilities);
    console.log('[seed-full] Agent-capability mappings seeded: ' + agentCapCount);

    // ── Seed integrations ──
    const upsertIntegration = db.prepare(`
      INSERT INTO integrations (
        id, name, type, provider, status,
        credential_source, config, metadata,
        created_at, updated_at
      )
      VALUES (
        @id, @name, @type, @provider, @status,
        @credential_source, @config, @metadata,
        @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        name              = excluded.name,
        type              = excluded.type,
        provider          = excluded.provider,
        credential_source = excluded.credential_source,
        config            = excluded.config,
        metadata          = excluded.metadata,
        updated_at        = excluded.updated_at
    `);

    const seedIntegrations = db.transaction(function (items) {
      var count = 0;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        upsertIntegration.run({
          id: item.id,
          name: item.name,
          type: item.type,
          provider: item.provider,
          status: 'unknown',
          credential_source: item.credential_source || null,
          config: item.config ? JSON.stringify(item.config) : null,
          metadata: item.metadata ? JSON.stringify(item.metadata) : null,
          created_at: now(),
          updated_at: now(),
        });
        count++;
      }
      return count;
    });

    var intCount = seedIntegrations(integrations);
    console.log('[seed-full] Integrations seeded: ' + intCount);

    var elapsed = Date.now() - start;
    console.log('[seed-full] Complete in ' + elapsed + 'ms — capabilities=' + capCount + ' agent_mappings=' + agentCapCount + ' integrations=' + intCount);

  } catch (err) {
    console.error('[seed-full] Fatal error: ' + err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
