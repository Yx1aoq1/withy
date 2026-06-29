import { existsSync, readlinkSync, symlinkSync, lstatSync, rmSync, mkdirSync } from 'node:fs';
import { relative, dirname, resolve } from 'node:path';
import { AGENT_PLATFORMS, CANONICAL_AGENT_DIR } from './registry.js';
import { scanAgentDirs } from '../store/agents.js';
import { parseFrontmatter, asString } from '../knowledge/frontmatter.js';
import { readTextFile, writeTextFile } from '../utils/index.js';
import type { AgentTool, RegisteredAgentPlatformConfig } from './registry.js';
import type { AgentDef, AgentFormat } from './types.js';
import type { Scope } from '../paths.js';

// ──────────────────────────────────────────────────────────────────────────
// Agent delivery — deploy a canonical role definition (.agents/agents/<role>.md)
// into each tool's own format. Format-driven: a small handler registry maps a
// platform's declared `format` to a delivery mechanism (markdown → file-level
// symlink; toml → generated file). A new tool is a registry entry (reuses a
// handler) or one new handler — the main loop never changes. design §4.2.
//
// Lives in core (not the CLI configurator) so both `withy init` and the web
// agents API deliver through one path — design §4.2 boundary fix.
// ──────────────────────────────────────────────────────────────────────────

// Per-platform delivery state for a role — feeds the web different-tool view (§4.4).
export type AgentDeliveryState = 'linked' | 'generated' | 'stale' | 'missing';

export interface AgentDeliveryStatus {
  platform: AgentTool;
  format: AgentFormat;
  // 投递目标文件,相对 scope 根(如 `.claude/agents/review.md`)。
  target: string;
  state: AgentDeliveryState;
}

// A canonical role read from .agents/agents/<role>.md (frontmatter + body).
interface CanonicalRole {
  name: string;
  description: string;
  body: string;
  file: string;
}

// A format handler delivers one canonical role to one target file, idempotently.
// Returns true when it wrote/updated the target, false when it was already current.
interface FormatHandler {
  // True when the existing target is current (delivery would be a no-op).
  isCurrent(role: CanonicalRole, targetFile: string): boolean;
  deliver(role: CanonicalRole, targetFile: string): void;
}

// markdown → file-level symlink to the canonical (Claude/Cursor). The skill linker
// is directory-level (`symlinkSync(...,'dir')`); a role is a single file, so this
// is a distinct file-level link — design §4.2.
const markdownHandler: FormatHandler = {
  isCurrent(role, targetFile) {
    if (!pathExists(targetFile)) return false;
    if (!isSymlink(targetFile)) return false;
    return readlinkSync(targetFile) === relative(dirname(targetFile), role.file);
  },
  deliver(role, targetFile) {
    mkdirSync(dirname(targetFile), { recursive: true });
    if (pathExists(targetFile)) rmSync(targetFile, { force: true });
    symlinkSync(relative(dirname(targetFile), role.file), targetFile);
  },
};

// toml → generated file (Codex). TOML can't symlink to Markdown, so the canonical
// is converted: frontmatter name/description + body → developer_instructions — §4.2.
const tomlHandler: FormatHandler = {
  isCurrent(role, targetFile) {
    if (!existsSync(targetFile)) return false;
    return readTextFile(targetFile) === renderCodexToml(role);
  },
  deliver(role, targetFile) {
    mkdirSync(dirname(targetFile), { recursive: true });
    writeTextFile(targetFile, renderCodexToml(role));
  },
};

const HANDLERS: Record<AgentFormat, FormatHandler> = { markdown: markdownHandler, toml: tomlHandler };

/**
 * Deploy canonical role definitions to every configured platform that declares an
 * `agentDef`. A platform is "configured" when its `configDir` exists in the project
 * (the tool is set up); roles come from canonical `.agents/agents/*.md`. Idempotent:
 * a target already current is skipped. Used by `withy init` and the web agents API.
 *
 * @param scope project scope
 * @param role optional single role to deploy (web save); omitted deploys all
 * @return the target paths written/updated this call (relative to scope root)
 */
export function deployAgents(scope: Scope, role?: string): string[] {
  const roles = readCanonicalRoles(scope).filter(r => !role || r.name === role);
  const written: string[] = [];

  for (const platform of platformsWithAgentDef()) {
    if (!existsSync(resolve(scope.root, platform.configDir))) continue; // tool not set up
    const def = platform.agentDef!;
    const handler = HANDLERS[def.format];
    for (const canonical of roles) {
      const targetFile = resolve(scope.root, def.target, `${canonical.name}.${formatExt(def.format)}`);
      if (handler.isCurrent(canonical, targetFile)) continue;
      handler.deliver(canonical, targetFile);
      written.push(relative(scope.root, targetFile));
    }
  }

  return written;
}

/**
 * Report a role's delivery state across every platform that declares an `agentDef`.
 * Backs the web different-tool view (§4.4): linked/generated when current, stale
 * when present but out of date, missing when absent or the tool is not set up.
 */
export function getAgentDeliveryStatus(scope: Scope, role: string): AgentDeliveryStatus[] {
  const canonical = readCanonicalRoles(scope).find(r => r.name === role);

  return platformsWithAgentDef().map(platform => {
    const def = platform.agentDef!;
    const targetFile = resolve(scope.root, def.target, `${role}.${formatExt(def.format)}`);
    const target = relative(scope.root, targetFile);
    const present = def.format === 'markdown' ? pathExists(targetFile) : existsSync(targetFile);
    if (!canonical || !present) return { platform: platform.id, format: def.format, target, state: 'missing' };
    const current = HANDLERS[def.format].isCurrent(canonical, targetFile);
    const state: AgentDeliveryState = current ? (def.format === 'markdown' ? 'linked' : 'generated') : 'stale';
    return { platform: platform.id, format: def.format, target, state };
  });
}

/** Remove a role's delivered copies across all platforms (web delete). Canonical stays. */
export function removeAgentDelivery(scope: Scope, role: string): string[] {
  const removed: string[] = [];
  for (const platform of platformsWithAgentDef()) {
    const def = platform.agentDef!;
    const targetFile = resolve(scope.root, def.target, `${role}.${formatExt(def.format)}`);
    if (!pathExists(targetFile)) continue;
    rmSync(targetFile, { force: true });
    removed.push(relative(scope.root, targetFile));
  }
  return removed;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function platformsWithAgentDef(): (RegisteredAgentPlatformConfig & { agentDef: AgentDef })[] {
  return Object.values(AGENT_PLATFORMS).filter((p): p is RegisteredAgentPlatformConfig & { agentDef: AgentDef } =>
    Boolean(p.agentDef),
  );
}

function formatExt(format: AgentFormat): string {
  return format === 'toml' ? 'toml' : 'md';
}

function readCanonicalRoles(scope: Scope): CanonicalRole[] {
  return scanAgentDirs(scope.root, [CANONICAL_AGENT_DIR]).map(scanned => {
    const { data, body } = parseFrontmatter(readTextFile(scanned.file));
    return {
      name: scanned.name,
      description: asString(data.description) ?? '',
      body: body.trim(),
      file: scanned.file,
    };
  });
}

// Render a canonical role as a Codex agent TOML (name/description/developer_instructions).
function renderCodexToml(role: CanonicalRole): string {
  return [
    `name = ${tomlString(role.name)}`,
    `description = ${tomlString(role.description)}`,
    `developer_instructions = ${tomlMultiline(role.body)}`,
    '',
  ].join('\n');
}

// A TOML basic string (escape backslash + double quote); inputs are single-line.
function tomlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// A TOML multi-line basic string; escape only backslash and a literal `"""` run.
function tomlMultiline(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
  return `"""\n${escaped}\n"""`;
}

function pathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}
