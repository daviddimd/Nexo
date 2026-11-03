/** Integer arithmetic keeps CLP amounts exact, including values above Number.MAX_SAFE_INTEGER. */
export function interpolateAmount(from:bigint,to:bigint,progress:number):bigint{
 if(!Number.isFinite(progress)||progress<=0)return from;
 if(progress>=1)return to;
 const step=BigInt(Math.floor(progress*1000000));
 return from+(to-from)*step/1000000n;
}
