import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Descriptions, Button, Tag, Image, Skeleton, Result,
  Space, Modal, Form, Input, Select, Row, Col, message,
} from 'antd';
import {
  ArrowLeftOutlined, EditOutlined, LinkOutlined,
} from '@ant-design/icons';
import { getArtifact, updateArtifact, deleteArtifact, type Artifact, type ArtifactFormData } from '../api/artifacts';
import { getStatsByCategory, getStatsByEra } from '../api/stats';
import { useAuth } from '../hooks/useAuth';
import { CATEGORY_COLORS } from '../constants/colors';

export default function ArtifactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // 编辑弹窗
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [form] = Form.useForm();

  // 筛选器选项
  const [categories, setCategories] = useState<{ label: string; value: string }[]>([]);
  const [eras, setEras] = useState<{ label: string; value: string }[]>([]);

  /** 加载详情数据 */
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    getArtifact(Number(id))
      .then(setArtifact)
      .catch(err => {
        if (err?.response?.status === 404) {
          setNotFound(true);
        } else {
          message.error('加载文物详情失败');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  /** 加载筛选选项（用于编辑弹窗） */
  useEffect(() => {
    Promise.all([getStatsByCategory(), getStatsByEra()])
      .then(([cats, eraList]) => {
        setCategories(cats.map(c => ({ label: c.category, value: c.category })));
        setEras(eraList.map(e => ({ label: e.era, value: e.era })));
      })
      .catch(() => {});
  }, []);

  /** 打开编辑弹窗 */
  const openEdit = () => {
    if (!artifact) return;
    form.setFieldsValue({
      name: artifact.name,
      description: artifact.description || '',
      category: artifact.category,
      era: artifact.era,
      location: artifact.location || '',
      image_url: artifact.image_url || '',
      tags: artifact.tags || '',
    });
    setEditOpen(true);
  };

  /** 提交编辑 */
  const handleEdit = async () => {
    if (!artifact) return;
    try {
      const values = await form.validateFields();
      setEditLoading(true);
      const formData: ArtifactFormData = {
        name: values.name,
        description: values.description || null,
        category: values.category || null,
        era: values.era || null,
        location: values.location || null,
        image_url: values.image_url || null,
        tags: values.tags || null,
      };
      const updated = await updateArtifact(artifact.id, formData);
      setArtifact(updated);
      message.success('更新成功');
      setEditOpen(false);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error('更新失败');
    } finally {
      setEditLoading(false);
    }
  };

  /** 404 页面 */
  if (notFound) {
    return (
      <Result
        status="404"
        title="文物未找到"
        subTitle={`文物 ID ${id} 不存在或已被删除`}
        extra={
          <Button type="primary" onClick={() => navigate('/artifacts')}>
            返回文物列表
          </Button>
        }
      />
    );
  }

  /** 加载骨架屏 */
  if (loading || !artifact) {
    return (
      <Card style={{ borderRadius: 'var(--r-card)', border: '1px solid var(--border)' }}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }

  /** 解析标签 */
  const tagList = artifact.tags
    ? artifact.tags.split(',').map(t => t.trim()).filter(Boolean)
    : [];

  return (
    <div>
      {/* 面包屑 & 操作栏 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
      }}>
        <Space>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/artifacts')}
            style={{ color: 'var(--text-body)' }}
          >
            返回列表
          </Button>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            文物管理 / <span style={{ color: 'var(--text-heading)' }}>{artifact.name}</span>
          </span>
        </Space>
        <Space>
          {isAuthenticated && (
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={openEdit}
            >
              编辑
            </Button>
          )}
          <Button
            icon={<LinkOutlined />}
            onClick={() => navigate('/graph')}
          >
            在图谱中查看
          </Button>
          {isAdmin && (
            <Button
              danger
              onClick={() => {
                Modal.confirm({
                  title: '确认删除',
                  content: `确定要删除「${artifact.name}」吗？此操作不可恢复。`,
                  okText: '删除',
                  cancelText: '取消',
                  okButtonProps: { danger: true },
                  onOk: async () => {
                    try {
                      await deleteArtifact(artifact.id);
                      message.success('删除成功');
                      navigate('/artifacts');
                    } catch {
                      message.error('删除失败');
                    }
                  },
                });
              }}
            >
              删除
            </Button>
          )}
        </Space>
      </div>

      <Row gutter={24}>
        {/* 左侧：图片 */}
        <Col xs={24} lg={10}>
          <Card
            style={{
              borderRadius: 'var(--r-card)',
              border: '1px solid var(--border)',
              marginBottom: 16,
              overflow: 'hidden',
            }}
            styles={{ body: { padding: 0 } }}
          >
            {artifact.image_url ? (
              <Image
                src={artifact.image_url}
                alt={artifact.name}
                style={{ width: '100%', maxHeight: 400, objectFit: 'contain' }}
                fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmNGY4Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTYiIGZpbGw9IiM5NGEzYjgiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7lm77niIfllYblk4Hlm77moIc8L3RleHQ+PC9zdmc+"
              />
            ) : (
              <div style={{
                height: 300,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-panel)',
                color: 'var(--text-muted)',
                fontSize: 14,
                flexDirection: 'column',
                gap: 8,
              }}>
                <span style={{ fontSize: 48 }}>🏺</span>
                <span>暂无图片</span>
              </div>
            )}
          </Card>
        </Col>

        {/* 右侧：信息 */}
        <Col xs={24} lg={14}>
          {/* 标题区 */}
          <div style={{ marginBottom: 20 }}>
            <h2 style={{
              fontSize: 22,
              fontWeight: 500,
              color: 'var(--text-heading)',
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              {artifact.name}
              {artifact.category && (
                <Tag
                  color={CATEGORY_COLORS[artifact.category] || '#533afd'}
                  style={{ border: 'none', color: '#fff', fontSize: 12, verticalAlign: 'middle' }}
                >
                  {artifact.category}
                </Tag>
              )}
            </h2>
            {tagList.length > 0 && (
              <Space size={[4, 8]} wrap>
                {tagList.map(tag => (
                  <Tag key={tag} style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                    {tag}
                  </Tag>
                ))}
              </Space>
            )}
          </div>

          {/* 基本信息卡片 */}
          <Card
            title="基本信息"
            size="small"
            style={{
              borderRadius: 'var(--r-card)',
              border: '1px solid var(--border)',
              marginBottom: 16,
            }}
          >
            <Descriptions column={{ xs: 1, sm: 2 }} size="small" colon={false}>
              <Descriptions.Item label="年代">
                {artifact.era || <span style={{ color: 'var(--text-muted)' }}>未知</span>}
              </Descriptions.Item>
              <Descriptions.Item label="类别">
                {artifact.category
                  ? <Tag color={CATEGORY_COLORS[artifact.category] || '#533afd'} style={{ border: 'none', color: '#fff' }}>{artifact.category}</Tag>
                  : <span style={{ color: 'var(--text-muted)' }}>未知</span>
                }
              </Descriptions.Item>
              <Descriptions.Item label="出土地点" span={2}>
                {artifact.location || <span style={{ color: 'var(--text-muted)' }}>未知</span>}
              </Descriptions.Item>
              <Descriptions.Item label="记录时间">
                {new Date(artifact.created_at).toLocaleDateString('zh-CN')}
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">
                {new Date(artifact.updated_at).toLocaleDateString('zh-CN')}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* 描述卡片 */}
          {artifact.description && (
            <Card
              title="描述"
              size="small"
              style={{
                borderRadius: 'var(--r-card)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{
                fontSize: 14,
                lineHeight: 1.8,
                color: 'var(--text-body)',
                whiteSpace: 'pre-wrap',
              }}>
                {artifact.description}
              </div>
            </Card>
          )}
        </Col>
      </Row>

      {/* 编辑弹窗 */}
      <Modal
        title="编辑文物"
        open={editOpen}
        onOk={handleEdit}
        onCancel={() => setEditOpen(false)}
        confirmLoading={editLoading}
        okText="保存"
        cancelText="取消"
        width={560}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入文物名称' }]}
          >
            <Input placeholder="例：后母戊鼎" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="category" label="类别">
                <Select placeholder="选择类别" allowClear options={categories} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="era" label="年代">
                <Select placeholder="选择年代" allowClear options={eras} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="location" label="出土地点">
            <Input placeholder="例：河南省安阳市武官村" />
          </Form.Item>
          <Form.Item name="image_url" label="图片链接">
            <Input placeholder="https://…" />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Input placeholder="多个标签用逗号分隔" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={4} placeholder="文物描述…" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
