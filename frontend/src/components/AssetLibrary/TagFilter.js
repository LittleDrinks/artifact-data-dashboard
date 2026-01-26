/**
 * 标签过滤组件
 * 用于在资产库中按标签过滤文件
 */
import React, { useState, useEffect } from 'react';
import { Tag, Input, Button, Space, Popover, Tooltip, message } from 'antd';
import { PlusOutlined, TagOutlined, EditOutlined, DeleteOutlined, CloseOutlined } from '@ant-design/icons';
import axios from 'axios';
import './TagFilter.css';

const TagFilter = ({ selectedTags = [], onTagsChange, onFilterApply }) => {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#1890ff');
  const [editingTag, setEditingTag] = useState(null);
  const [showCreatePopover, setShowCreatePopover] = useState(false);

  // 预定义颜色选项
  const colorOptions = [
    '#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1',
    '#eb2f96', '#13c2c2', '#fa8c16', '#a0d911', '#2f54eb'
  ];

  // 加载所有 标签
  const loadTags = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/tags?includeStats=true');
      setTags(response.data);
    } catch (error) {
      console.error('Failed to load tags:', error);
      message.error('加载标签失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTags();
  }, []);

  // 创建标签
  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      message.warning('请输入标签名称');
      return;
    }

    try {
      const response = await axios.post('/api/tags', {
        name: newTagName.trim(),
        color: newTagColor
      });
      setTags([...tags, { ...response.data, file_count: 0 }]);
      setNewTagName('');
      setNewTagColor('#1890ff');
      setShowCreatePopover(false);
      message.success('标签创建成功');
    } catch (error) {
      if (error.response?.status === 409) {
        message.error('标签名称已存在');
      } else {
        message.error('创建标签失败');
      }
    }
  };

  // 更新标签
  const handleUpdateTag = async () => {
    if (!editingTag || !editingTag.name.trim()) {
      message.warning('请输入标签名称');
      return;
    }

    try {
      const response = await axios.put(`/api/tags/${editingTag.id}`, {
        name: editingTag.name.trim(),
        color: editingTag.color
      });
      setTags(tags.map(t => t.id === editingTag.id ? { ...response.data, file_count: t.file_count } : t));
      setEditingTag(null);
      message.success('标签更新成功');
    } catch (error) {
      if (error.response?.status === 409) {
        message.error('标签名称已存在');
      } else {
        message.error('更新标签失败');
      }
    }
  };

  // 删除标签
  const handleDeleteTag = async (tagId) => {
    try {
      await axios.delete(`/api/tags/${tagId}`);
      setTags(tags.filter(t => t.id !== tagId));
      // 如果删除的标签在已选中列表中，移除它
      if (selectedTags.includes(tagId)) {
        onTagsChange(selectedTags.filter(id => id !== tagId));
      }
      message.success('标签已删除');
    } catch (error) {
      message.error('删除标签失败');
    }
  };

  // 切换标签选中状态
  const toggleTagSelection = (tagId) => {
    const newSelection = selectedTags.includes(tagId)
      ? selectedTags.filter(id => id !== tagId)
      : [...selectedTags, tagId];
    onTagsChange(newSelection);
  };

  // 清除所有选中
  const clearSelection = () => {
    onTagsChange([]);
  };

  // 创建标签弹出内容
  const createTagContent = (
    <div className="tag-create-form">
      <Input
        placeholder="标签名称"
        value={newTagName}
        onChange={e => setNewTagName(e.target.value)}
        onPressEnter={handleCreateTag}
        style={{ marginBottom: 8 }}
      />
      <div className="color-picker">
        {colorOptions.map(color => (
          <div
            key={color}
            className={`color-option ${newTagColor === color ? 'selected' : ''}`}
            style={{ backgroundColor: color }}
            onClick={() => setNewTagColor(color)}
          />
        ))}
      </div>
      <Button type="primary" size="small" onClick={handleCreateTag} block>
        创建
      </Button>
    </div>
  );

  // 编辑标签弹出内容
  const editTagContent = editingTag && (
    <div className="tag-edit-form">
      <Input
        placeholder="标签名称"
        value={editingTag.name}
        onChange={e => setEditingTag({ ...editingTag, name: e.target.value })}
        onPressEnter={handleUpdateTag}
        style={{ marginBottom: 8 }}
      />
      <div className="color-picker">
        {colorOptions.map(color => (
          <div
            key={color}
            className={`color-option ${editingTag.color === color ? 'selected' : ''}`}
            style={{ backgroundColor: color }}
            onClick={() => setEditingTag({ ...editingTag, color })}
          />
        ))}
      </div>
      <Space>
        <Button size="small" onClick={() => setEditingTag(null)}>
          取消
        </Button>
        <Button type="primary" size="small" onClick={handleUpdateTag}>
          保存
        </Button>
      </Space>
    </div>
  );

  return (
    <div className="tag-filter">
      <div className="tag-filter-header">
        <Space>
          <TagOutlined />
          <span>标签过滤</span>
        </Space>
        <Popover
          content={createTagContent}
          title="创建标签"
          trigger="click"
          open={showCreatePopover}
          onOpenChange={setShowCreatePopover}
        >
          <Button type="text" size="small" icon={<PlusOutlined />}>
            新建
          </Button>
        </Popover>
      </div>

      <div className="tag-list">
        {loading ? (
          <div className="tag-loading">加载中...</div>
        ) : tags.length === 0 ? (
          <div className="tag-empty">暂无标签</div>
        ) : (
          tags.map(tag => (
            <div
              key={tag.id}
              className={`tag-item ${selectedTags.includes(tag.id) ? 'selected' : ''}`}
              onClick={() => toggleTagSelection(tag.id)}
            >
              <Tag color={tag.color} className="tag-badge">
                {tag.name}
              </Tag>
              <span className="tag-count">({tag.file_count || 0})</span>
              <Space className="tag-actions" onClick={e => e.stopPropagation()}>
                <Popover
                  content={editTagContent}
                  title="编辑标签"
                  trigger="click"
                  open={editingTag?.id === tag.id}
                  onOpenChange={open => {
                    if (open) {
                      setEditingTag({ ...tag });
                    } else {
                      setEditingTag(null);
                    }
                  }}
                >
                  <Tooltip title="编辑">
                    <EditOutlined className="action-icon" />
                  </Tooltip>
                </Popover>
                <Tooltip title="删除">
                  <DeleteOutlined
                    className="action-icon danger"
                    onClick={() => handleDeleteTag(tag.id)}
                  />
                </Tooltip>
              </Space>
            </div>
          ))
        )}
      </div>

      {selectedTags.length > 0 && (
        <div className="tag-filter-actions">
          <Button size="small" icon={<CloseOutlined />} onClick={clearSelection}>
            清除筛选 ({selectedTags.length})
          </Button>
          {onFilterApply && (
            <Button type="primary" size="small" onClick={onFilterApply}>
              应用筛选
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default TagFilter;
