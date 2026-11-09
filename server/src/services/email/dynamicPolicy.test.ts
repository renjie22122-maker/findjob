import {it,expect} from 'vitest';
import {dynamicResource} from './dynamicPolicy.js';
const entry=new URL('https://example.org/instructions');
it('仅放行同源静态资源和明确说明JSON；不让AI扩大网络权限',()=>{
 expect(dynamicResource(entry,'https://example.org/app.js?v=2','GET','script')).toBe('script');
 expect(dynamicResource(entry,'https://example.org/schedule.json','GET','fetch')).toBe('data');
 for(const [url,method,type] of [['https://example.org/start','GET','fetch'],['https://example.org/schedule.json','POST','fetch'],['https://example.org/schedule.json?token=secret','GET','fetch'],['https://evil.org/app.js','GET','script'],['https://example.org/api/login','GET','fetch'],['https://example.org/question.json','GET','fetch'],['https://example.org/app.js?candidateId=secret','GET','script'],['https://example.org/confirm','GET','document']])expect(dynamicResource(entry,url,method,type)).toBeNull();
});
