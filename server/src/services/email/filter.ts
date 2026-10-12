/**
 * 招聘相关邮件初筛（文档 04 §3.8）
 *
 * 改进点：原实现只有 19 个区分大小写的关键词且只看“主题+发件人”，
 * 导致英文邮件、ATS 平台通知、HR 邮箱后缀类邮件在进 AI 前就被丢掉（与最终归为 other 无关）。
 * 现在改为：强关键词命中 1 个即通过；仅命中弱关键词需 ≥ 2 个（避免“账单/通知”误报）；
 * 关键词不中时再看发件人（本地部分或 ATS 域名）；全部大小写不敏感。
 */
const STRONG_KEYWORDS = [
  '招聘',
  '职位',
  '岗位',
  '面试',
  '笔试',
  '测评',
  '在线测评',
  '在线考试',
  '简历',
  '投递',
  '内推',
  '校招',
  '秋招',
  '春招',
  '实习',
  '宣讲',
  '空宣',
  '双选',
  '网申',
  '录用',
  'offer',
  '感谢投递',
  '申请进展',
  '申请状态',
  '面试邀请',
  '笔试通知',
  '录用通知',
  '意向书',
  '背调',
  '签三方',
  '编程测试',
  '性格测试',
  'interview',
  'assessment',
  'online test',
  'coding test',
  'job application',
  'offer letter',
  'thank you for applying',
  'shortlisted',
  'recruiter',
  'recruiting',
  'campus recruitment',
  'hackerrank',
  'codility',
  'hirevue',
];

const WEAK_KEYWORDS = [
  '申请',
  '通知',
  '人才',
  '人力',
  '候选',
  '入职',
  '测试',
  '学历',
  '毕业',
  'apply',
  'application',
  'position',
  'graduate',
  'campus',
  'screening',
  'career',
  'jobs',
];

/** 发件人本地部分（@ 前）启发式：hr@、jobs@、careers@、talent@、ehr@… */
const SENDER_LOCAL_PATTERNS = [
  /^(hr|ehr|shr|job|jobs|career|careers|recruit|recruiting|recruitment|talent|apply|application|hiring|campus|zhaopin|xiaozhao|zp)/i,
];

/** 常见 ATS / 招聘平台域名后缀 */
const SENDER_DOMAIN_PATTERNS = [
  /mokahr\.com$/i,
  /zhaopin\.com$/i,
  /chinahr\.com$/i,
  /51job\.com$/i,
  /beisen\.com$/i,
  /nowcoder\.com$/i,
  /lagou\.com$/i,
  /liepin\.com$/i,
  /dajie\.com$/i,
  /zhipin\.com$/i,
  /shixiseng\.com$/i,
  /yingjiesheng\.com$/i,
  /workday\.com$/i,
  /myworkdayjobs\.com$/i,
  /greenhouse\.io$/i,
  /lever\.co$/i,
  /icims\.com$/i,
  /taleo\.net$/i,
  /smartrecruiters\.com$/i,
  /hirevue\.com$/i,
  /hackerrank\.com$/i,
  /codility\.com$/i,
];

export function isRecruitmentCandidate(subject: string, sender: string): boolean {
  const haystack = `${subject} ${sender}`.toLowerCase();

  if (STRONG_KEYWORDS.some((k) => haystack.includes(k))) return true;

  const weakHits = new Set(WEAK_KEYWORDS.filter((k) => haystack.includes(k)));
  if (weakHits.size >= 2) return true;

  const email = (sender.match(/<([^>]+)>/)?.[1] ?? sender).trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at > 0) {
    const local = email.slice(0, at);
    const domain = email.slice(at + 1);
    if (SENDER_LOCAL_PATTERNS.some((re) => re.test(local))) return true;
    if (SENDER_DOMAIN_PATTERNS.some((re) => re.test(domain))) return true;
  }

  return false;
}

/** 供测试与调试使用 */
export const FILTER_KEYWORDS = { strong: STRONG_KEYWORDS, weak: WEAK_KEYWORDS };
