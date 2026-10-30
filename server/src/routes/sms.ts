import {Router,json,urlencoded} from 'express';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {asyncHandler} from '../middleware/error.js';
import {parse} from '../middleware/validate.js';
import {importSms} from '../services/sms.service.js';
import {getDb} from '../db/connection.js';

const schema=z.object({body:z.string().trim().min(5).max(12000),sender:z.string().max(100).optional(),receivedAt:z.string().datetime({offset:true}).optional()});
export const smsRouter=Router();
smsRouter.get('/status',(_req,res)=>{
  const db=getDb();res.json({receipts:db.prepare('SELECT received_at AS receivedAt,outcome,item_id AS itemId,duplicate,diagnostic FROM sms_gateway_receipts ORDER BY id DESC LIMIT 10').all()});
});
smsRouter.post('/import',asyncHandler(async(req,res)=>{res.json(await importSms(parse(schema,req.body)));}));
/** Mount this router alone on the phone-facing port; never expose the settings APIs. */
export function smsGateway(token:string){
  const router=Router();let requests:number[]=[];
  router.use((req,res,next)=>{
    const actual=Buffer.from(req.headers.authorization??''),expected=Buffer.from(`Bearer ${token}`);
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected)){res.status(401).json({error:'Unauthorized'});return;}
    requests=requests.filter(t=>Date.now()-t<60000);if(requests.length>=10){res.status(429).json({error:'Too many requests'});return;}requests.push(Date.now());next();
  });
  router.post('/ingest',json({limit:'24kb'}),urlencoded({extended:false,limit:'24kb'}),asyncHandler(async(req,res)=>{
    const db=getDb(),received=new Date().toISOString(),diagnostic=req.headers['x-findjob-diagnostic']==='1'?1:0;
    const receipt=(outcome:string,itemId:number|null=null,duplicate=false)=>{
      // No message body, sender, token, or authentication content enters diagnostics.
      db.prepare('INSERT INTO sms_gateway_receipts(received_at,outcome,item_id,duplicate,diagnostic) VALUES (?,?,?,?,?)').run(received,outcome,itemId,duplicate?1:0,diagnostic);
      db.prepare('DELETE FROM sms_gateway_receipts WHERE id NOT IN (SELECT id FROM sms_gateway_receipts ORDER BY id DESC LIMIT 200)').run();
    };
    try{
      const result=await importSms(parse(schema,{body:req.body?.body??req.body?.content,sender:req.body?.sender??req.body?.from,receivedAt:req.body?.receivedAt}));
      receipt(result.status,result.id,result.duplicate);res.json(result);
    }catch(error){receipt('failed');throw error;}
  }));
  return router;
}
