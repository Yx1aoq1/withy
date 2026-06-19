import { describe, expect, it } from 'vitest';
import {
  approveState,
  deriveStatus,
  describeNext,
  rewindState,
  gateGuardId,
  stepWorkflow,
  compileWorkflow,
  nodeById,
  phaseOf,
} from './interpret.js';
import type { GuardReport } from './engine.js';
import type { State, Workflow } from '../types.js';

// triage(switch) → standard:plan → dev → finish, or small → dev. plan has an
// approval gate so the skill-gate path is exercised.
const WF: Workflow = {
  id: 'test',
  entry: 'triage',
  phases: [
    { id: 'planning', label: 'Planning' },
    { id: 'execute', label: 'Execute' },
    { id: 'finish', label: 'Finish' },
  ],
  nodes: [
    {
      id: 'triage',
      type: 'switch',
      phase: null,
      branches: [
        { label: 'standard', criteria: 'a real feature', next: 'plan', default: true },
        { label: 'small', criteria: 'a one-liner', next: 'dev' },
      ],
    },
    { id: 'plan', type: 'skill', skill: 'grill-me', phase: 'planning', next: 'dev', gate: { approval: true } },
    { id: 'dev', type: 'skill', skill: 'dev', phase: 'execute', next: 'finish' },
    { id: 'finish', type: 'skill', skill: 'finish', phase: 'finish', next: null },
  ],
};

function state(currentNode: string | null, over: Partial<State> = {}): State {
  return {
    taskId: 't',
    currentNode,
    completedNodes: [],
    decisions: {},
    approvals: {},
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const pass: GuardReport = {};
const blockPlan: GuardReport = {
  [gateGuardId('plan')]: { ok: false, reasons: ['needs approval: run "withy approve"'] },
};

describe('compileWorkflow', () => {
  it('flattens a switch into one labeled edge per branch', () => {
    const def = compileWorkflow(WF);
    const triage = def.nodes.find(n => n.id === 'triage')!;
    expect(triage.transitions.map(t => ({ on: t.on, target: t.target, default: t.default }))).toEqual([
      { on: 'standard', target: 'plan', default: true },
      { on: 'small', target: 'dev', default: undefined },
    ]);
  });

  it('flattens a gated skill into one guarded `advance` edge', () => {
    const def = compileWorkflow(WF);
    const plan = def.nodes.find(n => n.id === 'plan')!;
    expect(plan.transitions).toEqual([{ on: 'advance', target: 'dev', guard: gateGuardId('plan'), default: true }]);
    const dev = def.nodes.find(n => n.id === 'dev')!;
    expect(dev.transitions[0].guard).toBeUndefined(); // no gate → no guard ref
  });

  it('entry maps to the machine initial state', () => {
    expect(compileWorkflow(WF).initial).toBe('triage');
  });
});

describe('stepWorkflow — skill nodes', () => {
  it('advances a clear gate and emits an ok attempt', () => {
    const r = stepWorkflow(WF, state('dev'), { kind: 'advance' }, pass);
    expect(r.ok).toBe(true);
    expect(r.state?.currentNode).toBe('finish');
    expect(r.events[0]).toMatchObject({ type: 'complete_attempt', node: 'dev', ok: true });
  });

  it('blocks (no state change) when the gate guard fails', () => {
    const r = stepWorkflow(WF, state('plan'), { kind: 'advance' }, blockPlan);
    expect(r.ok).toBe(false);
    expect(r.state).toBeUndefined();
    expect(r.blocked).toEqual(['needs approval: run "withy approve"']);
    expect(r.events[0]).toMatchObject({ type: 'complete_attempt', node: 'plan', ok: false });
  });
});

describe('stepWorkflow — switch nodes', () => {
  it('reports branches and does not advance when no branch is given', () => {
    const r = stepWorkflow(WF, state('triage'), { kind: 'advance' });
    expect(r.ok).toBe(false);
    expect(r.needsBranch).toBe(true);
    expect(r.branches?.map(b => b.label)).toEqual(['standard', 'small']);
    expect(r.nextAction).toContain('withy next --branch');
  });

  it('rejects an unknown branch label', () => {
    const r = stepWorkflow(WF, state('triage'), { kind: 'branch', label: 'bogus' });
    expect(r.ok).toBe(false);
    expect(r.needsBranch).toBeUndefined();
    expect(r.blocked?.[0]).toContain('is not a branch');
  });

  it('routes a valid branch, records the decision + event', () => {
    const r = stepWorkflow(WF, state('triage'), { kind: 'branch', label: 'small', reason: 'tiny', by: 'me' });
    expect(r.ok).toBe(true);
    expect(r.state?.currentNode).toBe('dev');
    expect(r.state?.decisions.triage).toMatchObject({ branch: 'small', reason: 'tiny', by: 'me' });
    expect(r.events[0]).toMatchObject({ type: 'decision', node: 'triage', branch: 'small' });
  });
});

describe('stepWorkflow — skip & edges', () => {
  it('skip advances via the default edge and emits a skip event', () => {
    const r = stepWorkflow(WF, state('plan'), { kind: 'skip', by: 'me', reason: 'gate misconfigured' });
    expect(r.ok).toBe(true);
    expect(r.state?.currentNode).toBe('dev');
    expect(r.events[0]).toMatchObject({ type: 'skip', node: 'plan', reason: 'gate misconfigured' });
  });

  it('skip on a switch takes the default branch', () => {
    const r = stepWorkflow(WF, state('triage'), { kind: 'skip', reason: 'force default' });
    expect(r.state?.currentNode).toBe('plan'); // default = standard → plan
  });

  it('is a no-op when the task is already done', () => {
    expect(stepWorkflow(WF, state(null), { kind: 'advance' })).toEqual({ ok: true, node: null, events: [] });
  });

  it('rejects an unknown cursor node', () => {
    const r = stepWorkflow(WF, state('ghost'), { kind: 'advance' });
    expect(r.ok).toBe(false);
    expect(r.blocked?.[0]).toContain('is not a node');
  });
});

describe('rewindState / approveState', () => {
  it('rewind restores the cursor and prunes downstream decision/approvals', () => {
    const before = state('finish', {
      completedNodes: ['triage', 'plan', 'dev'],
      decisions: { triage: { branch: 'standard', at: '2026-01-01T00:00:00.000Z' } },
      approvals: { plan: { approvedAt: '2026-01-01T00:00:00.000Z', by: 'me' } },
    });
    const after = rewindState(WF, before, 'triage');
    expect(after.currentNode).toBe('triage');
    expect(after.completedNodes).toEqual([]);
    expect(after.decisions.triage).toBeUndefined();
    expect(after.approvals.plan).toBeUndefined();
  });

  it('rewind throws on an unknown target', () => {
    expect(() => rewindState(WF, state('dev'), 'ghost')).toThrow(/unknown state/);
  });

  it('approve records the current node; throws when done', () => {
    expect(approveState(state('plan'), 'me').approvals.plan).toMatchObject({ by: 'me' });
    expect(() => approveState(state(null), 'me')).toThrow(/no current node/);
  });
});

describe('schema queries', () => {
  it('phaseOf / deriveStatus map node → phase → status', () => {
    expect(phaseOf(WF, 'dev')).toBe('execute');
    expect(phaseOf(WF, 'triage')).toBeNull();
    expect(deriveStatus(WF, 'triage')).toBe('planning');
    expect(deriveStatus(WF, 'dev')).toBe('in_progress');
    expect(deriveStatus(WF, null)).toBe('completed');
  });

  it('describeNext renders skill / switch / done', () => {
    expect(describeNext(WF, state('dev'))).toMatchObject({ node: 'dev', type: 'skill', skill: 'withy-dev' });
    expect(describeNext(WF, state('triage'))).toMatchObject({ node: 'triage', type: 'switch' });
    expect(describeNext(WF, state(null))).toMatchObject({ node: null });
  });

  it('describeNext normalizes the relayed skill name idempotently (no double prefix)', () => {
    const wf = { ...WF, nodes: [...WF.nodes, { id: 'real', type: 'skill' as const, skill: 'withy-dev', next: null }] };
    expect(describeNext(wf, state('real'))).toMatchObject({ skill: 'withy-dev' });
  });

  it('nodeById finds nodes and returns undefined for misses', () => {
    expect(nodeById(WF, 'dev')?.id).toBe('dev');
    expect(nodeById(WF, 'ghost')).toBeUndefined();
  });
});
