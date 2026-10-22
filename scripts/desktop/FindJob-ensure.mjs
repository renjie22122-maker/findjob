import {existsSync,openSync,closeSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createConnection} from 'node:net';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const data=path.join(root,'server/data');
if(existsSync(path.join(data,'service-paused')))process.exit(0);
// An occupied port is never killed or taken over. Scheduled-task IgnoreNew
// prevents concurrent managed launches; the server also enforces port binding.
const occupied=await new Promise(resolve=>{
  const socket=createConnection({host:'127.0.0.1',port:3001});
  socket.setTimeout(3000);
  socket.once('connect',()=>{socket.destroy();resolve(true);});
  socket.once('error',()=>{socket.destroy();resolve(false);});
  socket.once('timeout',()=>{socket.destroy();resolve(true);});
});
if(occupied)process.exit(0);
const entry=path.join(root,'server/dist/index.js');
if(!existsSync(entry))throw new Error('Build FindJob before starting the receiver');
const env=path.join(data,'sms-gateway.env');
const args=existsSync(env)?[`--env-file=${env}`,entry]:[entry];
const output=openSync(path.join(data,'managed-server.log'),'a');
const errors=openSync(path.join(data,'managed-server-error.log'),'a');
const child=spawn(process.execPath,args,{cwd:root,windowsHide:true,stdio:['ignore',output,errors]});
closeSync(output);closeSync(errors);
child.on('error',()=>{process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
