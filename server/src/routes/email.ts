import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error.js';
import { parse, parseId, intQuery } from '../middleware/validate.js';
import { EMAIL_EVENT_TYPES } from '../domain/status.js';
import { analyzeEmails, applyEmailBatch, applyEmailItem, dismissEmailItem, listEmailItems } from '../services/email/email.service.js';
import {
  getAutoAnalyzeStatus,
  markAutoAnalyzeRan,
  runAutoEmailAnalyze,
} from '../services/email/autoAnalyze.service.js';

const router = Router();

const analyzeSchema = z.object({
  days: z.number().int().min(1).max(30).optional(),
  /** 是否同时扫描垃圾邮件文件夹（默认 true） */
  includeJunk: z.boolean().optional(),
  fullRescan: z.boolean().optional(),
  reanalyzePending: z.boolean().optional(),
});

router.post(
  '/analyze',
  asyncHandler(async (req, res) => {
    const input = parse(analyzeSchema, req.body ?? {});
    const result = await analyzeEmails(input.days ?? 14, input);
    // 手动分析也算“刚分析过”，避免定时任务紧接着再跑一遍
    markAutoAnalyzeRan(
      `手动分析：拉取 ${result.fetched} / 候选 ${result.candidates} / 新分析 ${result.analyzed}（去重跳过 ${result.skipped}）`,
    );
    res.status(201).json(result);
  }),
);

/** 定时分析状态（供设置页/排障查看：开关、时间点、上次结果、下次时间） */
router.get(
  '/auto-analyze',
  asyncHandler(async (_req, res) => {
    res.json(getAutoAnalyzeStatus());
  }),
);

/** 立即按定时规则跑一次（用于验证或手动触发补跑） */
router.post(
  '/auto-analyze/run',
  asyncHandler(async (_req, res) => {
    res.status(201).json(await runAutoEmailAnalyze('manual'));
  }),
);

router.get(
  '/items',
  asyncHandler(async (req, res) => {
    const q = req.query;
    res.json(
      listEmailItems({
        status: typeof q.status === 'string' ? q.status : undefined,
        page: intQuery(q.page, 1, { min: 1 }),
        pageSize: intQuery(q.pageSize, 20, { min: 1, max: 100 }),
      }),
    );
  }),
);

const extractedSchema = z.object({
  timeSource: z.literal('manual').optional(),
  timeEvidence: z.string().max(500).nullish(),
  attachments: z.array(z.object({ name: z.string(), status: z.enum(['parsed', 'skipped']), detail: z.string() })).optional(),
  company: z.string().nullable(),
  eventType: z.enum(EMAIL_EVENT_TYPES).nullable(),
  eventTime: z.string().nullable(),
  /** 时间段结束时间（如测评 19:00-21:00 的 21:00） */
  eventTimeEnd: z.string().nullish(),
  positionTitle: z.string().nullable(),
  summary: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

const applyOptionsSchema = z.object({
  markApplied: z.boolean().optional(),
  createIfMissing: z.boolean().optional(),
});

router.post(
  '/items/:id/apply',
  asyncHandler(async (req, res) => {
    const override = req.body?.extracted ? parse(extractedSchema, req.body.extracted) : undefined;
    const options = parse(applyOptionsSchema, req.body ?? {});
    res.status(201).json(applyEmailItem(parseId(req.params.id), override, options));
  }),
);

router.post(
  '/items/:id/dismiss',
  asyncHandler(async (req, res) => {
    res.json(dismissEmailItem(parseId(req.params.id)));
  }),
);

router.post(
  '/apply-batch',
  asyncHandler(async (req, res) => {
    const input = parse(
      z.object({
        minConfidence: z.number().min(0).max(1).optional(),
        markApplied: z.boolean().optional(),
        createIfMissing: z.boolean().optional(),
      }),
      req.body ?? {},
    );
    res.status(201).json(
      applyEmailBatch(input.minConfidence ?? 0.8, {
        markApplied: input.markApplied,
        createIfMissing: input.createIfMissing,
      }),
    );
  }),
);

export default router;
