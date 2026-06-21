'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { TaskCard } from './TaskCard';
import { ViewDetail } from './ViewDetail';
import { ArchivedList } from './ArchivedList';
import { ArchivedDetail } from './ArchivedDetail';
import { Scroller } from '@/components/Scroller';
import type { BoardCard, BoardColumn, BoardData, ArchivedData } from '@/types/dashboard';

interface BoardViewProps {
  board: BoardData;
  archived: ArchivedData;
  identityName: string | null; // 本地身份用户名;用作用户过滤下拉的默认选中(无身份则默认「全部」)
  project: string;
}

type View = 'active' | 'archived';

const COLUMNS: BoardColumn[] = ['todo', 'doing', 'done'];

// 看板视图:左上「活跃/已归档」切换主区 + 用户过滤下拉(全部 / 各负责人,默认当前用户)。
// 活跃=三列(虚线分隔)+ 右侧 view detail;已归档=按月份分组的只读列表 + 只读详情。两视图共用用户过滤。
export function BoardView({ board, archived, identityName, project }: BoardViewProps) {
  const t = useTranslations('board');
  const tDetail = useTranslations('viewDetail');
  const tArchived = useTranslations('archived');
  const [view, setView] = useState<View>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedArchivedId, setSelectedArchivedId] = useState<string | null>(null);

  // 默认过滤用户:当前身份对应的 owner(取任一 mine 卡片的 owner,兼容 name/slug 差异);无则回退身份名,再无则「全部」
  const defaultUser = useMemo(() => pickMyOwner(board, archived) ?? identityName, [board, archived, identityName]);
  const [user, setUser] = useState<string | null>(defaultUser); // null = 全部

  // 用户下拉选项:全部 owner 去重,并入默认用户(保证当前用户即便无任务也可选中),按名排序
  const owners = useMemo(() => {
    const set = collectOwners(board, archived);
    if (defaultUser) set.add(defaultUser);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [board, archived, defaultUser]);

  const filtered = useMemo(() => filterBoard(board, user), [board, user]);
  const filteredArchived = useMemo(() => filterArchived(archived, user), [archived, user]);

  const allCards = useMemo(
    () => [...filtered.columns.todo, ...filtered.columns.doing, ...filtered.columns.done],
    [filtered],
  );
  const archivedCards = useMemo(() => filteredArchived.groups.flatMap(group => group.cards), [filteredArchived]);

  // 选中态:用户显式选中优先;否则取默认(过滤后选中项消失也回退默认)。两视图各自维护选中。
  const selected = (selectedId ? allCards.find(card => card.id === selectedId) : undefined) ?? pickDefault(filtered);
  const selectedArchived =
    (selectedArchivedId ? archivedCards.find(card => card.id === selectedArchivedId) : undefined) ??
    archivedCards[0] ??
    null;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2.5 px-[18px] pt-3">
          <span className="inline-flex rounded-full border border-line-strong bg-paper-sunken p-[3px]">
            <button type="button" onClick={() => setView('active')} className={segClass(view === 'active')}>
              {t('active')}
            </button>
            <button type="button" onClick={() => setView('archived')} className={segClass(view === 'archived')}>
              {t('archived')}
              {filteredArchived.total > 0 && (
                <span className="ml-1.5 text-[11px] font-bold opacity-70">{filteredArchived.total}</span>
              )}
            </button>
          </span>

          <div className="relative inline-flex items-center">
            <select
              value={user ?? ''}
              onChange={event => setUser(event.target.value || null)}
              className="cursor-pointer appearance-none rounded-full bg-transparent py-[5px] pr-6 pl-2.5 text-[13px] font-semibold text-ink-soft hover:text-ink focus:outline-none"
            >
              <option value="">{t('all')}</option>
              {owners.map(owner => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 text-[10px] text-ink-faint">▾</span>
          </div>
        </div>

        {view === 'active' ? (
          <>
            <div className="grid grid-cols-3 px-[18px] pt-2.5 pb-2.5">
              {COLUMNS.map((col, i) => (
                <div
                  key={col}
                  className={`flex items-center gap-2 pl-1 font-serif text-[15px] font-semibold ${
                    i > 0 ? 'border-l border-dashed border-line-strong pl-4' : ''
                  }`}
                >
                  {t(col)}
                  <span className="rounded-full border border-line bg-paper-sunken px-2 py-px text-[11px] font-bold text-ink-soft">
                    {filtered.counts[col]}
                  </span>
                </div>
              ))}
            </div>

            <Scroller className="min-h-0 flex-1">
              <div className="grid grid-cols-3 px-[18px] pb-[18px]">
                {COLUMNS.map((col, i) => (
                  <div
                    key={col}
                    className={`flex flex-col gap-3 py-1.5 pr-3.5 pl-1 ${
                      i > 0 ? 'border-l border-dashed border-line-strong pl-4' : ''
                    }`}
                  >
                    {filtered.columns[col].map(card => (
                      <TaskCard
                        key={card.id}
                        card={card}
                        selected={card.id === selected?.id}
                        onSelect={() => setSelectedId(card.id)}
                      />
                    ))}
                    {filtered.columns[col].length === 0 && (
                      <p className="px-1 py-3 text-[12px] text-ink-faint">{t('empty')}</p>
                    )}
                  </div>
                ))}
              </div>
            </Scroller>
          </>
        ) : (
          <ArchivedList
            data={filteredArchived}
            selectedId={selectedArchived?.id ?? null}
            onSelect={setSelectedArchivedId}
          />
        )}
      </div>

      {view === 'active' ? (
        selected ? (
          <ViewDetail card={selected} project={project} />
        ) : (
          <EmptyAside title={tDetail('title')} hint={tDetail('detailEmpty')} />
        )
      ) : selectedArchived ? (
        <ArchivedDetail card={selectedArchived} />
      ) : (
        <EmptyAside title={tArchived('detailTitle')} hint={tArchived('detailEmpty')} />
      )}
    </div>
  );
}

// 右侧详情空态占位:常驻不可关闭,无可展示项时渲染
function EmptyAside({ title, hint }: { title: string; hint: string }) {
  return (
    <aside className="flex w-[336px] shrink-0 flex-col overflow-y-auto border-l border-line-strong bg-[color-mix(in_srgb,var(--paper)_40%,transparent)]">
      <div className="flex items-center px-4 pt-3.5 pb-2.5">
        <span className="font-serif text-[15px] font-semibold">{title}</span>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 pb-12 text-center">
        <p className="text-[12px] text-ink-faint">{hint}</p>
      </div>
    </aside>
  );
}

// 默认选中:优先正在执行(doing),其次待办(todo),最后已完成(done);全空返回 null
function pickDefault(board: BoardData): BoardCard | null {
  return board.columns.doing[0] ?? board.columns.todo[0] ?? board.columns.done[0] ?? null;
}

// 当前身份对应的 owner 值:取任一标记 mine 的卡片 owner(兼容任务里存 name 或 slug),无则 null
function pickMyOwner(board: BoardData, archived: ArchivedData): string | null {
  for (const col of COLUMNS) {
    const card = board.columns[col].find(card => card.mine);
    if (card) return card.owner;
  }
  for (const group of archived.groups) {
    const card = group.cards.find(card => card.mine);
    if (card) return card.owner;
  }
  return null;
}

// 收集看板与归档里出现的全部 owner(去重)
function collectOwners(board: BoardData, archived: ArchivedData): Set<string> {
  const set = new Set<string>();
  for (const col of COLUMNS) for (const card of board.columns[col]) set.add(card.owner);
  for (const group of archived.groups) for (const card of group.cards) set.add(card.owner);
  return set;
}

function filterBoard(board: BoardData, user: string | null): BoardData {
  if (!user) return board;
  const pick = (cards: BoardCard[]) => cards.filter(card => card.owner === user);
  const columns = {
    todo: pick(board.columns.todo),
    doing: pick(board.columns.doing),
    done: pick(board.columns.done),
  };
  const counts = { todo: columns.todo.length, doing: columns.doing.length, done: columns.done.length };
  return { columns, counts, total: counts.todo + counts.doing + counts.done };
}

function filterArchived(archived: ArchivedData, user: string | null): ArchivedData {
  if (!user) return archived;
  const groups = archived.groups
    .map(group => ({ bucket: group.bucket, cards: group.cards.filter(card => card.owner === user) }))
    .filter(group => group.cards.length > 0);
  return { groups, total: groups.reduce((sum, group) => sum + group.cards.length, 0) };
}

function segClass(active: boolean): string {
  const base = 'cursor-pointer rounded-full px-[13px] py-[5px] text-[13px] font-semibold disabled:opacity-40';
  return active ? `${base} bg-brand text-brand-ink` : `${base} text-ink-soft`;
}
