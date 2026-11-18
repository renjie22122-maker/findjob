import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { getOverview, getTrends } from '../services/stats.service.js';
import { getToday } from '../services/today.service.js';
import { countPendingEmailItems } from '../services/email/email.service.js';
import {z} from 'zod';
import {parse} from '../middleware/validate.js';
import {listApplications} from '../services/applications.service.js';
import {STATUS} from '../domain/status.js';

const router = Router();
router.get('/applications',asyncHandler(async(req,res)=>{
 const q=parse(z.object({status:z.nativeEnum(STATUS).optional(),stage:z.enum(['applied','interviewed','offer']).optional(),page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(20)}).strict().refine(q=>Boolean(q.status)!==Boolean(q.stage),'Choose either status or stage'),req.query);
 res.json(listApplications({statuses:q.status?[q.status]:undefined,funnelStage:q.stage,page:q.page,pageSize:q.pageSize}));
}));

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const stats = getOverview();
    res.json({ ...stats, pendingEmails: countPendingEmailItems() });
  }),
);

router.get(
  '/trends',
  asyncHandler(async (req, res) => {
    const range=parse(z.object({days:z.coerce.number().int().min(1).max(365).default(30),end:z.string().date().optional()}),req.query);
      const days=range.days;
    res.json({ items: getTrends(days,range.end) });
  }),
);

router.get(
  '/today',
  asyncHandler(async (_req, res) => {
    res.json(getToday());
  }),
);

export default router;
