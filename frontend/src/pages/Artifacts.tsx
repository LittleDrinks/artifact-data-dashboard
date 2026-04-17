import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Input, Select, Space, Card, Tag, Modal, Form,
  message, Popconfirm, Tooltip, Row, Col, Empty, Skeleton,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, EditOutlined,
  DeleteOutlined, EyeOutlined, ReloadOutlined, DownloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getArtifacts, createArtifact, updateArtifact, deleteArtifact,
  exportArtifacts,
  type Artifact, type ArtifactListParams, type ArtifactFormData,
} from '../api/artifacts';
import { getStatsByCategory, getStatsByEra, getStatsByLocation } from '../api/stats';
import { useAuth } from '../hooks/useAuth';
import { CATEGORY_COLORS } from '../constants/colors';

export default function Artifacts() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const isAdmin = user?.role === 'admin';

  // 列表数据
  const [data, setData] = useState<Artifact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // 查询参数
  const [params, setParams] = useState<ArtifactListParams>({ page: 1, size: 20 });
  const [searchText, setSearchText] = useState('');

  // 筛选器选项
  const [categories, setCategories] = useState<{ label: string; value: string }[]>([]);
  const [eras, setEras] = useState<{ label: string; value: string }[]>([]);
  const [locations, setLocations] = useState<{ label: string; value: string }[]>([]);

  // 导出状态
  const [exporting, setExporting] = useState(false);

  // 弹窗状态
  const [modalOpen, setModalOpen] = useState(false);
  const [editingArtifact, setEditingArtifact] = useState<Artifact | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [form] = Form.useForm();

  /** 加载筛选器选项 */
  useEffect(() => {
    Promise.all([getStatsByCategory(), getStatsByEra(), getStatsByLocation()])
      .then(([cats, eraList, locs]) => {
        setCategories(cats.map(c => ({ label: `${c.category} (${c.count})`, value: c.category })));
        setEras(eraList.map(e => ({ label: `${e.era} (${e.count})`, value: e.era })));
        setLocations(locs.map(l => ({ label: `${l.location} (${l.count})`, value: l.location })));
      })
      .catch(() => {});
  }, []);

  /** 加载列表数据 */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getArtifacts(params);
      setData(res.items);
      setTotal(res.total);
    } catch {
      message.error('加载文物列表失败');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /** 搜索 */
  const handleSearch = (value: string) => {
    setSearchText(value);
    setParams(prev => ({ ...prev, keyword: value || undefined, page: 1 }));
  };

  /** 筛选变更 */
  const handleFilterChange = (field: 'category' | 'era' | 'location', value?: string) => {
    setParams(prev => ({ ...prev, [field]: value || undefined, page: 1 }));
  };

  /** 分页变更 */
  const handleTableChange = (pagination: { current?: number; pageSize?: number }) => {
    setParams(prev => ({
      ...prev,
      page: pagination.current,
      size: pagination.pageSize,
    }));
  };

  /** 打开新建弹窗 */
  const openCreateModal = () => {
    setEditingArtifact(null);
    form.resetFields();
    setModalOpen(true);
  };

  /** 打开编辑弹窗 */
  const openEditModal = (record: Artifact) => {
    setEditingArtifact(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description || '',
      category: record.category,
      era: record.era,
      location: record.location,
      image_url: record.image_url || '',
      tags: record.tags || '',
    });
    setModalOpen(true);
  };

  /** 提交表单（新建/编辑） */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setConfirmLoading(true);

      const formData: ArtifactFormData = {
        name: values.name,
        description: values.description || null,
        category: values.category || null,
        era: values.era || null,
        location: values.location || null,
        image_url: values.image_url || null,
        tags: values.tags || null,
      };

      if (editingArtifact) {
        await updateArtifact(editingArtifact.id, formData);
        message.success('更新成功');
      } else {
        await createArtifact(formData);
        message.success('创建成功');
      }

      setModalOpen(false);
      form.resetFields();
      fetchData();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return; // 表单验证失败
      message.error(editingArtifact ? '更新失败' : '创建失败');
    } finally {
      setConfirmLoading(false);
    }
  };

  /** 删除文物 */
  const handleDelete = async (id: number) => {
    try {
      await deleteArtifact(id);
      message.success('删除成功');
      fetchData();
    } catch {
      message.error('删除失败');
    }
  };

  /** 导出 CSV */
  const handleExport = async () => {
    if (!isAuthenticated) {
      message.warning('请先登录后再导出');
      return;
    }
    setExporting(true);
    try {
      await exportArtifacts(params);
      message.success('导出成功');
    } catch {
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  };

  /** 表格列定义 */
  const columns: ColumnsType<Artifact> = useMemo(() => [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 240,
      render: (text: string, record: Artifact) => (
        <a
          onClick={() => navigate(`/artifacts/${record.id}`)}
          style={{ color: 'var(--text-heading)', fontWeight: 500, cursor: 'pointer' }}
        >
          {text}
        </a>
      ),
    },
    {
      title: '类别',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (cat: string | null) => {
        if (!cat) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
        const color = CATEGORY_COLORS[cat] || '#533afd';
        return <Tag color={color} style={{ border: 'none', color: '#fff' }}>{cat}</Tag>;
      },
    },
    {
      title: '年代',
      dataIndex: 'era',
      key: 'era',
      width: 120,
      render: (era: string | null) => era || <span style={{ color: 'var(--text-muted)' }}>—</span>,
    },
    {
      title: '出土地点',
      dataIndex: 'location',
      key: 'location',
      width: 160,
      ellipsis: true,
      render: (loc: string | null) => loc || <span style={{ color: 'var(--text-muted)' }}>—</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: unknown, record: Artifact) => (
        <Space size={4}>
          <Tooltip title="查看详情">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/artifacts/${record.id}`)}
              style={{ color: 'var(--purple)' }}
            />
          </Tooltip>
          {isAuthenticated && (
            <Tooltip title="编辑">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEditModal(record)}
              />
            </Tooltip>
          )}
          {isAdmin && (
            <Popconfirm
              title="确认删除"
              description={`确定要删除「${record.name}」吗？此操作不可恢复。`}
              onConfirm={() => handleDelete(record.id)}
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="删除">
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ], [navigate, isAdmin, isAuthenticated]);

  return (
    <div>
      {/* 搜索 & 筛选栏 */}
      <Card
        size="small"
        style={{
          marginBottom: 16,
          borderRadius: 'var(--r-card)',
          border: '1px solid var(--border)',
        }}
        styles={{ body: { padding: '16px 20px' } }}
      >
        <Row gutter={[12, 12]} align="middle">
          <Col flex="auto">
            <Space size={12} wrap>
              <Input.Search
                placeholder="搜索文物名称、描述、标签…"
                allowClear
                enterButton={<><SearchOutlined /> 搜索</>}
                style={{ width: 320 }}
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                onSearch={handleSearch}
              />
              <Select
                placeholder="全部类别"
                allowClear
                style={{ width: 170 }}
                options={categories}
                onChange={v => handleFilterChange('category', v)}
              />
              <Select
                placeholder="全部年代"
                allowClear
                style={{ width: 150 }}
                options={eras}
                onChange={v => handleFilterChange('era', v)}
              />
              <Select
                placeholder="全部地点"
                allowClear
                style={{ width: 170 }}
                options={locations}
                onChange={v => handleFilterChange('location', v)}
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchData}
                style={{ borderColor: 'var(--border)' }}
              >
                刷新
              </Button>
              {isAuthenticated && (
                <Button
                  icon={<DownloadOutlined />}
                  loading={exporting}
                  onClick={handleExport}
                  style={{ borderColor: 'var(--border)' }}
                >
                  导出 CSV
                </Button>
              )}
              {isAuthenticated && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={openCreateModal}
                >
                  添加文物
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 统计摘要 */}
      <div style={{
        fontSize: 13,
        color: 'var(--text-muted)',
        marginBottom: 12,
        display: 'flex',
        gap: 24,
      }}>
        <span>
          共 <span style={{ color: 'var(--text-heading)', fontWeight: 500 }}>{total}</span> 件文物
        </span>
      </div>

      {/* 数据表格 */}
      {loading ? (
        <Card
          style={{
            borderRadius: 'var(--r-card)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '16px 24px' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton
                key={i}
                active
                title={{ width: '60%' }}
                paragraph={{ rows: 1, width: ['40%'] }}
                style={{ marginBottom: i < 4 ? 16 : 0 }}
              />
            ))}
          </div>
        </Card>
      ) : (
      <Card
        style={{
          borderRadius: 'var(--r-card)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}
        styles={{ body: { padding: 0 } }}
      >
        <Table<Artifact>
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={false}
          size="middle"
          locale={{ emptyText: <Empty description="暂无文物数据" /> }}
          pagination={{
            current: params.page,
            pageSize: params.size,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: t => `共 ${t} 件`,
          }}
          onChange={pag => handleTableChange({ current: pag.current, pageSize: pag.pageSize })}
          style={{ minHeight: 400 }}
          // 行 hover 淡紫色背景
          onRow={() => ({
            style: { cursor: 'pointer' },
            onMouseEnter: (e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(83, 58, 253, 0.04)';
            },
            onMouseLeave: (e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
            },
          })}
        />
      </Card>
      )}

      {/* 新建 / 编辑弹窗 */}
      <Modal
        title={editingArtifact ? '编辑文物' : '添加文物'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        confirmLoading={confirmLoading}
        okText={editingArtifact ? '保存' : '创建'}
        cancelText="取消"
        width={560}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
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
            <Input placeholder="多个标签用逗号分隔，例：青铜,商代,国宝" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={4} placeholder="文物描述…" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
