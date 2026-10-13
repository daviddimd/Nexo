import {readdir,readFile} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export async function verifyRelease(directory){
  const root=resolve(directory),manifest=JSON.parse(await readFile(join(root,'release-manifest.json'),'utf8'));
  if(manifest.platform!==process.platform||manifest.architecture!==process.arch)throw new Error('Platform mismatch');
  if(!Array.isArray(manifest.files)||manifest.files.length===0)throw new Error('Invalid manifest');
  const actual=[];
  async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){
    const path=join(dir,entry.name);if(entry.isSymbolicLink())throw new Error('Symlink found');
    if(entry.isDirectory())await walk(path);
    else if(path!==join(root,'release-manifest.json'))actual.push({path:relative(root,path).replaceAll('\\','/'),sha256:createHash('sha256').update(await readFile(path)).digest('hex')});
  }}
  await walk(root);actual.sort((a,b)=>a.path.localeCompare(b.path));
  if(JSON.stringify(actual)!==JSON.stringify(manifest.files))throw new Error('File integrity mismatch');
  return {valid:true,version:manifest.version,files:actual.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{if(process.argv.length!==3)throw new Error();console.log(JSON.stringify(await verifyRelease(process.argv[2])));}
  catch{console.error('Paquete inválido o incompatible.');process.exitCode=1;}
}
