import {z} from 'zod';
export const addressSchema = z.object({
  recipient: z.string().trim().min(3).max(100),
  phone: z.string().trim().regex(/^[+0-9 ()-]{7,30}$/),
  line1: z.string().trim().min(5).max(200),
  commune: z.string().trim().min(2).max(100),
  region: z.string().trim().min(2).max(100),
  country: z.literal('CL'),
  postalCode: z.string().trim().max(20).optional(),
}).strict();
export type ShippingAddress = z.infer<typeof addressSchema>;
