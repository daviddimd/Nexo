// Ventana de entrega estimada a partir de un plazo en días hábiles (lunes a viernes, sin feriados).
// Las fechas son días calendario de Chile continental en formato AAAA-MM-DD, sin horas.
const santiago = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'});

export type DeliveryWindow = {from: string; to: string};

export function santiagoDay(moment: Date | string | number = Date.now()) {
 return santiago.format(new Date(moment));
}

export function addBusinessDays(day: string, days: number) {
 const date = new Date(day + 'T12:00:00Z');
 let remaining = days;
 while (remaining > 0) {
  date.setUTCDate(date.getUTCDate() + 1);
  const weekday = date.getUTCDay();
  if (weekday !== 0 && weekday !== 6) remaining--;
 }
 return date.toISOString().slice(0, 10);
}

export function deliveryWindow(base: Date | string | number, min: number | null | undefined, max: number | null | undefined): DeliveryWindow | null {
 if (min == null || max == null) return null;
 const start = santiagoDay(base);
 return {from: addBusinessDays(start, min), to: addBusinessDays(start, max)};
}

export function formatDay(day: string) {
 return new Date(day + 'T12:00:00Z').toLocaleDateString('es-CL', {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'}).replace(/[.,]/g, '');
}

export function describeWindow(window: DeliveryWindow | null) {
 if (!window) return '';
 return window.from === window.to ? `el ${formatDay(window.from)}` : `entre el ${formatDay(window.from)} y el ${formatDay(window.to)}`;
}
