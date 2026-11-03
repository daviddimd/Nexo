import { z } from 'zod';
import { itemsSchema } from './order-schemas';

export {addressSchema} from './shipping-address';
import {addressSchema} from './shipping-address';
export const quoteRequestSchema = z.object({ items: itemsSchema, address: addressSchema }).strict();
export const quoteApprovalSchema = z.object({
  shippingMinor: z.string().regex(/^(0|[1-9][0-9]{0,12})$/).refine(value => BigInt(value) <= 1000000000000n),
  note: z.string().trim().min(3).max(500),
}).strict();
export const quoteRejectionSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
export type ShippingAddress = z.infer<typeof addressSchema>;
