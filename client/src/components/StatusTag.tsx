import { Tag } from 'antd';
import {useLanguage} from '../i18n';
import type { AppStatus } from '../types';
import { STATUS_COLORS, STATUS_LABELS } from '../utils/constants';

export default function StatusTag({ status }: { status: AppStatus }) {
  useLanguage();
  return <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Tag>;
}
