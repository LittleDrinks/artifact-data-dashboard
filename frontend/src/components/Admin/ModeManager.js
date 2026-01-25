import React from 'react';
import { Card, Result } from 'antd';
import { RobotOutlined } from '@ant-design/icons';

const ModeManager = () => {
  return (
    <Card title="AI Mode Management" bordered={false}>
       <Result
        icon={<RobotOutlined />}
        title="AI Mode Configuration"
        subTitle="Manage AI Backend Modes (ONLINE/LOCAL/MOCK)"
      />
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p>Current Mode: <strong>LOCAL (Default)</strong></p>
        <p>Configured via Backend Environment Variables</p>
      </div>
    </Card>
  );
};

export default ModeManager;
