import { getDb } from '../../db/connection.js';
import { AppError } from '../../middleware/error.js';
import type { EmailExtraction } from '../../domain/types.js';

/** Company membership alone is never evidence that two applications are the same. */
export function matchEmailApplication(companyId: number, extraction: EmailExtraction, target?: number | null): { id: number } | undefined {
  const db = getDb();
  const apps = db.prepare('SELECT id, position_title FROM applications WHERE company_id = ?').all(companyId) as { id: number; position_title: string }[];
  if (target === null) return undefined; // Explicitly create a separate application.
  if (target !== undefined) {
    const app = apps.find(a => a.id === target);
    if (!app) throw AppError.validation('所选申请不属于此公司，请核对公司和申请');
    return app;
  }
  const ref = extraction.recruitmentId?.trim();
  let matches: { id: number }[];
  if (ref) {
    const records = db.prepare("SELECT application_id, extracted FROM email_items WHERE status = 'confirmed' AND application_id IS NOT NULL").all() as { application_id: number; extracted: string | null }[];
    const ids = new Set(records.filter(row => {
      try { return (JSON.parse(row.extracted ?? '{}') as EmailExtraction).recruitmentId?.trim() === ref; } catch { return false; }
    }).map(row => row.application_id));
    matches = apps.filter(a => ids.has(a.id) || a.position_title.endsWith(` [${ref}]`));
    // A different ID must not fall back to matching the same generic job title.
  } else if (extraction.positionTitle?.trim()) {
    // Human-confirmed merges/renames retain exact historical job names as aliases.
    // Only confirmed mails within the same company count; ambiguous aliases still fail below.
    const title=extraction.positionTitle.trim();
    const records=db.prepare("SELECT application_id,extracted FROM email_items WHERE status='confirmed' AND application_id IS NOT NULL").all() as {application_id:number;extracted:string|null}[];
    const aliases=new Set(records.filter(r=>{try{return (JSON.parse(r.extracted ?? '{}') as EmailExtraction).positionTitle?.trim()===title;}catch{return false;}}).map(r=>r.application_id));
    matches = apps.filter(a => a.position_title === title || aliases.has(a.id));
  } else {
    if (apps.length) throw AppError.conflict('岗位或职位编号缺失，同公司可能有多个匹配岗位，请明确选择已有申请或新建独立申请');
    matches = [];
  }
  if (matches.length > 1) throw AppError.conflict('同公司存在多个匹配岗位，请明确选择申请');
  return matches[0];
}
