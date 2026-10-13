import { z } from 'zod';
import { uuid } from './schemas';

export const paymentIntentSchema = z.object({ orderId: uuid }).strict();
export const simulatorEventSchema = z.object({
  eventId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  intentId: uuid,
  transactionId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  status: z.enum(['SUCCEEDED', 'FAILED']),
  amountMinor: z.string().regex(/^(0|[1-9][0-9]{0,15})$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
}).strict();
export type SimulatorEvent = z.infer<typeof simulatorEventSchema>;
