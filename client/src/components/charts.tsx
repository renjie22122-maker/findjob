import {translate, useLanguage} from '../i18n';
import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, FunnelChart as EChartsFunnel } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import type { OverviewStats, TrendPoint } from '../types';
import { STATUS_COLORS, STATUS_LABELS, ALL_STATUSES } from '../utils/constants';
import type { AppStatus } from '../types';
import { useAppTheme } from '../theme';

echarts.use([BarChart, LineChart, PieChart, EChartsFunnel, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

function useChart(option: EChartsCoreOption) {
  const { dark } = useAppTheme();
  const ref = useRef<HTMLDivElement>(null);
  const instance=useRef<ReturnType<typeof echarts.init>|null>(null);
  const latest=useRef(option);latest.current=option;
  const signature=JSON.stringify(option);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, dark ? 'dark' : undefined);
    instance.current=chart;
    chart.setOption({ ...latest.current, backgroundColor: 'transparent' });
    const onResize = () => chart.resize();
    const observer = new ResizeObserver(onResize);
    observer.observe(ref.current);
    window.addEventListener('resize', onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      chart.dispose();
      instance.current=null;
    };
  }, [dark]);
  useEffect(()=>{instance.current?.setOption({...latest.current,backgroundColor:'transparent'},{notMerge:true,lazyUpdate:true});},[signature,dark]);
  return ref;
}

export function TrendChart({ trends }: { trends: TrendPoint[] }) {
  useLanguage();

  const [hidden,setHidden]=useState<string[]>([]);
  const labels=['投递','笔试/面试','Offer','被拒'];
  const colors=['#1677ff','#9254de','#faad14','#ff4d4f'];
  const ref = useChart({
    tooltip: { trigger: 'axis', confine: true },
    grid: { left: 12, right: 16, top: 16, bottom: 16, containLabel: true },
    xAxis: { type: 'category', data: trends.map((t) => t.date.slice(5)), axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      { name: '投递', type: 'line', smooth: true, data: trends.map((t) => t.applied), color: '#1677ff' },
      { name: '笔试/面试', type: 'line', smooth: true, data: trends.map((t) => t.interviewed), color: '#9254de' },
      { name: 'Offer', type: 'line', smooth: true, data: trends.map((t) => t.offer), color: '#faad14' },
      { name: '被拒', type: 'line', smooth: true, data: trends.map((t) => t.rejected), color: '#ff4d4f' },
    ].filter(series=>!hidden.includes(series.name)).map(series=>({...series,name:translate(series.name)})),
  });
  return <section className="trend-chart" aria-label={translate("投递趋势图")}><div className="chart-legend" aria-label={translate("趋势图图例")}>{labels.map((label,i)=><button key={label} aria-pressed={!hidden.includes(label)} onClick={()=>setHidden(prev=>prev.includes(label)?prev.filter(x=>x!==label):[...prev,label])}><span style={{background:colors[i]}}/>{translate(label)}</button>)}</div><div className="chart-plot" ref={ref} style={{ width: '100%', height: 280 }} /></section>;
}

export function FunnelChart({ stats }: { stats: OverviewStats }) {
  const {t}=useLanguage();
  const steps=[{label:t('已投递','Applied'),value:stats.funnel.applied,color:'#5b7cfa'},
    {label:t('笔试 / 面试','Assessment / interview'),value:stats.funnel.interviewed,color:'#35b8c8'},
    {label:'Offer',value:stats.funnel.offer,color:'#a27aee'}];
  const rate=(n:number,d:number)=>d>0?`${Math.round(n/d*100)}%`:'—';
  const ref=useChart({tooltip:{trigger:'item',confine:true},series:[{
    type:'funnel',left:'5%',width:'90%',top:8,bottom:8,gap:8,sort:'none',
    min:0,max:Math.max(...steps.map(s=>s.value),1),minSize:'0%',maxSize:'100%',
    label:{show:false},labelLine:{show:false},emphasis:{label:{show:false}},
    itemStyle:{borderWidth:0,shadowBlur:12,shadowColor:'rgba(57,95,232,.10)'},
    data:steps.map(step=>({name:step.label,value:step.value,itemStyle:{color:new echarts.graphic.LinearGradient(0,0,1,1,[{offset:0,color:step.color},{offset:1,color:step.color+'aa'}])}})),
  }]});
  return <section className="conversion-funnel" aria-label={t('招聘转化漏斗','Recruitment conversion funnel')}>
    <div className="funnel-summary"><span>{t('投递至 Offer','Application to offer')}</span><strong>{rate(stats.funnel.offer,stats.funnel.applied)}</strong></div>
    <div className="funnel-body"><div className="funnel-visual" ref={ref} aria-hidden="true"/><ol className="funnel-stages">{steps.map((step,i)=><li key={step.label}><span className="funnel-stage-label"><i style={{background:step.color}}/>{step.label}</span><strong>{step.value.toLocaleString()}</strong><small>{i===0?t('统计起点','Starting point'):t('较上一阶段 ','From previous stage ')+rate(step.value,steps[i-1].value)}</small></li>)}</ol></div>
    <p className="funnel-note">{t('按申请统计阶段进展，重复通知不增加数量。','Stages are counted per application; repeat notifications do not increase totals.')}</p>
  </section>;
}

const PIE_COLORS: Record<string, string> = {
  default: '#bfbfbf',
  blue: '#1677ff',
  cyan: '#13c2c2',
  geekblue: '#2f54eb',
  purple: '#722ed1',
  magenta: '#eb2f96',
  gold: '#faad14',
  green: '#52c41a',
  red: '#ff4d4f',
};

export function StatusPieChart({ stats }: { stats: OverviewStats }) {
  useLanguage();

  const data = ALL_STATUSES.filter((s) => (stats.byStatus[s] ?? 0) > 0).map((s) => ({
    name: STATUS_LABELS[s as AppStatus],
    value: stats.byStatus[s] ?? 0,
    itemStyle: { color: PIE_COLORS[STATUS_COLORS[s]] },
  }));
  const ref = useChart({
    tooltip: { trigger: 'item', confine: true, formatter: '{b}：{c}（{d}%）' },

    series: [{ type: 'pie', radius: ['35%', '65%'], center: ['50%', '50%'], data, label: { show: false } }],
  });
  return <section aria-label={translate("申请状态分布")}><div ref={ref} style={{ width: '100%', height: 210 }} /><div className="chart-legend chart-legend-static">{data.map(item=><span key={item.name}><i style={{background:item.itemStyle.color}}/>{item.name} <strong>{item.value}</strong></span>)}</div></section>;
}
