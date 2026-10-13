import {randomUUID} from 'node:crypto';
import {link,readFile,unlink,writeFile} from 'node:fs/promises';
import {z} from 'zod';

const identity=z.object({format:z.literal('nexo-installation-v1'),installationId:z.uuid()}).strict();
export async function readInstallation(path:string){return identity.parse(JSON.parse(await readFile(path,'utf8')));}
// Explicit initialization only: never silently regenerate an identity after loss.
export async function initializeInstallation(path:string){
  const value={format:'nexo-installation-v1' as const,installationId:randomUUID()};
  const temporary=`${path}.${randomUUID()}.tmp`;
  await writeFile(temporary,JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});
  try{
    try{await link(temporary,path);return value;}
    catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;return await readInstallation(path);}
  }finally{await unlink(temporary);}
}
