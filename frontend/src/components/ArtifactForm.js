import React, { useEffect } from 'react';
import { Button, Form, Input, Modal, Space, Switch } from 'antd';

const normalizeInitial = (artifact) => {
  const src = artifact || {};
  return {
    name: src.name ?? '',
    category: src.category ?? '',
    era: src.era ?? '',
    location: src.location ?? '',
    image_url: src.image_url ?? src.imageUrl ?? '',
    tags: src.tags ?? '',
    description: src.description ?? '',
    is_cataloged: Boolean(src.is_cataloged ?? src.isCataloged ?? false),
    is_digitized: Boolean(src.is_digitized ?? src.isDigitized ?? false),
    needs_repair: Boolean(src.needs_repair ?? src.needsRepair ?? false)
  };
};

const ArtifactForm = ({
  open,
  title,
  initialValues,
  readOnly,
  submitting,
  onCancel,
  onSubmit
}) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open) {
      return;
    }
    form.setFieldsValue(normalizeInitial(initialValues));
  }, [open, initialValues, form]);

  return (
    <Modal
      open={open}
      title={title || '文物信息'}
      onCancel={onCancel}
      footer={
        readOnly ? (
          <Button onClick={onCancel}>关闭</Button>
        ) : (
          <Space>
            <Button onClick={onCancel}>取消</Button>
            <Button type="primary" loading={submitting} onClick={() => form.submit()}>
              保存
            </Button>
          </Space>
        )
      }
      destroyOnClose
      width={720}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => {
          const payload = {
            name: values.name,
            category: values.category || null,
            era: values.era || null,
            location: values.location || null,
            image_url: values.image_url || null,
            tags: values.tags || null,
            description: values.description || null,
            is_cataloged: Boolean(values.is_cataloged),
            is_digitized: Boolean(values.is_digitized),
            needs_repair: Boolean(values.needs_repair)
          };
          onSubmit?.(payload);
        }}
      >
        <Form.Item
          label="名称"
          name="name"
          rules={[{ required: true, message: '请输入文物名称' }]}
        >
          <Input disabled={readOnly} placeholder="例如：四羊方尊" />
        </Form.Item>

        <Form.Item label="类别" name="category">
          <Input disabled={readOnly} placeholder="例如：青铜器" />
        </Form.Item>

        <Form.Item label="年代" name="era">
          <Input disabled={readOnly} placeholder="例如：商代" />
        </Form.Item>

        <Form.Item label="出土地" name="location">
          <Input disabled={readOnly} placeholder="例如：湖南宁乡" />
        </Form.Item>

        <Form.Item label="图片链接" name="image_url">
          <Input disabled={readOnly} placeholder="http(s)://..." />
        </Form.Item>

        <Form.Item label="标签（逗号分隔）" name="tags">
          <Input disabled={readOnly} placeholder="例如：青铜,礼器" />
        </Form.Item>

        <Form.Item label="描述" name="description">
          <Input.TextArea disabled={readOnly} autoSize={{ minRows: 4, maxRows: 10 }} />
        </Form.Item>

        <Space size={24} style={{ display: 'flex', flexWrap: 'wrap' }}>
          <Form.Item label="已入藏" name="is_cataloged" valuePropName="checked">
            <Switch disabled={readOnly} />
          </Form.Item>
          <Form.Item label="已数字化" name="is_digitized" valuePropName="checked">
            <Switch disabled={readOnly} />
          </Form.Item>
          <Form.Item label="需修复" name="needs_repair" valuePropName="checked">
            <Switch disabled={readOnly} />
          </Form.Item>
        </Space>
      </Form>
    </Modal>
  );
};

export default ArtifactForm;
