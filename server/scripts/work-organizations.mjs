// Explicit local maintenance; preserves original companies and audits every redirect.
import Database from 'better-sqlite3';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1];
const path=process.env.FINDJOB_DB_PATH||fileURLToPath(new URL('../data/findjob.db',import.meta.url));
if(args.includes('--apply')){
 const original=new Database(path,{readonly:true});
 await original.backup(fileURLToPath(new URL(`../data/before-organizations-${Date.now()}.db`,import.meta.url)));original.close();
}
process.env.FINDJOB_DB_PATH=path;
const {getDb,closeDb}=await import('../dist/db/connection.js');
const {aliasCompany,reconcileOrganizationNames}=await import('../dist/services/work/organizations.js');
try{
 if(args.includes('--apply')){
  if(args.includes('--normalize'))console.log({normalized:reconcileOrganizationNames()});
  if(args.includes('--alias')){
   const source=Number(value('--alias')),target=Number(value('--canonical')),reason=value('--reason');
   if(!Number.isInteger(source)||!Number.isInteger(target)||!reason)throw Error('Required: --alias ID --canonical ID --reason TEXT');
   console.log(aliasCompany(source,target,reason));
  }
 }
 console.log(JSON.stringify(getDb().prepare('SELECT c.id,c.name,a.canonical_id FROM companies c LEFT JOIN company_aliases a ON a.alias_id=c.id ORDER BY c.id').all(),null,2));
}finally{closeDb();}
