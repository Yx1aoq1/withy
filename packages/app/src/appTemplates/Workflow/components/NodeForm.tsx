'use client';

import { useTranslations } from 'next-intl';
import { artifactPathOf } from './model';
import type {
  CanvasArtifact,
  CanvasBranch,
  CanvasGate,
  CanvasNode,
  CanvasSkillNode,
  CanvasSwitchNode,
} from '@/types/dashboard';

interface NodeFormProps {
  node: CanvasNode;
  agents: string[];
  onChange: (next: CanvasNode) => void;
  onDelete: () => void;
}

// 选中节点的配置表单(渲染在右侧面板,非悬浮):skill 编 agent(可选派遣)/gate(产物/检查/审批);switch 编各分支 label/criteria/default。
// skill 名称在建节点时已固定,这里只读展示;出口目标(next / branch.next)在画布上从出口连接点拉线设定。
export function NodeForm({ node, agents, onChange, onDelete }: NodeFormProps) {
  const t = useTranslations('canvas');

  return (
    <div className="flex flex-col gap-4 px-4 pb-5">
      {node.type === 'skill' ? (
        <SkillFields node={node} agents={agents} onChange={onChange} />
      ) : (
        <SwitchFields node={node} onChange={onChange} />
      )}

      <button
        type="button"
        onClick={onDelete}
        className="mt-1 rounded-[10px] border border-terracotta px-2.5 py-2 text-[12.5px] font-semibold text-terracotta hover:bg-terracotta-bg"
      >
        {t('deleteNode')}
      </button>
    </div>
  );
}

// ── skill 节点字段 ────────────────────────────────────────────────────────────

function SkillFields({
  node,
  agents,
  onChange,
}: {
  node: CanvasSkillNode;
  agents: string[];
  onChange: (next: CanvasNode) => void;
}) {
  const t = useTranslations('canvas');
  const gate = node.gate ?? {};
  const artifacts = gate.artifacts ?? [];
  const checks = gate.checks ?? [];

  const setGate = (patch: Partial<CanvasGate>): void =>
    onChange({ ...node, gate: normalizeGate({ ...gate, ...patch }) });

  // 选空 = 主会话自己干(去掉 agent 字段);选某角色 = 派该子 agent。悬空角色保存时 core 出 warning 不拦。
  const setAgent = (value: string): void => {
    if (value) {
      onChange({ ...node, agent: value });
      return;
    }
    const next = { ...node };
    delete next.agent;
    onChange(next);
  };

  // 当前 agent 不在已发现列表(悬空)时,补一个占位项让它仍可见、可保留。
  const agentOptions = node.agent && !agents.includes(node.agent) ? [node.agent, ...agents] : agents;

  return (
    <>
      <Field label={t('skill')}>
        <div className="rounded-[8px] border border-line bg-paper-sunken px-2 py-1 font-mono text-[12.5px] text-ink">
          {node.skill}
        </div>
      </Field>

      <Field label={t('agent')}>
        <select value={node.agent ?? ''} onChange={event => setAgent(event.target.value)} className={inputClass}>
          <option value="">{t('agentNone')}</option>
          {agentOptions.map(role => (
            <option key={role} value={role}>
              {role}
              {!agents.includes(role) ? ` ${t('agentDangling')}` : ''}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('artifacts')}>
        <ListEditor
          values={artifacts.map(artifactPathOf)}
          placeholder={t('artifactPlaceholder')}
          onChange={paths => setGate({ artifacts: rebuildArtifacts(artifacts, paths) })}
        />
      </Field>

      <Field label={t('checks')}>
        <ListEditor
          values={checks}
          placeholder={t('checkPlaceholder')}
          onChange={value => setGate({ checks: value })}
        />
      </Field>

      <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink-soft">
        <input
          type="checkbox"
          checked={Boolean(gate.approval)}
          onChange={event => setGate({ approval: event.target.checked })}
        />
        {t('approvalGate')}
      </label>
    </>
  );
}

// ── switch 节点字段 ──────────────────────────────────────────────────────────

function SwitchFields({ node, onChange }: { node: CanvasSwitchNode; onChange: (next: CanvasNode) => void }) {
  const t = useTranslations('canvas');

  const setBranches = (branches: CanvasBranch[]): void => onChange({ ...node, branches });

  const patchBranch = (index: number, patch: Partial<CanvasBranch>): void =>
    setBranches(node.branches.map((b, i) => (i === index ? { ...b, ...patch } : b)));

  // 选某条为 default 时,其余取消 default(保证恰好一个,对齐 core 校验)
  const setDefault = (index: number): void =>
    setBranches(node.branches.map((b, i) => ({ ...b, default: i === index })));

  const addBranch = (): void =>
    setBranches([...node.branches, { label: uniqueBranchLabel(node.branches), next: null }]);

  const removeBranch = (index: number): void => {
    const rest = node.branches.filter((_, i) => i !== index);
    // 删掉 default 后若无 default,把第一条设为 default
    if (rest.length > 0 && !rest.some(b => b.default)) rest[0] = { ...rest[0], default: true };
    setBranches(rest);
  };

  return (
    <>
      <p className="text-[11px] leading-snug text-ink-faint">{t('switchHint')}</p>
      {node.branches.map((branch, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-[10px] border border-line px-2.5 py-2.5">
          <div className="flex items-center gap-2">
            <input
              value={branch.label}
              onChange={event => patchBranch(index, { label: event.target.value })}
              placeholder={t('branchLabel')}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => removeBranch(index)}
              disabled={node.branches.length <= 1}
              className="text-[14px] text-ink-faint hover:text-terracotta disabled:opacity-30"
              title={t('removeBranch')}
            >
              ×
            </button>
          </div>
          <input
            value={branch.criteria ?? ''}
            onChange={event => patchBranch(index, { criteria: event.target.value || undefined })}
            placeholder={t('branchCriteria')}
            className={inputClass}
          />
          <div className="flex items-center justify-between text-[11px] text-ink-faint">
            <span className="truncate font-mono">→ {branch.next ?? t('branchUnlinked')}</span>
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 font-semibold text-ink-soft">
              <input
                type="radio"
                name={`default-${node.id}`}
                checked={Boolean(branch.default)}
                onChange={() => setDefault(index)}
              />
              {t('defaultBranch')}
            </label>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addBranch}
        className="rounded-[10px] border border-dashed border-line-strong px-2.5 py-2 text-[12.5px] font-semibold text-ink-soft hover:border-ink-faint hover:text-ink"
      >
        {t('addBranch')}
      </button>
    </>
  );
}

// ── 复用小件 ──────────────────────────────────────────────────────────────────

const inputClass =
  'min-w-0 flex-1 rounded-[8px] border border-line bg-paper-sunken px-2 py-1 text-[12.5px] text-ink focus:border-ink-faint focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold text-ink-faint">{label}</span>
      {children}
    </div>
  );
}

// 行列表编辑(产物路径 / 检查命令):每行一个输入 + 删除,末尾「+ 新增」追加空行。
// 编辑期保留空行(含空字符串),不在此过滤——清理交给保存前的 sanitizeWorkflow,否则新增的空行会被立刻抹掉。
function ListEditor({
  values,
  placeholder,
  onChange,
}: {
  values: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
}) {
  const t = useTranslations('canvas');
  return (
    <div className="flex flex-col gap-1.5">
      {values.map((value, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <input
            value={value}
            placeholder={placeholder}
            onChange={event => onChange(values.map((v, i) => (i === index ? event.target.value : v)))}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => onChange(values.filter((_, i) => i !== index))}
            className="text-[14px] text-ink-faint hover:text-terracotta"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...values, ''])}
        className="self-start text-[12px] font-semibold text-teal hover:underline"
      >
        + {t('addRow')}
      </button>
    </div>
  );
}

// ── 纯工具 ──────────────────────────────────────────────────────────────────

// 把编辑后的路径列表写回产物规格:沿用原对象规格(保 title/template),新增行用裸字符串。
// 不过滤空行(编辑期允许空行存在),保存时由 sanitizeWorkflow 清理。
function rebuildArtifacts(original: CanvasArtifact[], paths: string[]): CanvasArtifact[] {
  return paths.map((path, index): CanvasArtifact => {
    const prev = original[index];
    if (prev && typeof prev === 'object') return { ...prev, path };
    return path;
  });
}

// 组装 gate:空数组的键省略,但保留含空行的数组(编辑中);全空(无产物/检查/审批)则整体省略。
function normalizeGate(gate: CanvasGate): CanvasGate | undefined {
  const artifacts = gate.artifacts ?? [];
  const checks = gate.checks ?? [];
  const next: CanvasGate = {};
  if (artifacts.length) next.artifacts = artifacts;
  if (checks.length) next.checks = checks;
  if (gate.approval) next.approval = true;
  return Object.keys(next).length ? next : undefined;
}

function uniqueBranchLabel(branches: CanvasBranch[]): string {
  const taken = new Set(branches.map(b => b.label));
  let n = branches.length + 1;
  while (taken.has(`branch-${n}`)) n += 1;
  return `branch-${n}`;
}
