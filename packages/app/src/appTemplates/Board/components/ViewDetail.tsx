'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Layer, PhaseStepper } from './detail';
import type { BoardCard } from '@/types/dashboard';

interface ViewDetailProps {
  card: BoardCard;
  project: string;
}

// 右侧 view detail:任务三层进度概览(主体阶段 / 节点门禁 / 实施计划)。常驻不可关闭。
// 实施步骤只读展示;仅「已完成」任务可归档(POST archive,默认不改状态);写后 router.refresh + SSE 实时回灌。
export function ViewDetail({ card, project }: ViewDetailProps) {
  const t = useTranslations('viewDetail');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmArchive, setConfirmArchive] = useState(false);

  const { done, total, unparsed, items } = card.implementation;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const query = `?project=${encodeURIComponent(project)}`;
  const canArchive = card.column === 'done';

  const archive = () => {
    startTransition(async () => {
      await fetch(`/api/tasks/${encodeURIComponent(card.id)}/archive${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // 仅完成任务可归档,默认不改状态
      });
      setConfirmArchive(false);
      router.refresh();
    });
  };

  return (
    <aside className="flex w-[336px] shrink-0 flex-col overflow-y-auto border-l border-line-strong bg-[color-mix(in_srgb,var(--paper)_40%,transparent)]">
      <div className="flex items-center px-4 pt-3.5 pb-2.5">
        <span className="font-serif text-[15px] font-semibold">{t('title')}</span>
      </div>

      <div className="px-4 pb-[18px]">
        <h2 className="mt-0.5 mb-4 font-serif text-[20px] font-semibold leading-tight">{card.title}</h2>

        <Layer label={t('phaseLayer')}>
          <PhaseStepper current={card.phase} completed={card.column === 'done'} />
        </Layer>

        <Layer label={t('gateLayer')}>
          {card.node ? (
            <div
              className={`flex items-center justify-between gap-2 rounded-[9px] border px-2.5 py-2.5 text-[12.5px] font-semibold ${
                card.stuck
                  ? 'border-terracotta/30 bg-terracotta-bg text-terracotta'
                  : 'border-teal/30 bg-teal-bg text-teal'
              }`}
            >
              <span>
                {card.stuck ? '✗' : '✓'} {card.node}
              </span>
              {card.stuck && <span className="text-[11px] font-bold">{t('consecutiveFail')}</span>}
            </div>
          ) : (
            <p className="text-[12.5px] text-ink-faint">{t('noNode')}</p>
          )}
        </Layer>

        <Layer label={t('implementationLayer', { done, total })}>
          <div className="mb-2.5 flex items-center gap-2.5">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full border border-line bg-paper-sunken">
              <span className="block h-full bg-teal" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] font-semibold text-ink-soft">
              {done}/{total}
            </span>
          </div>
          {items.length === 0 ? (
            <p className="text-[12px] text-ink-faint">{t('implementationEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {items.map(item => (
                <li key={item.id} className="flex items-start gap-2 text-[12.5px] leading-snug">
                  <span className={`mt-0.5 text-[11px] ${item.done ? 'text-teal' : 'text-ink-faint'}`}>
                    {item.done ? '✓' : '○'}
                  </span>
                  <span className={item.done ? 'text-ink-faint line-through' : 'text-ink-soft'}>{item.text}</span>
                </li>
              ))}
            </ul>
          )}
          {unparsed > 0 && (
            <p className="mt-2 text-[11px] text-terracotta">{t('implementationUnparsed', { count: unparsed })}</p>
          )}
        </Layer>

        <p className="mt-2 mb-3 text-[11px] text-ink-faint">{t('ownerLine', { owner: card.owner })}</p>

        {canArchive &&
          (confirmArchive ? (
            <div className="rounded-[10px] border border-line-strong bg-paper p-3">
              <p className="mb-2.5 text-[12px] text-ink-soft">{t('archiveDoneConfirm')}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={archive}
                  className="cursor-pointer rounded-lg bg-terracotta px-3 py-1.5 text-[12px] font-semibold text-brand-ink disabled:opacity-50"
                >
                  {pending ? t('archiving') : t('archive')}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirmArchive(false)}
                  className="cursor-pointer rounded-lg border border-line-strong bg-paper px-3 py-1.5 text-[12px] font-semibold text-ink-soft"
                >
                  {tCommon('cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              className="cursor-pointer rounded-lg border border-line-strong bg-paper px-3 py-1.5 text-[12px] font-semibold text-ink-soft hover:text-ink"
            >
              {t('archive')}
            </button>
          ))}
      </div>
    </aside>
  );
}
