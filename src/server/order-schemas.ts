import { z } from 'zod';
import { uuid } from './schemas';
import {addressSchema} from './shipping-address';

export const itemsSchema = z.array(z.object({
  productId: uuid,
  quantity: z.number().int().min(1).max(1000000),
}).strict()).min(1).max(50).superRefine((items, context) => {
  if (new Set(items.map(item => item.productId)).size !== items.length) {
    context.addIssue({ code: 'custom', message: 'Agrupa cada producto en una sola línea' });
  }
});

export const onlineOrderSchema = z.object({
  fulfillment: z.enum(['PICKUP', 'SHIP']),
  locationId: uuid.optional(),
  shippingQuoteId: uuid.optional(),
  shippingRateId: uuid.optional(),
  address: addressSchema.optional(),
  expectedTotalMinor:z.string().regex(/^(0|[1-9][0-9]{0,15})$/).optional(),
  items: itemsSchema,
}).strict().superRefine((input, context) => {
  if (input.fulfillment === 'PICKUP' && !input.locationId) {
    context.addIssue({ code: 'custom', message: 'Elige una sucursal para retirar' });
  }
  if (input.fulfillment === 'SHIP' && input.locationId) {
    context.addIssue({ code: 'custom', message: 'El servidor selecciona el origen del envío' });
  }
  if (input.fulfillment === 'SHIP' && !input.shippingQuoteId && !input.shippingRateId) {
    context.addIssue({ code: 'custom', message: 'Selecciona un destino de envío habilitado' });
  }
  if(input.fulfillment==='SHIP'&&input.shippingRateId&&(!input.address||!input.expectedTotalMinor||input.shippingQuoteId))context.addIssue({code:'custom',message:'Selecciona destino, dirección y total confirmado'});
  if(input.fulfillment==='SHIP'&&!input.shippingRateId&&(input.address||input.expectedTotalMinor))context.addIssue({code:'custom',message:'El envío directo requiere una tarifa'});
  if(input.fulfillment==='PICKUP'&&(input.shippingRateId||input.address||input.expectedTotalMinor))context.addIssue({code:'custom',message:'El retiro no admite datos de envío'});
  if (input.fulfillment === 'PICKUP' && input.shippingQuoteId) {
    context.addIssue({ code: 'custom', message: 'El retiro no admite cotización de envío' });
  }
});

export const manualPaymentSchema = z.object({
  amountMinor: z.string().regex(/^(0|[1-9][0-9]{0,15})$/),
  method: z.enum(['CASH', 'CARD', 'TRANSFER']),
  reference: z.string().trim().min(3).max(120).refine(value => !value.startsWith('simulator:'), 'Referencia reservada por el sistema'),
}).strict();

export const localSaleSchema = z.object({
  locationId: uuid,
  items: itemsSchema,
  payment: manualPaymentSchema,
}).strict();

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3).max(500),
}).strict();

export const orderSettingsSchema = z.object({
  reservationMinutes: z.number().int().min(1).max(60),
}).strict();

export type CartItem = z.infer<typeof itemsSchema>[number];
export type OnlineOrderInput = z.infer<typeof onlineOrderSchema>;
export type ManualPayment = z.infer<typeof manualPaymentSchema>;
