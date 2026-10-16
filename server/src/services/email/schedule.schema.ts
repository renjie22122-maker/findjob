import { z } from 'zod';

export const scheduleChangeSchema = z.object({
  action: z.enum(['create', 'update', 'reschedule', 'cancel', 'restore']),
  eventRef: z.string().max(120).nullish(),
  round: z.string().max(100).nullish(),
  previousTime: z.string().nullish(),
  mode: z.enum(['online', 'offline', 'unknown']).optional(),
  venue: z.string().max(200).nullish(),
  address: z.string().max(500).nullish(),
  room: z.string().max(100).nullish(),
  timezone: z.string().max(80).nullish(),
  timeKind: z.enum(['start', 'deadline', 'window']).optional(),
  evidence: z.string().max(2000).nullish(),
});
