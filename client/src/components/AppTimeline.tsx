import { Timeline, Tag, Empty, Typography } from 'antd';
import { SwapOutlined, EditOutlined, MailOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { TimelineEvent } from '../types';
import { STATUS_LABELS, formatDateTime } from '../utils/constants';

/** 邮件事件标题形如「邮件：笔试（管理培训生） · 2026-10-15 19:00–21:00」 */
function splitWindow(title: string): { main: string; window: string | null } {
  const idx = title.lastIndexOf(' · ');
  if (idx < 0) return { main: title, window: null };
  return { main: title.slice(0, idx), window: title.slice(idx + 3) };
}

export default function AppTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <Empty description="暂无记录" />;

  return (
    <Timeline
      items={events.map((e) => {
        const isStatus = e.eventType === 'status_change';
        const isMail = e.title.startsWith('邮件：');
        const { main, window } = splitWindow(e.title);
        return {
          color: isStatus ? 'blue' : isMail ? 'green' : 'gray',
          dot: isStatus ? <SwapOutlined /> : isMail ? <MailOutlined /> : <EditOutlined />,
          children: (
            <div style={{ paddingBottom: 4 }}>
              <div style={{ fontWeight: 600 }}>{main}</div>
              {window && (
                <div style={{ marginTop: 4 }}>
                  <Tag icon={<ClockCircleOutlined />} color="geekblue">
                    {window}
                  </Tag>
                </div>
              )}
              {isStatus && e.fromStatus && e.toStatus && (
                <div style={{ marginTop: 4 }}>
                  <Tag>{STATUS_LABELS[e.fromStatus]}</Tag>→<Tag color="blue">{STATUS_LABELS[e.toStatus]}</Tag>
                </div>
              )}
              {e.description && (
                <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 0' }}>
                  {e.description}
                </Typography.Paragraph>
              )}
              <div style={{ color: 'var(--app-muted)', fontSize: 12, marginTop: 2 }}>
                {isMail ? '事件时间：' : '时间：'}
                {formatDateTime(e.occurredAt)}
              </div>
            </div>
          ),
        };
      })}
    />
  );
}
