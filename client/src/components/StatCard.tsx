import { Card, Statistic } from 'antd';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  value: number;
  icon?: ReactNode;
  color?: string;
  onClick?: () => void;
  loading?: boolean;
}

export default function StatCard({ title, value, icon, color, onClick, loading }: Props) {
  return (
    <Card
      className="stat-card"
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${title}：${value}，查看详情` : undefined}
      onKeyDown={event=>{if(onClick && (event.key==='Enter'||event.key===' ')){event.preventDefault();onClick();}}}
      hoverable={Boolean(onClick)}
      onClick={onClick}
      loading={loading}
      styles={{ body: { padding: 16 } }}
    >
      <Statistic
        title={
          <span>
            {icon} {title}
          </span>
        }
        value={value}
        valueStyle={color ? { color } : undefined}
      />
    </Card>
  );
}
