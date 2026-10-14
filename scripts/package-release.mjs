import {cp,mkdir,readdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';

const root=resolve('.releases'),id=randomUUID(),temporary=join(root,`.tmp-${id}`);
try{
  const {version}=JSON.parse(await readFile('package.json','utf8'));
  if(!/^\d+\.\d+\.\d+(?:-beta\.[1-9]\d*)?$/.test(version))throw new Error('Invalid version');
  await mkdir(root,{recursive:true});await mkdir(temporary);
  await cp('.next/standalone',temporary,{recursive:true,dereference:true});
  await cp('.next/static',join(temporary,'.next/static'),{recursive:true});
  if(existsSync('public'))await cp('public',join(temporary,'public'),{recursive:true,dereference:true});
  await cp('.worker',join(temporary,'worker'),{recursive:true});
  // Worker imports Zod through shared validation; Next's trace does not retain its CJS entry.
  await cp('node_modules/zod',join(temporary,'node_modules/zod'),{recursive:true,dereference:true});
  await cp('scripts/verify-release.mjs',join(temporary,'verify-release.mjs'));
  const files=[];
  async function inspect(directory){
    for(const entry of await readdir(directory,{withFileTypes:true})){
      const path=join(directory,entry.name);
      if(entry.isSymbolicLink())throw new Error('Symlinks are not allowed in release');
      if(entry.isDirectory()){if(['.git','.nexo','.local-mail','.backups'].includes(entry.name))throw new Error('Private directory in release');await inspect(path);}
      else{
        if(/^\.env(?:\.|$)/.test(entry.name)||/\.private\.pem$|\.dump$/.test(entry.name))throw new Error('Private file in release');
        files.push({path:relative(temporary,path).replaceAll('\\','/'),sha256:createHash('sha256').update(await readFile(path)).digest('hex')});
      }
    }
  }
  await inspect(temporary);files.sort((a,b)=>a.path.localeCompare(b.path));
  await writeFile(join(temporary,'release-manifest.json'),JSON.stringify({version,platform:process.platform,architecture:process.arch,node:process.version,files},null,2)+'\n');
  const destination=join(root,`nexo-${version}-${id}`);await rename(temporary,destination);
  console.log(JSON.stringify({release:destination,version,files:files.length}));
}catch(error){await rm(temporary,{recursive:true,force:true});console.error('No se pudo empaquetar.',{code:error.code??error.message});process.exitCode=1;}
