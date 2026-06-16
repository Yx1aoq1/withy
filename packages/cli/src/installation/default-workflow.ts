import type { Workflow } from '@tuteur/core';

// Default coding workflow seeded into both project and global roots (core §4.3):
// a `triage` switch in front of the three fixed phase containers (planning /
// execute / finish). Single source so project init and global template agree.
export const DEFAULT_WORKFLOW: Workflow = {
  id: 'default',
  name: 'Default Coding Workflow',
  version: '0.3.0',
  entry: 'triage',
  phases: [
    { id: 'planning', label: '规划', entry: 'brainstorm' },
    { id: 'execute', label: '执行', entry: 'dev' },
    { id: 'finish', label: '收尾', entry: 'wrapup' },
  ],
  nodes: [
    {
      id: 'triage',
      type: 'switch',
      branches: [
        { label: 'standard', criteria: '常规需求,需要完整规划再开发', default: true, next: 'brainstorm' },
        { label: 'small', criteria: '改动小、风险低,可跳过规划直接开发', next: 'dev' },
        { label: 'research', criteria: '只需调研、产出结论,不写生产代码', next: 'wrapup' },
      ],
    },
    { id: 'brainstorm', type: 'skill', skill: 'brainstorm', phase: 'planning', next: 'grill-me' },
    {
      id: 'grill-me',
      type: 'skill',
      skill: 'grill-me',
      phase: 'planning',
      next: 'dev',
      gate: { artifacts: ['design.md'], approval: true },
    },
    { id: 'dev', type: 'skill', skill: 'dev', phase: 'execute', next: 'check' },
    {
      id: 'check',
      type: 'skill',
      skill: 'check',
      phase: 'execute',
      next: 'wrapup',
      gate: { checks: ['npm test'] },
    },
    { id: 'wrapup', type: 'skill', skill: 'finish', phase: 'finish', next: null },
  ],
};
