import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/error.js';
import { parse } from '../middleware/validate.js';
import {
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_MODEL,
  getEmailConfig,
  getLlmConfig,
  setEmailConfig,
  setLlmConfig,
  settingsPayload,
} from '../services/settings.service.js';
import { testEmail } from '../services/email/email.service.js';
import { listLlmModels, testLlm } from '../services/llm/llm.client.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(settingsPayload());
  }),
);

const emailSchema = z.object({
  host: z.string().trim().min(1, '服务器不能为空'),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().trim().min(1, '账号不能为空'),
  password: z.string().optional(), // 留空 = 保持原值
  folder: z.string().trim().default('INBOX'),
  authMode: z.enum(['password', 'oauth2']).optional(),
  tenant: z.string().trim().optional(),
  clientId: z.string().trim().optional(),
});

const llmSchema = z.object({
  baseUrl: z.string().trim().min(1).default(DEFAULT_LLM_BASE_URL),
  apiKey: z.string().optional(), // 留空 = 保持原值
  model: z.string().trim().min(1).default(DEFAULT_LLM_MODEL),
});

const putSchema = z.object({
  email: emailSchema.optional(),
  llm: llmSchema.optional(),
});

router.put(
  '/',
  asyncHandler(async (req, res) => {
    const input = parse(putSchema, req.body);
    if (input.email) {
      const current = getEmailConfig();
      setEmailConfig({
        host: input.email.host,
        port: input.email.port,
        secure: input.email.secure,
        user: input.email.user,
        password: input.email.password !== undefined && input.email.password !== '' ? input.email.password : (current?.password ?? ''),
        folder: input.email.folder,
        authMode: input.email.authMode ?? current?.authMode ?? 'password',
        tenant: input.email.tenant ?? current?.tenant,
        clientId: input.email.clientId ?? current?.clientId,
      });
    }
    if (input.llm) {
      const current = getLlmConfig();
      setLlmConfig({
        baseUrl: input.llm.baseUrl,
        apiKey: input.llm.apiKey !== undefined && input.llm.apiKey !== '' ? input.llm.apiKey : (current?.apiKey ?? ''),
        model: input.llm.model,
      });
    }
    res.json(settingsPayload());
  }),
);

router.post(
  '/test-email',
  asyncHandler(async (_req, res) => {
    res.json(await testEmail());
  }),
);

router.post(
  '/test-llm',
  asyncHandler(async (_req, res) => {
    res.json(await testLlm());
  }),
);

const modelListSchema = z.object({
  baseUrl: z.string().trim().min(1).optional(),
  apiKey: z.string().optional(), // 仅用于本次请求，不写入数据库
});

/** 获取上游可用模型列表（用 POST 是为了允许携带未保存的草稿地址/Key，避免密钥出现在会被日志记录的 URL 里） */
router.post(
  '/llm/models',
  asyncHandler(async (req, res) => {
    const input = parse(modelListSchema, req.body ?? {});
    try {
      res.json(await listLlmModels(input));
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.badGateway(err instanceof Error ? err.message : '获取模型列表失败');
    }
  }),
);

export default router;
