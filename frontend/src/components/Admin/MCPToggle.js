import React, { useState, useEffect } from 'react';
import { Switch, Card, Typography, message, Tag } from 'antd';
import { ToolOutlined } from '@ant-design/icons';
import mcpService from '../../services/mcpService';

const { Text } = Typography;

const MCPToggle = () => {
    const [isEnabled, setIsEnabled] = useState(true);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadStatus();
    }, []);

    const loadStatus = async () => {
        try {
            setLoading(true);
            const data = await mcpService.getStatus();
            setIsEnabled(data.isEnabled);
        } catch (error) {
            message.error('加载MCP状态失败');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async (checked) => {
        try {
            setLoading(true);
            const data = await mcpService.toggleStatus(checked);
            setIsEnabled(data.isEnabled);
            message.success(`MCP已${data.isEnabled ? '启用' : '禁用'}`);
        } catch (error) {
            message.error('切换MCP状态失败');
            console.error(error);
            // Revert on error
            setIsEnabled(!checked);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card title="MCP工具控制" size="small" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <ToolOutlined style={{ marginRight: 8 }} />
                    <Text strong>Model Context Protocol (MCP)</Text>
                    <div style={{ marginTop: 4 }}>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                            控制AI助手是否可以调用外部工具查询知识库
                        </Text>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Tag color={isEnabled ? 'green' : 'red'}>
                        {isEnabled ? '已启用' : '已禁用'}
                    </Tag>
                    <Switch 
                        checked={isEnabled} 
                        onChange={handleToggle} 
                        loading={loading}
                    />
                </div>
            </div>
        </Card>
    );
};

export default MCPToggle;
