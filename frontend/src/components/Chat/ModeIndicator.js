import React, { useState, useEffect } from 'react';
import { Card, Tag, Button, Spin, Alert, Space, Table, Modal, Typography } from 'antd';
import { SyncOutlined, LockOutlined, UnlockOutlined, HistoryOutlined } from '@ant-design/icons';
import modeService from '../../services/modeService';

const { Text } = Typography;

const ModeIndicator = ({ onModeChange }) => {
    const [currentMode, setCurrentMode] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadCurrentMode();
    }, []);

    const loadCurrentMode = async () => {
        try {
            setLoading(true);
            const modeData = await modeService.getCurrentMode();
            setCurrentMode(modeData);
            if (onModeChange) {
                onModeChange(modeData);
            }
        } catch (err) {
            setError('加载模式状态失败');
            console.error(err);
        } finally {
            setLoading(false);
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

    if (loading) {
        return <Spin size="small" />;
    }

    if (error) {
        return <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />;
    }

    if (!currentMode) {
        return null;
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Text>当前模式:</Text>
            <Tag color={getModeColor(currentMode.mode)}>
                {getModeLabel(currentMode.mode)}
            </Tag>
            {currentMode.locked && (
                <Tag color="red">
                    <LockOutlined /> 已锁定
                </Tag>
            )}
            <Button
                type="text"
                icon={<SyncOutlined />}
                size="small"
                onClick={loadCurrentMode}
                loading={loading}
            >
                刷新
            </Button>
        </div>
    );
};

export default ModeIndicator;