/** Local stdio transport: stdout is reserved for MCP frames. No HTTP listener. */
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {workGraph,workSources} from './services/work/graph.js';
import {workHistory,runWorkAnalysis,workFingerprint,applyWorkPlan} from './services/work/engine.js';
import {workPlanSchema} from './services/work/schema.js';
import {redactMailSecrets} from './services/email/contentSafety.js';

const server=new McpServer({name:'careerflow-progress',version:'1.0.0'});
const writeEnabled=process.env.CAREERFLOW_MCP_WRITE==='1';
const content=(data:unknown)=>({content:[{type:'text' as const,text:redactMailSecrets(JSON.stringify(data))}]});
const guard=()=>{if(!writeEnabled)throw new Error('MCP writes are disabled. Set CAREERFLOW_MCP_WRITE=1 for this trusted local agent.');};
server.registerTool('progress_graph',{description:'Read linked organizations, applications, activities, messages and custom milestones. Links do not merge entities. Paginated with direct neighbours; no secrets or mailbox access.',inputSchema:{query:z.string().max(200).default(''),offset:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(100).default(40)},annotations:{readOnlyHint:true}},async q=>content({...workGraph(q.query,q.offset,q.limit),fingerprint:workFingerprint()}));
server.registerTool('progress_sources',{description:'Read redacted local notice evidence by ID. Never opens links, attachments, logins or remote images.',inputSchema:{ids:z.array(z.number().int().positive()).min(1).max(40)},annotations:{readOnlyHint:true}},async q=>content(workSources(q.ids)));
server.registerTool('progress_history',{description:'Read recent applied changes and unresolved exceptions, with before/after evidence.',annotations:{readOnlyHint:true}},async()=>content(workHistory()));
server.registerTool('progress_analyze',{description:'Use the configured AI API to relate local sources and automatically apply validated non-destructive changes. Retains completion and audit history. Requires CAREERFLOW_MCP_WRITE=1. Does not open recruitment links.',inputSchema:{message:z.string().min(1).max(4000),noticeIds:z.array(z.number().int().positive()).max(40).optional()},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true}},async q=>{guard();return content(await runWorkAnalysis(q.message,q.noticeIds));});
server.registerTool('progress_apply_plan',{description:'Submit an evidence-backed structured plan using a fresh graph fingerprint and stable requestId for idempotence. Same validation as the app. No SQL, shell, settings or secrets access. Uncertain or invalid changes are recorded as exceptions, not forced.',inputSchema:{requestId:z.string().uuid(),fingerprint:z.string().length(64),message:z.string().max(4000),plan:workPlanSchema},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true}},async q=>{guard();return content(applyWorkPlan(q.plan,q.message,q.fingerprint,false,q.requestId));});
await server.connect(new StdioServerTransport());
