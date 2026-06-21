'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Layer, PhaseStepper, TimelineRow } from './detail';
import { TaskDocsModal } from './TaskDocsModal';
import { Scroller } from '@/components/Scroller';
import type { BoardCard } from '@/types/dashboard';

interface ViewDetailProps {
  card: BoardCard;
  project: string;
}

// 右侧 view detail:任务三层进度概览(主体阶段 / 节点门禁 / 实施计划)+ 执行时间线 + 任务产物快查。常驻不可关闭。
// 实施步骤只读展示;产物清单选中任务时按需取,点开弹三栏只读窗。仅「已完成」任务可归档(写后 router.refresh + SSE 回灌)。
export function ViewDetail({ card, project }: ViewDetailProps) {
  const t = useTranslations('viewDetail');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [docsState, setDocsState] = useState<{ id: string; docs: string[] } | null>(null); // 已取清单(按 id 标记)
  const [docsFailedId, setDocsFailedId] = useState<string | null>(null); // 取清单失败的 id(派生失败态)
  const [openDoc, setOpenDoc] = useState<string | null>(null);

  const { done, total, unparsed, items } = card.implementation;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const query = `?project=${encodeURIComponent(project)}`;
  const canArchive = card.column === 'done';

  // 加载/失败态由 card.id 派生:清单与当前卡不一致即视作加载中(切卡自动回到加载态、清除旧失败态)。
  const docs = docsState?.id === card.id ? docsState.docs : null; // null = 加载中
  const docsFailed = docsFailedId === card.id;

  // 选中任务变化时按需取产物清单(只在详情读,不挂 BoardCard,避免每卡 readdir)。setState 仅落异步回调。
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tasks/${encodeURIComponent(card.id)}/docs${query}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data?.ok && Array.isArray(data.docs)) setDocsState({ id: card.id, docs: data.docs });
        else setDocsFailedId(card.id);
      })
      .catch(() => {
        if (cancelled) return;
        setDocsFailedId(card.id);
      });

    return () => {
      cancelled = true;
    };
  }, [card.id, query]);

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
    <>
      <aside className="flex w-[336px] min-w-0 shrink-0 flex-col border-l border-line-strong bg-[color-mix(in_srgb,var(--paper)_40%,transparent)]">
        <Scroller className="min-h-0 flex-1">
          <div className="flex items-center px-4 pt-3.5 pb-2.5">
            <span className="font-serif text-[15px] font-semibold">{t('title')}</span>
          </div>

          <div className="px-4 pb-[18px]">
            <h2 className="mt-0.5 mb-4 break-words font-serif text-[20px] font-semibold leading-tight">{card.title}</h2>

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
                <details className="rounded-lg border border-line bg-paper/60 px-2.5 py-2">
                  <summary className="cursor-pointer text-[12px] font-semibold text-ink-soft">
                    {t('implementationSteps', { count: items.length })}
                  </summary>
                  <ul className="mt-2.5 flex min-w-0 flex-col gap-1.5 border-t border-dashed border-line pt-2.5">
                    {items.map(item => (
                      <li key={item.id} className="flex min-w-0 items-start gap-2 text-[12.5px] leading-snug">
                        <span className={`mt-0.5 shrink-0 text-[11px] ${item.done ? 'text-teal' : 'text-ink-faint'}`}>
                          {item.done ? '✓' : '○'}
                        </span>
                        <span
                          className={`min-w-0 break-words ${item.done ? 'text-ink-faint line-through' : 'text-ink-soft'}`}
                        >
                          {item.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {unparsed > 0 && (
                <p className="mt-2 text-[11px] text-terracotta">{t('implementationUnparsed', { count: unparsed })}</p>
              )}
            </Layer>

            <Layer label={t('timelineLayer')}>
              {card.timeline.length === 0 ? (
                <p className="text-[12px] text-ink-faint">{t('timelineEmpty')}</p>
              ) : (
                <details className="rounded-lg border border-line bg-paper/60 px-2.5 py-2">
                  <summary className="cursor-pointer text-[12px] font-semibold text-ink-soft">
                    {t('timelineToggle', { count: card.timeline.length })}
                  </summary>
                  <ul className="mt-2.5 flex flex-col border-t border-dashed border-line pt-2.5">
                    {card.timeline.map((event, index) => (
                      <TimelineRow key={`${event.ts}-${index}`} event={event} />
                    ))}
                  </ul>
                </details>
              )}
            </Layer>

            {docsFailed ? (
              <Layer label={t('docsLayer')}>
                <p className="text-[12px] text-terracotta">{t('docsFailed')}</p>
              </Layer>
            ) : docs === null ? (
              <Layer label={t('docsLayer')}>
                <p className="text-[12px] text-ink-faint">{t('docsLoading')}</p>
              </Layer>
            ) : docs.length > 0 ? (
              <Layer label={t('docsLayer')}>
                <div className="flex flex-wrap gap-1.5">
                  {docs.map(name => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setOpenDoc(name)}
                      className="cursor-pointer rounded-md border border-line bg-paper px-2 py-1 font-mono text-[11.5px] text-ink-soft hover:border-line-strong hover:text-ink"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </Layer>
            ) : null}

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
        </Scroller>
      </aside>

      {openDoc && (
        <TaskDocsModal
          taskId={card.id}
          project={project}
          docs={docs ?? []}
          initialName={openDoc}
          onClose={() => setOpenDoc(null)}
        />
      )}
    </>
  );
}
