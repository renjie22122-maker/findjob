import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { intQuery, stringQuery } from '../middleware/validate.js';
import { clearAudits, listAudits } from '../services/audit.service.js';

/** GET /api/audit —— 出站调用审计列表（分页 + 类型过滤） */
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = req.query;
    res.json(
      listAudits({
        kind: stringQuery(q.kind, 50),
        page: intQuery(q.page, 1, { min: 1 }),
        pageSize: intQuery(q.pageSize, 20, { min: 1, max: 100 }),
      }),
    );
  }),
);

router.delete(
  '/',
  asyncHandler(async (_req, res) => {
    clearAudits();
    res.status(204).end();
  }),
);

export default router;
