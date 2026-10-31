import {translate, useLanguage} from '../i18n';
import { Modal, Form, Input, message } from 'antd';
import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { companiesApi } from '../api';
import type { Company } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: Company | null;
}

export default function CompanyFormModal({ open, onClose, editing }: Props) {
  useLanguage();

  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      if (editing) form.setFieldsValue(editing);
      else form.resetFields();
    }
  }, [open, editing, form]);

  const mutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      editing ? companiesApi.update(editing.id, values) : companiesApi.create(values),
    onSuccess: () => {
      message.success(editing ? '已更新' : '已创建');
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      onClose();
    },
    onError: (err) => message.error(err instanceof Error ? err.message : '保存失败'),
  });

  return (
    <Modal
      title={editing ? '编辑公司' : '新建公司'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      okText={translate("保存")}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)}>
        <Form.Item name="name" label={translate("公司名称")} rules={[{ required: true, message: translate("请输入公司名称") }]}>
          <Input placeholder={translate("如：字节跳动")} />
        </Form.Item>
        <Form.Item name="industry" label={translate("行业")}>
          <Input placeholder={translate("如：互联网")} />
        </Form.Item>
        <Form.Item name="city" label={translate("城市")}>
          <Input placeholder={translate("如：北京")} />
        </Form.Item>
        <Form.Item name="website" label={translate("官网")}>
          <Input placeholder="https://..." />
        </Form.Item>
        <Form.Item name="note" label={translate("备注")}>
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
