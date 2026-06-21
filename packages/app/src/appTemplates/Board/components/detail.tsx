'use client';

import { useTranslations } from 'next-intl';
import { PHASE_ORDER } from './phase';
import type { Phase, TimelineEventView } from '@/types/dashboard';

// 详情面板的共享展示子件(活跃 ViewDetail 与归档 ArchivedDetail 共用):带标题的分层块 + 主体阶段步进器。
// 纯展示、无写操作、无 core 依赖。

// 带小标题的分层容器
export function Layer({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-[11px] font-bold text-ink-faint">{label}</div>
      {children}
    </div>
  );
}

// 主体阶段步进器:已过=✓(teal)、当前=●(mustard)、未到=○(中性);current 为 null 时全部视作未到。
// completed=true(任务已完成):三阶段都走完 → 全绿,不把终点节点所在阶段误标为「进行中」。
export function PhaseStepper({ current, completed = false }: { current: Phase | null; completed?: boolean }) {
  const tPhase = useTranslations('phase');
  const currentIdx = completed ? PHASE_ORDER.length : current ? PHASE_ORDER.indexOf(current) : -1;

  return (
    <div className="flex items-center gap-1">
      {PHASE_ORDER.map((phase, i) => {
        const state = currentIdx < 0 ? 'todo' : i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'todo';
        return (
          <div key={phase} className="flex items-center gap-1">
            {i > 0 && <span className="h-px w-3 bg-line-strong" />}
            <span className={`flex items-center gap-1.5 text-[12px] font-semibold ${stepTextClass(state)}`}>
              <span
                className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] ${stepMarkClass(state)}`}
              >
                {state === 'done' ? '✓' : state === 'active' ? '●' : '○'}
              </span>
              {tPhase(phase)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function stepTextClass(state: 'done' | 'active' | 'todo'): string {
  if (state === 'done') return 'text-teal';
  if (state === 'active') return 'text-mustard';
  return 'text-ink-soft';
}

function stepMarkClass(state: 'done' | 'active' | 'todo'): string {
  if (state === 'done') return 'bg-teal border-teal text-brand-ink border-[1.5px]';
  if (state === 'active') return 'bg-mustard border-mustard text-brand-ink border-[1.5px]';
  return 'bg-paper-sunken border-line-strong text-ink-faint border-[1.5px]';
}

// 时间线事件的语义色调:验收通过=ok(teal)、验收未过=fail(terracotta)、
// 审批/回退/跳过=warn(mustard)、分支判定/会话注入=neutral(ink-faint)。对齐 visual-design §6.5。
type EventTone = 'ok' | 'fail' | 'warn' | 'neutral';

function eventTone(event: TimelineEventView): EventTone {
  if (event.type === 'complete_attempt') return event.ok ? 'ok' : 'fail';
  if (event.type === 'approval' || event.type === 'rewind' || event.type === 'skip') return 'warn';
  return 'neutral';
}

function eventDotClass(tone: EventTone): string {
  if (tone === 'ok') return 'bg-teal';
  if (tone === 'fail') return 'bg-terracotta';
  if (tone === 'warn') return 'bg-mustard';
  return 'bg-ink-faint';
}

function eventTextClass(tone: EventTone): string {
  if (tone === 'ok') return 'text-teal';
  if (tone === 'fail') return 'text-terracotta';
  if (tone === 'warn') return 'text-mustard';
  return 'text-ink-soft';
}

// 事件类型 → viewDetail.event.* 文案 key
function eventLabelKey(event: TimelineEventView): string {
  switch (event.type) {
    case 'complete_attempt':
      return event.ok ? 'event.completePass' : 'event.completeFail';
    case 'decision':
      return 'event.decision';
    case 'rewind':
      return 'event.rewind';
    case 'skip':
      return 'event.skip';
    case 'approval':
      return 'event.approval';
    default:
      return 'event.sessionStart'; // session_start
  }
}

// ISO 时间戳取 MM-DD HH:mm(直接切串,避开本地时区漂移与 SSR/CSR 水合不一致),对齐 archived 格式约定。
function formatEventTime(iso: string): string {
  return iso.slice(5, 16).replace('T', ' ');
}

// 时间线单条事件:左侧连续轴 + 语义色点,右侧时间 / 文案(节点·操作人)/ reason(单行截断)。纯展示。
export function TimelineRow({ event }: { event: TimelineEventView }) {
  const t = useTranslations('viewDetail');
  const tone = eventTone(event);

  return (
    <li className="flex gap-2.5">
      <div className="flex flex-col items-center">
        <span className={`mt-[5px] h-[9px] w-[9px] shrink-0 rounded-full ring-2 ring-paper ${eventDotClass(tone)}`} />
        <span className="mt-1 w-px flex-1 bg-line" />
      </div>
      <div className="min-w-0 flex-1 pb-2.5">
        <div className="font-mono text-[11px] text-ink-soft">{formatEventTime(event.ts)}</div>
        <div className="text-[12.5px] leading-snug">
          <span className={`font-semibold ${eventTextClass(tone)}`}>{t(eventLabelKey(event))}</span>
          {event.node && <span className="ml-1.5 text-ink-soft">{t('event.node', { node: event.node })}</span>}
          {event.by && <span className="ml-1.5 text-ink-faint">{t('event.by', { by: event.by })}</span>}
        </div>
        {event.reason && <div className="mt-0.5 truncate text-[11.5px] text-ink-soft">{event.reason}</div>}
      </div>
    </li>
  );
}
