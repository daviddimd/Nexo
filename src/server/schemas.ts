import { z } from 'zod';
export const uuid = z.string().uuid().transform(value => value.toLowerCase());
const text = z.string().trim().min(1).max(200);
export const loginSchema = z.object({ company: z.string().trim().min(2).max(63), email: z.email().max(254).transform(v => v.toLowerCase()), password: z.string().min(1).max(128) }).strict();
export const productSchema = z.object({ sku: text, name: text, description: z.string().max(5000).default(''),
  categoryId:uuid.nullable().default(null),specifications:z.record(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),z.union([z.string().trim().min(1).max(200),z.number().finite(),z.boolean()])).refine(v=>Object.keys(v).length<=40).default({}),
  priceMinor: z.number().int().min(0).max(1e12), imageUrl: z.url().refine(v => v.startsWith('https://'), 'HTTPS requerido').nullable().default(null) }).strict();
export const productPatchSchema = productSchema.partial().extend({
  description:productSchema.shape.description.removeDefault().optional(),
  imageUrl:productSchema.shape.imageUrl.removeDefault().optional(),
  categoryId:productSchema.shape.categoryId.removeDefault().optional(),
  specifications:productSchema.shape.specifications.removeDefault().optional(),
  active: z.boolean().optional()
}).strict().refine(v => Object.keys(v).length > 0);
export const locationSchema = z.object({ name: text, kind: z.enum(['WEB','STORE']), shippingEnabled: z.boolean().default(false) }).strict();
export const locationPatchSchema = z.object({name: text.optional(), shippingEnabled: z.boolean().optional(), active: z.boolean().optional()}).strict().refine(v => Object.keys(v).length > 0);
export const userSchema = z.object({ email: z.email().max(254).transform(v=>v.toLowerCase()), name: text,
  password: z.string().min(12).max(128), role: z.enum(['AGENT','CUSTOMER']), locationIds: z.array(uuid).max(100).default([]) }).strict();
export const operationSchema = z.object({ kind: z.enum(['RECEIPT','ADJUSTMENT','SALE','TRANSFER']),
  productId: uuid, locationId: uuid, destinationId: uuid.optional(),
  quantity: z.number().int().min(-1000000).max(1000000).refine(v=>v!==0), reason: z.string().trim().min(3).max(500)
}).strict().superRefine((v, ctx) => {
  if (v.kind !== 'ADJUSTMENT' && v.quantity < 1) ctx.addIssue({code:'custom', message:'La cantidad debe ser positiva'});
  if (v.kind === 'TRANSFER' && (!v.destinationId || v.destinationId === v.locationId)) ctx.addIssue({code:'custom', message:'Se requiere un destino diferente'});
  if (v.kind !== 'TRANSFER' && v.destinationId) ctx.addIssue({code:'custom', message:'El destino solo se permite en transferencias'});
});
export type Operation = z.infer<typeof operationSchema>;
