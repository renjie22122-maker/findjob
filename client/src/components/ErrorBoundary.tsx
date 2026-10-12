import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Result, Space, Typography } from 'antd';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 页面级错误边界：React 渲染期异常默认会卸载整棵树（白屏且无提示），
 * 这里兜底成可读提示 + 刷新入口，避免用户遇到「什么都点不动」的空白页。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 本地应用没有服务端上报，保留控制台日志便于排查
    console.error('[ui] 页面渲染异常：', error, info.componentStack);
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  private readonly handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <Result
        status="error"
        title="页面渲染出错"
        subTitle="已拦截异常，避免整页白屏。可先重试渲染，仍失败请刷新页面；数据保存在本地 SQLite 中不会丢失。"
        extra={
          <Space direction="vertical" align="center">
            <Space>
              <Button type="primary" onClick={this.handleReset}>
                重试渲染
              </Button>
              <Button onClick={this.handleReload}>刷新页面</Button>
            </Space>
            <Typography.Text type="secondary" style={{ maxWidth: 520, wordBreak: 'break-all' }}>
              {error.message}
            </Typography.Text>
          </Space>
        }
      />
    );
  }
}
