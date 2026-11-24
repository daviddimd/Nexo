export type Stage = 'prepare' | 'preparing' | 'dispatched' | 'delivered';
export type Address = {recipient: string; phone: string; line1: string; commune: string; region: string; country?: string; postalCode?: string};
export type DispatchRow = {
 id: string; created_at: string; paid_at: string; fulfilled_at: string | null; status: string; total_minor: string;
 location_id: string; location_name: string; shipping_address: Address | null; units: number;
 shipment_status: 'PREPARING' | 'DISPATCHED' | 'DELIVERED' | null; carrier: string | null; tracking_code: string | null; estimated_delivery: string | null;
 prepared_at: string | null; dispatched_at: string | null; delivered_at: string | null; stage: Stage; blocked: boolean;
};
export type Shipment = {status: 'PREPARING' | 'DISPATCHED' | 'DELIVERED'; carrier: string | null; tracking_code: string | null; estimated_delivery: string | null; prepared_at: string | null; dispatched_at: string | null; delivered_at: string | null};
export type OrderEvent = {id: string; type: string; reason: string; created_at: string};
export type OrderDetail = {
 id: string; status: string; total_minor: string; shipping_minor: string; paid_at: string | null; fulfilled_at: string | null;
 shipping_address: Address | null; items: {product_id: string; sku: string; name: string; quantity: number}[]; events: OrderEvent[]; shipment: Shipment | null;
};

export const stageLabels: Record<Stage, string> = {prepare: 'Por preparar', preparing: 'En preparación', dispatched: 'Despachado', delivered: 'Entregado'};
export const stageHints: Record<Stage, string> = {prepare: 'Pagados, aún sin armar', preparing: 'Se están armando', dispatched: 'Entregados al transportista', delivered: 'Recepción confirmada'};
export const stageBadge: Record<Stage, 'warning' | 'info' | 'positive' | 'neutral'> = {prepare: 'warning', preparing: 'info', dispatched: 'neutral', delivered: 'positive'};
export const eventLabels: Record<string, string> = {
 RESERVED: 'Pedido creado', PAYMENT_RECORDED: 'Pago registrado', FULFILLED: 'Despachado', SHIPMENT_PREPARING: 'En preparación',
 SHIPMENT_UPDATED: 'Datos de despacho corregidos', SHIPMENT_DELIVERED: 'Entrega confirmada', REFUND_RECORDED: 'Reembolso registrado',
 RETURN_RECEIVED: 'Devolución recibida', CAPTURE_RESOLVED: 'Pago revisado', CANCELLED: 'Cancelado', EXPIRED: 'Reserva vencida',
};
export const carriers = ['Chilexpress', 'Starken', 'Correos de Chile', 'Blue Express', 'Reparto propio'];

export const money = (value: string) => new Intl.NumberFormat('es-CL', {style: 'currency', currency: 'CLP', maximumFractionDigits: 0}).format(BigInt(value));
export const shortId = (id: string) => '#' + id.slice(0, 8).toUpperCase();
export const dateTime = (value: string | null) => value ? new Date(value).toLocaleString('es-CL', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'}) : '—';
export const dayLabel = (value: string | null) => value ? new Date(value + 'T12:00:00').toLocaleDateString('es-CL', {weekday: 'short', day: '2-digit', month: 'short'}) : '—';

export function ago(value: string | null, now = Date.now()) {
 if (!value) return '';
 const minutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60000));
 if (minutes < 1) return 'hace un momento';
 if (minutes < 60) return `hace ${minutes} min`;
 const hours = Math.floor(minutes / 60);
 if (hours < 48) return `hace ${hours} h`;
 return `hace ${Math.floor(hours / 24)} días`;
}
export const isLate = (row: Pick<DispatchRow, 'stage' | 'paid_at' | 'blocked'>, now = Date.now()) =>
 (row.stage === 'prepare' || row.stage === 'preparing') && !row.blocked && now - new Date(row.paid_at).getTime() > 24 * 3600 * 1000;

export function stageOf(order: Pick<OrderDetail, 'status' | 'shipment'>): Stage {
 if (order.shipment?.status === 'DELIVERED') return 'delivered';
 if (order.status === 'FULFILLED') return 'dispatched';
 if (order.shipment?.status === 'PREPARING') return 'preparing';
 return 'prepare';
}
export const addressText = (a: Address) => [a.recipient, a.line1, `${a.commune}, ${a.region}`, a.postalCode ? `CP ${a.postalCode}` : '', a.phone].filter(Boolean).join('\n');
