import type {Pool} from 'pg';
import {z} from 'zod';
import {accountRate} from './account-rate';

const demoRequest = z.object({
  name: z.string().trim().min(1).max(120),
  consent: z.literal(true),
  website: z.string().max(254),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  plan: z.enum(['esencial','profesional','empresa','a-medida']),
}).strict();

export async function requestDemo(pool: Pool, raw: unknown) {
  const {email, plan, name, website} = demoRequest.parse(raw);
  if (website.trim()) return {accepted:true};
  await accountRate(pool, 'DEMO_REQUEST', email);
  await pool.query('INSERT INTO demo_requests(email,plan,contact_name,consent_at) VALUES($1,$2,$3,now()) ON CONFLICT DO NOTHING', [email,plan,name]);
  return {accepted:true};
}
