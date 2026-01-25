import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Tag, Space, Modal, Alert, Spin, Descriptions, Divider, Typography } from 'antd';
import { LockOutlined, UnlockOutlined, HistoryOutlined, SyncOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import modeService from '../../services/modeService';

const { Text } = Typography;

const ModeManager = () => {
    const [currentMode, setCurrentMode] = useState(null);
    const [modeHistory, setModeHistory] = useState([]);
    const [healthStatus, setHealthStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [modeData, historyData, healthData] = await Promise.all([
                modeService.getCurrentMode(),
                modeService.getModeHistory(20),
                modeService.getHealthStatus()
            ]);
            setCurrentMode(modeData);
            setModeHistory(historyData);
            setHealthStatus(healthData);
        } catch (err) {
            setError('加载数据失败');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleLock = async () => {
        try {
            setActionLoading(true);
            await modeService.lockMode();
            await loadData(); // Refresh data
        } catch (err) {
            setError('锁定模式失败');
            console.error(err);
        } finally {
            setActionLoading(false);
        }
    };

    const handleUnlock = async () => {
        try {
            setActionLoading(true);
            await modeService.unlockMode();
            await loadData(); // Refresh data
        } catch (err) {
            setError('解锁模式失败');
            console.error(err);
        } finally {
            setActionLoading(false);
        }
    };

    const getModeColor = (mode) => {
        switch (mode) {
            case 'ONLINE': return 'green';
            case 'LOCAL': return 'blue';
            case 'MOCK': return 'orange';
            default: return 'gray';
        }
    };

    const getModeLabel = (mode) => {
        switch (mode) {
            case 'ONLINE': return '在线模式';
            case 'LOCAL': return '本地模式';
            case 'MOCK': return '模拟模式';
            default: return mode;
        }
    };

    const getHealthIcon = (healthy) => {
        return healthy ? <CheckCircleOutlined style={{ color: 'green' }} /> : <CloseCircleOutlined style={{ color: 'red' }} />;
    };

    const historyColumns = [
        {
            title: '时间',
            dataIndex: 'timestamp',
            key: 'timestamp',
            render: (timestamp) => new Date(timestamp).toLocaleString(),
            width: 180
        },
        {
            title: '操作',
            dataIndex: 'details',
            key: 'details',
            render: (details) => {
                if (!details) return '-';
                const parsed = typeof details === 'string' ? JSON.parse(details) : details;
                return `${getModeLabel(parsed.fromMode || 'N/A')} → ${getModeLabel(parsed.toMode || 'N/A')}`;
            }
        },
        {
            title: '原因',
            dataIndex: 'details',
            key: 'reason',
            render: (details) => {
                if (!details) return '-';
                const parsed = typeof details === 'string' ? JSON.parse(details) : details;
                return parsed.reason || '自动切换';
            }
        }
    ];

    if (loading) {
        return <Spin size="large" />;
    }

    return (
        <div style={{ padding: 24 }}>
            <h2>AI模式管理</h2>
            <p>管理系统全局AI操作模式，支持自动降级和手动控制</p>

            {error && (
                <Alert
                    message={error}
                    type="error"
                    showIcon
                    style={{ marginBottom: 16 }}
                    closable
                    onClose={() => setError(null)}
                />
            )}

            <Space direction="vertical" style={{ width: '100%' }} size="large">
                {/* Current Mode Status */}
                <Card title="当前模式状态" extra={
                    <Button icon={<SyncOutlined />} onClick={loadData} loading={loading}>
                        刷新
                    </Button>
                }>
                    {currentMode && (
                        <Descriptions bordered column={2}>
                            <Descriptions.Item label="当前模式">
                                <Tag color={getModeColor(currentMode.mode)}>
                                    {getModeLabel(currentMode.mode)}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="锁定状态">
                                {currentMode.locked ? (
                                    <Tag color="red"><LockOutlined /> 已锁定</Tag>
                                ) : (
                                    <Tag color="green"><UnlockOutlined /> 未锁定</Tag>
                                )}
                            </Descriptions.Item>
                            <Descriptions.Item label="Provider">{currentMode.provider || 'N/A'}</Descriptions.Item>
                            <Descriptions.Item label="超时设置">{currentMode.timeout || 'N/A'}ms</Descriptions.Item>
                        </Descriptions>
                    )}

                    <Divider />

                    <Space>
                        <Button
                            type="primary"
                            icon={<LockOutlined />}
                            onClick={handleLock}
                            loading={actionLoading}
                            disabled={currentMode?.locked}
                        >
                            锁定模式
                        </Button>
                        <Button
                            danger
                            icon={<UnlockOutlined />}
                            onClick={handleUnlock}
                            loading={actionLoading}
                            disabled={!currentMode?.locked}
                        >
                            解锁模式
                        </Button>
                    </Space>
                </Card>

                {/* Health Status */}
                <Card title="模式健康状态">
                    {healthStatus && (
                        <Space direction="vertical" style={{ width: '100%' }}>
                            {Object.entries(healthStatus).map(([mode, status]) => (
                                <div key={mode} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span>
                                        {getHealthIcon(status.healthy)} {getModeLabel(mode)}
                                    </span>
                                    <div>
                                        {status.healthy ? (
                                            <Tag color="green">健康</Tag>
                                        ) : (
                                            <Tag color="red">不健康</Tag>
                                        )}
                                        <Text type="secondary" style={{ marginLeft: 8 }}>
                                            上次检查: {status.lastCheck ? new Date(status.lastCheck).toLocaleString() : '从未检查'}
                                        </Text>
                                        {status.error && (
                                            <Text type="danger" style={{ marginLeft: 8 }}>
                                                错误: {status.error}
                                            </Text>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </Space>
                    )}
                </Card>

                {/* Mode Switch History */}
                <Card title="模式切换历史">
                    <Table
                        columns={historyColumns}
                        dataSource={modeHistory}
                        rowKey="timestamp"
                        pagination={{ pageSize: 10 }}
                        size="small"
                    />
                </Card>
            </Space>
        </div>
    );
};

export default ModeManager;
