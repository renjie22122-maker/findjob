import {z} from 'zod';
import {emailExtractionSchema} from '../llm/llm.client.js';
import {scheduleChangeSchema} from '../email/schedule.schema.js';

export const evidenceSchema=z.object({noticeId:z.number().int().positive(),quote:z.string().trim().min(2).max(2000)});
const common={reason:z.string().min(1).max(1200),confidence:z.number().min(0).max(1),question:z.string().max(1500).optional(),evidence:z.array(evidenceSchema).min(1).max(8)};
export const workActionSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('identify-company'),aliasId:z.number().int().positive(),canonicalId:z.number().int().positive(),...common}),
  z.object({type:z.literal('company-alias'),aliasId:z.number().int().positive(),canonicalId:z.number().int().positive(),userQuote:z.string().min(2).max(1000),reason:z.string().min(1).max(1200),confidence:z.number().min(0).max(1),question:z.string().optional(),evidence:z.array(evidenceSchema).default([])}),
  z.object({type:z.literal('complete-task'),reminderId:z.number().int().positive(),userQuote:z.string().min(2).max(1000),reason:z.string().min(1).max(1200),confidence:z.number().min(0).max(1),question:z.string().optional(),evidence:z.array(evidenceSchema).default([])}),
  z.object({type:z.literal('complete-activity'),scheduleId:z.number().int().positive(),revision:z.number().int().positive(),userQuote:z.string().min(2).max(1000),reason:z.string().min(1).max(1200),confidence:z.number().min(0).max(1),question:z.string().optional(),evidence:z.array(evidenceSchema).default([])}),
  z.object({type:z.literal('edit-activity'),scheduleId:z.number().int().positive(),revision:z.number().int().positive(),userQuote:z.string().min(2).max(1000),change:scheduleChangeSchema,eventTime:z.string().nullish(),eventTimeEnd:z.string().nullish(),reason:z.string().min(1).max(1200),confidence:z.number().min(0).max(1),question:z.string().optional(),evidence:z.array(evidenceSchema).default([])}),
  z.object({type:z.literal('resolve-decision'),decisionId:z.string().uuid(),userQuote:z.string().min(2).max(1000),reason:z.string().min(1).max(1200),confidence:z.number().min(0).max(1),question:z.string().optional(),evidence:z.array(evidenceSchema).default([])}),
  z.object({type:z.literal('apply-notice'),noticeId:z.number().int().positive(),targetScheduleId:z.number().int().positive().optional(),expectedScheduleRevision:z.number().int().positive().optional(),applicationId:z.number().int().positive().optional(),extraction:emailExtractionSchema,...common}),
  z.object({type:z.literal('link'),source:z.string().max(160),target:z.string().max(160),relation:z.string().regex(/^[a-z][a-z0-9_-]{0,60}$/),...common}),
  z.object({type:z.literal('item'),key:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),title:z.string().min(1).max(200),kind:z.string().min(1).max(60),state:z.string().min(1).max(60),data:z.record(z.unknown()).default({}),revision:z.number().int().nonnegative(),...common}),
  z.object({type:z.literal('share-reminders'),source:z.string(),target:z.string(),...common}),
]);
export const workPlanSchema=z.object({reply:z.string().min(1).max(8000),actions:z.array(workActionSchema).max(30),requestedNoticeIds:z.array(z.number().int().positive()).max(20).optional()});
export type WorkAction=z.infer<typeof workActionSchema>;
export type WorkPlan=z.infer<typeof workPlanSchema>;
export type WorkNode={id:string;kind:string;title:string;state:string;revision:number;data:Record<string,unknown>};
