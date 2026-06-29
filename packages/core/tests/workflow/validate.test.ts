import { describe, expect, it } from 'vitest';
import { validateWorkflow } from '../../src/workflow/validate.js';
import { SkillNodeSchema, SwitchNodeSchema } from '../../src/types.js';
import type { Workflow } from '../../src/types.js';

describe('node agent field (schema)', () => {
  it('parses an optional agent on a skill node', () => {
    const node = SkillNodeSchema.parse({
      id: 'check',
      type: 'skill',
      skill: 'withy-check',
      agent: 'review',
      next: null,
    });
    expect(node.agent).toBe('review');
  });

  it('leaves agent undefined when omitted', () => {
    const node = SkillNodeSchema.parse({ id: 'dev', type: 'skill', skill: 'withy-dev', next: null });
    expect(node.agent).toBeUndefined();
  });

  it('switch nodes carry no agent field', () => {
    const node = SwitchNodeSchema.parse({
      id: 'triage',
      type: 'switch',
      branches: [{ label: 'a', next: null, default: true }],
      // an agent key on a switch is not part of the schema and is dropped
      agent: 'review',
    });
    expect('agent' in node).toBe(false);
  });
});

describe('validateWorkflow — agentExists', () => {
  const wf: Workflow = {
    id: 'test',
    entry: 'dev',
    phases: [{ id: 'execute' }],
    nodes: [
      { id: 'dev', type: 'skill', skill: 'withy-dev', agent: 'implement', phase: 'execute', next: 'check' },
      { id: 'check', type: 'skill', skill: 'withy-check', agent: 'ghost', phase: 'execute', next: null },
    ],
  };

  it('warns (does not block) on a dangling node agent', () => {
    const issues = validateWorkflow(wf, { agentExists: name => name === 'implement' });
    const agentIssues = issues.filter(i => i.message.includes('agent'));
    expect(agentIssues).toEqual([
      { level: 'warning', node: 'check', message: 'agent "ghost" not found in agent definitions' },
    ]);
    expect(agentIssues.every(i => i.level === 'warning')).toBe(true);
  });

  it('skips the agent check when no resolver is injected', () => {
    const issues = validateWorkflow(wf);
    expect(issues.some(i => i.message.includes('agent'))).toBe(false);
  });
});
