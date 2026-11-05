import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const client=new Client({name:'careerflow-contract-test',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../dist/mcp.js',import.meta.url))],env:{...process.env,FINDJOB_DB_PATH:':memory:',CAREERFLOW_MCP_WRITE:'0'},stderr:'pipe'});
try{
 await client.connect(transport);
 const tools=await client.listTools();assert.equal(tools.tools.length,6);
 const graph=await client.callTool({name:'progress_graph',arguments:{}});const value=JSON.parse(graph.content[0].text);
 assert.equal(value.nodes.length,0);assert.equal(value.fingerprint.length,64);
 const agenda=await client.callTool({name:'progress_agenda',arguments:{from:'2099-01-01',to:'2099-12-31'}});assert.equal(JSON.parse(agenda.content[0].text).total,0);
 const invalidDate=await client.callTool({name:'progress_agenda',arguments:{from:'2099-13-40'}});assert.equal(invalidDate.isError,true);
 const history=await client.callTool({name:'progress_history',arguments:{}});assert.deepEqual(JSON.parse(history.content[0].text),[]);
 const write=await client.callTool({name:'progress_analyze',arguments:{message:'测试'}});assert.equal(write.isError,true);
 const invalid=await client.callTool({name:'progress_sources',arguments:{ids:[-1]}});assert.equal(invalid.isError,true);
 console.log('MCP passed: official SDK handshake, tool discovery, graph/history, read-only guard, schema validation.');
}finally{await client.close();}
