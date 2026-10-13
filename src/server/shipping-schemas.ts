import { z } from 'zod';
import { itemsSchema } from './order-schemas';

export const addressSchema = z.object({
  recipient: z.string().trim().min(3).max(100),
  phone: z.string().trim().regex(/^[+0-9 ()-]{7,30}$/),
  line1: z.string().trim().min(5).max(200),
  commune: z.string().trim().min(2).max(100),
  region: z.string().trim().min(2).max(100),
  country: z.literal('CL'),
  postalCode: z.string().trim().max(20).optional(),
}).strict();
export const quoteRequestSchema = z.object({ items: itemsSchema, address: addressSchema }).strict();
export const quoteApprovalSchema = z.object({
  shippingMinor: z.string().regex(/^(0|[1-9][0-9]{0,12})$/).refine(value => BigInt(value) <= 1000000000000n),
  note: z.string().trim().min(3).max(500),
}).strict();
export const quoteRejectionSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
export type ShippingAddress = z.infer<typeof addressSchema>;
