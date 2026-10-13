import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const result=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','scripts/expire-orders.ts','--outDir','.worker',
  '--module','commonjs','--moduleResolution','node','--target','ES2022','--esModuleInterop','--skipLibCheck','--strict'],{stdio:'inherit',windowsHide:true});
if(result.status!==0)process.exit(result.status??1);
await mkdir('.worker',{recursive:true});await writeFile('.worker/package.json',JSON.stringify({type:'commonjs'})+'\n');
