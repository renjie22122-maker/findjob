import {beforeEach,describe,it,expect,vi} from 'vitest';
import type {AddressInfo} from 'node:net';
import express from 'express';
import {closeDb,getDb} from '../db/connection.js';
import {importSms} from './sms.service.js';
import {smsGateway} from '../routes/sms.js';
import {errorHandler} from '../middleware/error.js';
vi.mock('./settings.service.js',async importOriginal=>({...await importOriginal<typeof import('./settings.service.js')>(),getLlmConfig:()=>null}));
beforeEach(()=>{closeDb();getDb();});
describe('短信接入边界',()=>{
 it('验证码和无关短信在入库前过滤',async()=>{
   expect((await importSms({body:'招聘平台验证码 123456'})).status).toBe('filtered');
   expect((await importSms({body:'您的快递已经到达驿站'})).status).toBe('filtered');expect(getDb().prepare('SELECT COUNT(*) n FROM email_items').get()).toEqual({n:0});
 });
 it('短信独立入库，转发重试不重复，敏感链接不保存',async()=>{
   const body='【示例公司】招聘笔试时间2099年10月25日14:00-16:00 https://example.com/once?token=secret';
   const a=await importSms({body}),b=await importSms({body});expect(a.id).toBe(b.id);expect(b.duplicate).toBe(true);
   const row=getDb().prepare('SELECT * FROM email_items').get();expect(JSON.stringify(row)).not.toContain('token=secret');expect(JSON.stringify(row)).toContain('sms:');
 });
 it('手机网关须携带令牌，不能访问配置API，过滤返回成功避免重试',async()=>{
   const token='x'.repeat(40),app=express().use(smsGateway(token)).use(errorHandler);
   const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
   try{
     expect((await fetch(url+'/ingest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:'验证码123456'})})).status).toBe(401);
     expect(await (await fetch(url+'/ingest',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({body:'验证码123456'})})).json()).toMatchObject({status:'filtered'});
     expect((await fetch(url+'/api/settings',{headers:{Authorization:`Bearer ${token}`}})).status).toBe(404);
   }finally{await new Promise<void>(r=>server.close(()=>r()));}
 });
});
