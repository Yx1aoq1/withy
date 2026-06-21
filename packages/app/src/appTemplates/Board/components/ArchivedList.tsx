'use client';

import { useTranslations } from 'next-intl';
import { ARCHIVED_STATUS_META, formatArchivedDay } from './archived';
import { Scroller } from '@/components/Scroller';
import type { ArchivedCard, ArchivedData } from '@/types/dashboard';

interface ArchivedListProps {
  data: ArchivedData;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// 归档列表:按 YYYY-MM 月份分组的紧凑行(状态图标 + 标题 + 负责人 + 归档日 + 终态);点行选中并在右侧只读详情展开。
export function ArchivedList({ data, selectedId, onSelect }: ArchivedListProps) {
  const t = useTranslations('archived');

  if (data.total === 0) {
    return <p className="px-[18px] py-6 text-[12px] text-ink-faint">{t('empty')}</p>;
  }

  return (
    <Scroller className="min-h-0 flex-1">
      <div className="px-[18px] pt-2.5 pb-[18px]">
        {data.groups.map(group => (
          <section key={group.bucket} className="mb-4">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="font-serif text-[13px] font-semibold text-ink-soft">{group.bucket}</span>
              <span className="rounded-full border border-line bg-paper-sunken px-2 py-px text-[11px] font-bold text-ink-soft">
                {group.cards.length}
              </span>
            </div>
            <ul className="flex flex-col">
              {group.cards.map(card => (
                <ArchivedRow
                  key={card.id}
                  card={card}
                  selected={card.id === selectedId}
                  onSelect={() => onSelect(card.id)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Scroller>
  );
}

function ArchivedRow({ card, selected, onSelect }: { card: ArchivedCard; selected: boolean; onSelect: () => void }) {
  const t = useTranslations('archived');
  const meta = ARCHIVED_STATUS_META[card.finalStatus];

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${
          selected ? 'bg-paper-sunken' : 'hover:bg-paper-sunken/60'
        }`}
      >
        <span className={`w-3 shrink-0 text-center text-[12px] font-bold ${meta.text}`}>{meta.icon}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{card.title}</span>
        <span className="shrink-0 text-[11px] text-ink-faint">{card.owner}</span>
        <span className="shrink-0 text-[11px] text-ink-faint tabular-nums">{formatArchivedDay(card.archivedAt)}</span>
        <span className={`shrink-0 text-[11px] font-semibold ${meta.text}`}>{t(`status.${card.finalStatus}`)}</span>
      </button>
    </li>
  );
}
