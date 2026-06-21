import type { Phase } from '@/types/dashboard';

// 阶段 → 展示配色工具类(label 文案经 i18n,phase.<key>)。纯客户端安全,无 core 依赖。
// strip/border/ring 同色:左侧色条、选中边框、选中 ring 共用一套阶段色,保证选中态与色条一致。
export const PHASE_META: Record<Phase, { pill: string; dot: string; strip: string; border: string; ring: string }> = {
  planning: {
    pill: 'text-blue bg-blue-bg',
    dot: 'bg-blue',
    strip: 'bg-blue',
    border: 'border-blue',
    ring: 'ring-blue',
  },
  execute: {
    pill: 'text-mustard bg-mustard-bg',
    dot: 'bg-mustard',
    strip: 'bg-mustard',
    border: 'border-mustard',
    ring: 'ring-mustard',
  },
  // 收尾(finish)阶段在 doing 列时与执行(execute)同用 mustard;绿色(teal)仅保留给 done 列(TaskCard isDone 分支)。
  finish: {
    pill: 'text-mustard bg-mustard-bg',
    dot: 'bg-mustard',
    strip: 'bg-mustard',
    border: 'border-mustard',
    ring: 'ring-mustard',
  },
};

export const PHASE_ORDER: Phase[] = ['planning', 'execute', 'finish'];
