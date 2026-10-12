/**
 * 投递状态机 —— 唯一事实源（ADR-1）
 * 前端展示映射、服务端流转校验均以此文件为准。
 */

export const STATUS = {
  WISHLIST: 'WISHLIST',
  APPLIED: 'APPLIED',
  SCREENING: 'SCREENING',
  WRITTEN_TEST: 'WRITTEN_TEST',
  INTERVIEW_1: 'INTERVIEW_1',
  INTERVIEW_2: 'INTERVIEW_2',
  INTERVIEW_3: 'INTERVIEW_3',
  HR_INTERVIEW: 'HR_INTERVIEW',
  OFFER: 'OFFER',
  SIGNED: 'SIGNED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
} as const;

export type AppStatus = (typeof STATUS)[keyof typeof STATUS];

export const ALL_STATUSES = Object.values(STATUS) as AppStatus[];

export const TERMINAL_STATUSES: AppStatus[] = [STATUS.SIGNED, STATUS.REJECTED, STATUS.WITHDRAWN];

export const STATUS_LABELS: Record<AppStatus, string> = {
  WISHLIST: '待投递',
  APPLIED: '已投递',
  SCREENING: '简历筛选',
  WRITTEN_TEST: '笔试',
  INTERVIEW_1: '一面',
  INTERVIEW_2: '二面',
  INTERVIEW_3: '三面',
  HR_INTERVIEW: 'HR面',
  OFFER: 'Offer',
  SIGNED: '已签约',
  REJECTED: '已拒绝',
  WITHDRAWN: '已放弃',
};

/** 流转规则表（文档 04 §4）：当前状态 → 允许流转到的状态 */
export const TRANSITIONS: Record<AppStatus, AppStatus[]> = {
  WISHLIST: [STATUS.APPLIED, STATUS.REJECTED, STATUS.WITHDRAWN],
  APPLIED: [
    STATUS.SCREENING,
    STATUS.WRITTEN_TEST,
    STATUS.INTERVIEW_1,
    STATUS.INTERVIEW_2,
    STATUS.INTERVIEW_3,
    STATUS.HR_INTERVIEW,
    STATUS.OFFER,
    STATUS.REJECTED,
    STATUS.WITHDRAWN,
  ],
  SCREENING: [STATUS.WRITTEN_TEST, STATUS.INTERVIEW_1, STATUS.REJECTED, STATUS.WITHDRAWN],
  WRITTEN_TEST: [STATUS.INTERVIEW_1, STATUS.INTERVIEW_2, STATUS.REJECTED, STATUS.WITHDRAWN],
  INTERVIEW_1: [STATUS.INTERVIEW_2, STATUS.INTERVIEW_3, STATUS.HR_INTERVIEW, STATUS.OFFER, STATUS.REJECTED, STATUS.WITHDRAWN],
  INTERVIEW_2: [STATUS.INTERVIEW_3, STATUS.HR_INTERVIEW, STATUS.OFFER, STATUS.REJECTED, STATUS.WITHDRAWN],
  INTERVIEW_3: [STATUS.HR_INTERVIEW, STATUS.OFFER, STATUS.REJECTED, STATUS.WITHDRAWN],
  HR_INTERVIEW: [STATUS.OFFER, STATUS.REJECTED, STATUS.WITHDRAWN],
  OFFER: [STATUS.SIGNED, STATUS.REJECTED, STATUS.WITHDRAWN],
  SIGNED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export function isStatus(value: string): value is AppStatus {
  return (ALL_STATUSES as string[]).includes(value);
}

export function canTransition(from: AppStatus, to: AppStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** 合法流转目标（终态为空数组；前端用 reopen 操作回到 APPLIED） */
export function nextStatuses(from: AppStatus): AppStatus[] {
  return TRANSITIONS[from] ?? [];
}

/** 邮件分析事件类型 */
export const EMAIL_EVENT_TYPES = ['written_test', 'interview', 'assessment', 'offer', 'reject', 'applied', 'other'] as const;
export type EmailEventType = (typeof EMAIL_EVENT_TYPES)[number];

export const EMAIL_EVENT_LABELS: Record<EmailEventType, string> = {
  written_test: '笔试',
  interview: '面试',
  assessment: '测评',
  offer: 'Offer',
  reject: '拒信',
  applied: '投递确认',
  other: '其他',
};

/** 邮件事件类型 → 提醒类型映射（apply 时生成提醒用） */
export const EMAIL_EVENT_TO_REMINDER_TYPE: Record<EmailEventType, string> = {
  written_test: 'written_test',
  interview: 'interview',
  assessment: 'written_test',
  offer: 'other',
  reject: 'other',
  applied: 'other',
  other: 'other',
};

/**
 * 邮件事件类型 → 应当推进到的状态（ADR-7 的受控扩展）。
 * 只给出“目标状态”，具体走哪些中间状态由 planStatusPath 沿合法流转表推导，
 * 因此不会绕过状态机（例如 WISHLIST → 笔试 会自动经过 已投递/筛选）。
 */
export const EMAIL_EVENT_TO_TARGET_STATUS: Record<EmailEventType, AppStatus | null> = {
  written_test: STATUS.WRITTEN_TEST,
  assessment: STATUS.WRITTEN_TEST,
  interview: STATUS.INTERVIEW_1,
  offer: STATUS.OFFER,
  reject: STATUS.REJECTED,
  applied: STATUS.APPLIED,
  other: null,
};

/**
 * 计算从 from 到 to 的最短合法流转路径（不包含起点；无法到达返回空数组）。
 * 纯 BFS over TRANSITIONS，便于单测（例如：待投递 → 笔试 = [已投递, 笔试]）。
 */
export function planStatusPath(from: AppStatus, to: AppStatus): AppStatus[] {
  if (from === to) return [];
  if (TERMINAL_STATUSES.includes(from)) return [];

  const queue: AppStatus[][] = [[from]];
  const seen = new Set<AppStatus>([from]);
  while (queue.length > 0) {
    const path = queue.shift() as AppStatus[];
    const last = path[path.length - 1];
    for (const next of TRANSITIONS[last] ?? []) {
      if (seen.has(next)) continue;
      if (next === to) return path.slice(1).concat(next);
      seen.add(next);
      queue.push(path.concat(next));
    }
  }
  return [];
}
