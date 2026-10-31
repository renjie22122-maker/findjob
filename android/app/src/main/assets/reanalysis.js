let batchSnapshot='';
function renderReanalysis(){
 const s=JSON.parse(CareerFlow.reanalysisState?.()||'{"status":"idle","total":0,"finished":0,"failed":0}');
 $('reanalysisTitle').textContent=t('重新分析已有通知','Reanalyze saved messages');
 $('reanalysisHelp').textContent=t('使用当前 AI 重新检查本机全部邮件、短信及已提取附件；会消耗 API 额度。逐条处理，保留完成状态与修改记录。暂停在当前通知处理后生效。','Review all saved email, SMS and extracted attachments with the current AI; uses API credits. Runs one at a time and preserves completion and history. Pause takes effect after the current message.');
 const processed=s.processed??((s.finished||0)+(s.failed||0)),pct=s.total?Math.floor(processed/s.total*100):0;
 $('reanalysisProgress').value=pct;$('reanalysisProgress').setAttribute('aria-label',t('重新分析进度','Reanalysis progress'));$('reanalysisPercent').textContent=pct+'%';
 const phase=({offline:t('没有网络，连接后自动继续','Offline; resumes when connected'),low_battery:t('电量偏低，充电后自动继续','Low battery; resumes when charged'),device_idle:t('系统深度休眠，唤醒后自动继续','Device idle; resumes when scheduling returns'),scheduled:t('已排队，等待系统调度','Queued; waiting for system scheduling'),requesting:t('正在等待 AI 返回','Waiting for AI response'),validating:t('正在核对时间证据（第二次请求）','Validating time evidence (second request)'),queued:t('等待网络、电量或后台调度','Waiting for network, battery or scheduling'),analyzing:t('正在分析下一条','Analyzing the next message'),waiting_analysis:t('等待当前自动分析完成','Waiting for current automatic analysis'),cooling:t('设备温度较高，等待降温','Device is hot; waiting to cool'),paused:t('已暂停','Paused'),errors:t('连续失败或认证错误，已暂停，请检查 API','Paused after repeated failures or authentication error; check API'),key_required:t('请先配置 API，然后继续','Configure API, then resume'),completed:t('本轮处理结束','Batch finished')}[s.reason||s.phase]||t('尚未开始','Not started'));
 $('reanalysisStatus').textContent=phase+' · '+t('已分析 ','Analyzed ')+(s.finished||0)+' / '+(s.total||0)+' · '+t('失败 ', 'Failed ')+(s.failed||0);
 if(s.status==='running'&&s.updated){$('reanalysisStatus').textContent+=' · '+t('此阶段已用 ','Stage elapsed ')+Math.floor((s.elapsedSeconds||0)/60)+t('分','m')+((s.elapsedSeconds||0)%60)+t('秒','s');if(s.currentNotice)$('reanalysisStatus').textContent+=' · '+t('通知 #','Message #')+s.currentNotice;}
 if(s.status==='running'&&['requesting','validating'].includes(s.reason))$('reanalysisStatus').textContent+=' · '+t('单次请求超时上限 ','Request timeout ')+(s.requestTimeoutSeconds||90)+t('秒；完成一条后更新进度','s; progress advances after each message');
 if(s.lastError)$('reanalysisStatus').textContent+=' · '+({output_limit:t('输出额度不足，请在设置提高最大输出 tokens 后重试失败项','Output limit reached; increase maximum output tokens, then retry failed items'),timeout:t('请求超时，可重试失败项','Request timed out; retry failed items')}[s.lastError]||s.lastError);
 const snapshot=JSON.stringify([s.status,s.failed,english]);if(snapshot!==batchSnapshot){batchSnapshot=snapshot;$('reanalysisButtons').replaceChildren();const act=action=>{CareerFlow.reanalysis(action);feedback(t('操作已提交，进度会自动更新','Requested; progress updates automatically'));};
 if(['idle','completed'].includes(s.status))$('reanalysisButtons').append(button(t('重新分析全部','Reanalyze all'),()=>act('start')));
 if(s.status==='running')$('reanalysisButtons').append(button(t('暂停','Pause'),()=>act('pause')));
 if(s.status==='paused')$('reanalysisButtons').append(button(t('继续未完成','Resume remaining'),()=>act('resume')));
 $('reanalysisButtons').append(button(t('询问或修复进度问题','Ask about or repair progress'),()=>{$('chatInput').value=t('检查重新分析为什么没有进展，并恢复未完成的任务，不要重置已完成状态。','Check stalled analysis and recover unfinished work without resetting completion.');$('assistantDialog').showModal();renderChat();}));
 if(s.failed>0&&s.status!=='running')$('reanalysisButtons').append(button(t('重试失败项','Retry failed'),()=>act('retry')));
 }
}
setInterval(()=>{if(!document.hidden&&active==='home')renderReanalysis();},3000);
render();
