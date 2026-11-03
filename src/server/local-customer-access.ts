/** Development-only access for the loopback environment started by npm run dev.
 * Does not mark an email verified; the same account requires verification elsewhere.
 */
export function localCustomerAccess(env:NodeJS.ProcessEnv=process.env){
 return env.NODE_ENV==='development'&&env.NEXO_LOCAL_SETUP_ENABLED==='true'&&env.NEXO_LOCAL_CUSTOMER_ACCESS==='true';
}
