/** Reviewed platform contracts, independent of employers. Never learned from email/LLM output. */
export const instructionRoutes=[{
 id:'nowcoder-exam-summary',
 hosts:['exam.nowcoder.com'],
 path:/^\/cts\/\d{1,12}\/summary$/,
 queryKeys:['id'],
 documentation:'https://www.nowcoder.com/pretest/jd',
 description:'平台公开操作说明：考试链接先展示试卷名称、考试时间和时长；拍照及开始答题是后续独立操作。仅允许静态GET，不携带会话，不执行后续操作。',
}] as const;

export function instructionRoute(url:URL){
 return instructionRoutes.find(p=>p.hosts.some(host=>host===url.hostname)&&p.path.test(url.pathname)&&
  [...url.searchParams.keys()].every(key=>p.queryKeys.some(allowed=>allowed===key))&&
  [...url.searchParams.keys()].every(key=>url.searchParams.getAll(key).length===1)&&
  [...url.searchParams.values()].every(value=>/^[a-zA-Z0-9_-]{1,160}$/.test(value)));
}
