import {it,expect,vi} from 'vitest';
import {boundedImap,imapFailure} from './imapReliability.js';
it('classifies failures without leaking upstream credentials or payloads',()=>{
 expect(imapFailure({code:'ENOTFOUND',message:'secret@example.com'}).kind).toBe('dns');
 expect(imapFailure({authenticationFailed:true,message:'private'}).retry).toBe(false);
 expect(imapFailure({code:'ECONNRESET'}).kind).toBe('connection');
 expect(JSON.stringify(imapFailure(new Error('PRIVATE PAYLOAD')))).not.toContain('PRIVATE');
});
it('closes a stuck session and releases its deadline timer',async()=>{
 vi.useFakeTimers();try{const close=vi.fn();const promise=boundedImap({close},()=>new Promise(()=>{}),50);const check=expect(promise).rejects.toMatchObject({code:'IMAP_SESSION_TIMEOUT'});await vi.advanceTimersByTimeAsync(50);await check;expect(close).toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);}finally{vi.useRealTimers();}
});
it('closes successful sessions without waiting indefinitely for logout',async()=>{const close=vi.fn();expect(await boundedImap({close},async()=>42,100)).toBe(42);expect(close).toHaveBeenCalledTimes(1);});
