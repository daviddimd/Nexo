import {backupDatabase,restoreTestDatabase} from './backup-store';
try{
  const [command,file]=process.argv.slice(2);if(!file||process.argv.length!==4)throw new Error('Invalid arguments');
  const bin=process.env.NEXO_PG_BIN;
  if(command==='create'){
    const url=process.env.NEXO_BACKUP_DATABASE_URL;if(!url)throw new Error('Backup connection required');
    console.log(JSON.stringify(await backupDatabase(url,process.env.NEXO_DATABASE_SCHEMA??'public',file,bin)));
  }else if(command==='restore-test'){
    const url=process.env.NEXO_RESTORE_DATABASE_URL;if(!url)throw new Error('Restore connection required');
    console.log(JSON.stringify(await restoreTestDatabase(url,file,bin)));
  }else throw new Error('Invalid command');
}catch{console.error('No se pudo completar el respaldo/restauración. Revisa herramientas, conexión, archivo y destino exclusivo vacío.');process.exitCode=1;}
