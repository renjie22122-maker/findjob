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
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, dark ? 'dark' : undefined);
    chart.setOption({ ...option, backgroundColor: 'transparent' });
    const onResize = () => chart.resize();
    const observer = new ResizeObserver(onResize);
    observer.observe(ref.current);
    window.addEventListener('resize', onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [option, dark]);
  return ref;
}

export function TrendChart({ trends }: { trends: TrendPoint[] }) {
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
    ].filter(series=>!hidden.includes(series.name)),
  });
  return <section className="trend-chart" aria-label="投递趋势图"><div className="chart-legend" aria-label="趋势图图例">{labels.map((label,i)=><button key={label} aria-pressed={!hidden.includes(label)} onClick={()=>setHidden(prev=>prev.includes(label)?prev.filter(x=>x!==label):[...prev,label])}><span style={{background:colors[i]}}/>{label}</button>)}</div><div className="chart-plot" ref={ref} style={{ width: '100%', height: 280 }} /></section>;
}

export function FunnelChart({ stats }: { stats: OverviewStats }) {
  const ref = useChart({
    tooltip: { confine: true },
    series: [
      {
        type: 'funnel',
        left: '8%',
        top: 18,
        bottom: 18,
        width: '84%',
        minSize: '25%',
        label: { position: 'inside', formatter: '{b}：{c}', color: '#fff' },
        data: [
          { value: stats.funnel.applied, name: '已投递' },
          { value: stats.funnel.interviewed, name: '进入笔试/面试' },
          { value: stats.funnel.offer, name: '拿到 Offer' },
        ],
      },
    ],
  });
  return <div ref={ref} style={{ width: '100%', height: 260 }} />;
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
  const data = ALL_STATUSES.filter((s) => (stats.byStatus[s] ?? 0) > 0).map((s) => ({
    name: STATUS_LABELS[s as AppStatus],
    value: stats.byStatus[s] ?? 0,
    itemStyle: { color: PIE_COLORS[STATUS_COLORS[s]] },
  }));
  const ref = useChart({
    tooltip: { trigger: 'item', confine: true, formatter: '{b}：{c}（{d}%）' },

    series: [{ type: 'pie', radius: ['35%', '65%'], center: ['50%', '50%'], data, label: { show: false } }],
  });
  return <section aria-label="申请状态分布"><div ref={ref} style={{ width: '100%', height: 210 }} /><div className="chart-legend chart-legend-static">{data.map(item=><span key={item.name}><i style={{background:item.itemStyle.color}}/>{item.name} <strong>{item.value}</strong></span>)}</div></section>;
}
