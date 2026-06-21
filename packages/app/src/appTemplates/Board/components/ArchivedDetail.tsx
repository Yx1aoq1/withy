'use client';

import { useTranslations } from 'next-intl';
import { Layer, PhaseStepper } from './detail';
import { ARCHIVED_STATUS_META, formatArchivedDate } from './archived';
import { Scroller } from '@/components/Scroller';
import type { ArchivedCard } from '@/types/dashboard';

interface ArchivedDetailProps {
  card: ArchivedCard;
}

// 归档只读详情:回看任务归档时的冻结进度 —— 主体阶段(步进器)、归档时所在节点、实施计划(只读)、生命周期时间。
// 进度数据经 core 的归档回退按 id 读出;本面板无任何写操作(不勾选、不归档)。
export function ArchivedDetail({ card }: ArchivedDetailProps) {
  const t = useTranslations('archived');
  const meta = ARCHIVED_STATUS_META[card.finalStatus];
  const { done, total, unparsed, items } = card.implementation;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <aside className="flex w-[336px] shrink-0 flex-col border-l border-line-strong bg-[color-mix(in_srgb,var(--paper)_40%,transparent)]">
      <Scroller className="min-h-0 flex-1">
        <div className="flex items-center px-4 pt-3.5 pb-2.5">
          <span className="font-serif text-[15px] font-semibold">{t('detailTitle')}</span>
        </div>

        <div className="px-4 pb-[18px]">
          <h2 className="mt-0.5 mb-2.5 font-serif text-[20px] font-semibold leading-tight">{card.title}</h2>

          <span
            className={`mb-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-bold ${meta.pill}`}
          >
            {meta.icon} {t(`status.${card.finalStatus}`)}
          </span>

          <Layer label={t('phaseLabel')}>
            <PhaseStepper current={card.phase} completed={card.finalStatus === 'completed'} />
          </Layer>

          <Layer label={t('nodeLabel')}>
            {card.node ? (
              <div className="rounded-[9px] border border-line bg-paper-sunken px-2.5 py-2 text-[12.5px] font-semibold text-ink-soft">
                {card.node}
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-faint">{t('noNode')}</p>
            )}
          </Layer>

          <Layer label={t('implementationLabel', { done, total })}>
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

          <div className="mt-1 border-t border-dashed border-line pt-3 text-[11px] text-ink-faint">
            <p>{t('createdAt', { date: formatArchivedDate(card.createdAt) })}</p>
            {card.completedAt && (
              <p className="mt-1">{t('completedAt', { date: formatArchivedDate(card.completedAt) })}</p>
            )}
            <p className="mt-1">{t('archivedAt', { date: formatArchivedDate(card.archivedAt) })}</p>
            <p className="mt-1">{t('ownerLine', { owner: card.owner })}</p>
          </div>
        </div>
      </Scroller>
    </aside>
  );
}
