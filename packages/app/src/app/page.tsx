import { getDashboardSummary, type TaskFilterMode } from '../dashboard/summary';

interface HomePageProps {
  searchParams?: Promise<{
    taskFilter?: string;
  }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const summary = await getDashboardSummary(toTaskFilterMode(params?.taskFilter));

  return (
    <main className="mx-auto w-[calc(100vw-40px)] max-w-[960px] py-12 max-[640px]:w-[calc(100vw-28px)] max-[640px]:py-7">
      <header className="mb-6 flex items-center justify-between gap-6 max-[640px]:flex-col max-[640px]:items-start">
        <div>
          <p className="mb-1.5 text-[13px] font-semibold uppercase text-[#626b71]">Local dashboard</p>
          <h1 className="text-4xl font-bold">Tuteur</h1>
        </div>
        <span className="rounded-full border border-[#c9d3cc] bg-[#eef5f0] px-2.5 py-1.5 text-[13px] font-semibold text-[#27513a]">
          {summary.status}
        </span>
      </header>

      <section className="rounded-lg border border-[#d7d7cf] bg-white p-6">
        <h2 className="mb-0 text-2xl font-semibold">Scaffold ready</h2>
        <p className="mt-4 leading-relaxed text-[#4f565c]">
          The dashboard shell is running. CLI-owned workflow, task, artifact, and agent adapter logic are intentionally
          left as TODOs.
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
          <div className="border-t border-[#e3e3dc] pt-3">
            <dt className="text-[13px] text-[#626b71]">Product</dt>
            <dd className="mt-1 font-semibold">{summary.product}</dd>
          </div>
          <div className="border-t border-[#e3e3dc] pt-3">
            <dt className="text-[13px] text-[#626b71]">Next step</dt>
            <dd className="mt-1 font-semibold">{summary.nextStep}</dd>
          </div>
          <div className="border-t border-[#e3e3dc] pt-3">
            <dt className="text-[13px] text-[#626b71]">User</dt>
            <dd className="mt-1 font-semibold">{summary.currentUser?.name ?? 'Not initialized'}</dd>
          </div>
          <div className="border-t border-[#e3e3dc] pt-3">
            <dt className="text-[13px] text-[#626b71]">Task filter</dt>
            <dd className="mt-2 flex flex-wrap gap-2 font-semibold">
              <a
                className={getFilterLinkClass(summary.taskFilter === 'mine' && Boolean(summary.currentUser))}
                href="?taskFilter=mine"
                aria-disabled={!summary.currentUser}
              >
                My tasks ({summary.taskCounts.mine})
              </a>
              <a className={getFilterLinkClass(summary.taskFilter === 'all')} href="?taskFilter=all">
                All tasks ({summary.taskCounts.total})
              </a>
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}

function toTaskFilterMode(value: string | undefined): TaskFilterMode {
  return value === 'all' ? 'all' : 'mine';
}

function getFilterLinkClass(active: boolean): string {
  const base = 'rounded border px-2.5 py-1 text-[13px] no-underline';
  return active
    ? `${base} border-[#27513a] bg-[#eef5f0] text-[#27513a]`
    : `${base} border-[#d7d7cf] bg-white text-[#4f565c]`;
}
