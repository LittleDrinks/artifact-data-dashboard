/**
 * 引用面板组件
 * 显示资产被哪些文物和聊天引用
 */
import React, { useState, useEffect } from 'react';
import { List, Tag, Empty, Spin, Typography, Space, Tooltip } from 'antd';
import { 
  FileTextOutlined, 
  MessageOutlined, 
  LinkOutlined,
  ExportOutlined
} from '@ant-design/icons';
import axios from 'axios';
import './References.css';

const { Text, Link } = Typography;

const References = ({ attachmentId, onNavigate }) => {
  const [loading, setLoading] = useState(false);
  const [references, setReferences] = useState({ artifacts: [], chats: [], total: 0 });

  useEffect(() => {
    if (attachmentId) {
      loadReferences();
    }
  }, [attachmentId]);

  const loadReferences = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/attachments/${attachmentId}/references`);
      setReferences(response.data);
    } catch (error) {
      console.error('Failed to load references:', error);
    } finally {
      setLoading(false);
    }
  };

  // 获取关系类型标签
  const getRelationTag = (relationType) => {
    const typeMap = {
      owner: { color: 'blue', text: '所属' },
      image: { color: 'green', text: '图片' },
      image_url: { color: 'cyan', text: '封面' },
      attachment: { color: 'purple', text: '附件' },
      reference: { color: 'orange', text: '引用' }
    };
    const config = typeMap[relationType] || { color: 'default', text: relationType };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 处理导航到文物详情
  const handleArtifactClick = (artifact) => {
    if (onNavigate) {
      onNavigate('artifact', artifact.id);
    }
  };

  // 处理导航到聊天记录
  const handleChatClick = (chat) => {
    if (onNavigate) {
      onNavigate('chat', chat.id);
    }
  };

  if (loading) {
    return (
      <div className="references-loading">
        <Spin tip="加载引用信息..." />
      </div>
    );
  }

  if (references.total === 0) {
    return (
      <div className="references-panel">
        <Empty 
          description="该资产暂无引用" 
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

  return (
    <div className="references-panel">
      <div className="references-header">
        <Space>
          <LinkOutlined />
          <span>引用追踪</span>
          <Tag>{references.total} 处引用</Tag>
        </Space>
      </div>

      {/* 文物引用 */}
      {references.artifacts.length > 0 && (
        <div className="references-section">
          <div className="section-title">
            <FileTextOutlined /> 文物引用 ({references.artifacts.length})
          </div>
          <List
            size="small"
            dataSource={references.artifacts}
            renderItem={(artifact) => (
              <List.Item 
                className="reference-item"
                onClick={() => handleArtifactClick(artifact)}
              >
                <div className="reference-content">
                  <div className="reference-main">
                    <Text strong className="reference-name">
                      {artifact.name}
                    </Text>
                    {getRelationTag(artifact.relationType)}
                  </div>
                  <div className="reference-meta">
                    {artifact.category && (
                      <Text type="secondary">{artifact.category}</Text>
                    )}
                    {artifact.era && (
                      <Text type="secondary"> · {artifact.era}</Text>
                    )}
                  </div>
                </div>
                <Tooltip title="跳转到文物详情">
                  <ExportOutlined className="reference-action" />
                </Tooltip>
              </List.Item>
            )}
          />
        </div>
      )}

      {/* 聊天引用 */}
      {references.chats.length > 0 && (
        <div className="references-section">
          <div className="section-title">
            <MessageOutlined /> 聊天引用 ({references.chats.length})
          </div>
          <List
            size="small"
            dataSource={references.chats}
            renderItem={(chat) => (
              <List.Item 
                className="reference-item"
                onClick={() => handleChatClick(chat)}
              >
                <div className="reference-content">
                  <div className="reference-main">
                    <Text className="reference-name">
                      聊天 #{chat.id}
                    </Text>
                    {getRelationTag(chat.relationType)}
                  </div>
                  <div className="reference-meta">
                    <Text type="secondary">
                      用户 ID: {chat.userId}
                    </Text>
                    {chat.createdAt && (
                      <Text type="secondary">
                        {' · '}{new Date(chat.createdAt).toLocaleDateString()}
                      </Text>
                    )}
                  </div>
                </div>
                <Tooltip title="跳转到聊天记录">
                  <ExportOutlined className="reference-action" />
                </Tooltip>
              </List.Item>
            )}
          />
        </div>
      )}
    </div>
  );
};

export default References;
