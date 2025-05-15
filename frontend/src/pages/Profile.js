import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Avatar, Descriptions, Spin, Alert, message, Divider, List, Empty } from 'antd';
import { UserOutlined, LockOutlined, EditOutlined, SaveOutlined } from '@ant-design/icons';
import { getUserProfile } from '../services/auth.service';

const Profile = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [form] = Form.useForm();
  
  // 加载用户资料
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const response = await getUserProfile();
        setUserProfile(response.data);
        form.setFieldsValue({
          username: response.data.username,
          email: response.data.email,
          organization: response.data.organization || '',
          title: response.data.title || '',
          bio: response.data.bio || ''
        });
        setError(null);
      } catch (err) {
        console.error('获取用户资料失败:', err);
        setError('获取用户资料失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    };
    
    fetchUserProfile();
  }, [form]);
  
  // 处理保存资料
  const handleSaveProfile = async (values) => {
    message.info('资料更新功能尚未实现');
    setEditMode(false);
  };
  
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" tip="加载用户资料中..." />
      </div>
    );
  }
  
  if (error) {
    return (
      <Alert
        message="错误"
        description={error}
        type="error"
        showIcon
      />
    );
  }
  
  return (
    <div className="profile-container">
      <Card className="profile-card">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Avatar size={80} icon={<UserOutlined />} />
          <h2 style={{ marginTop: 16 }}>{userProfile?.username || '用户'}</h2>
          <p style={{ color: '#666' }}>{userProfile?.title || '未设置职称'}</p>
        </div>
        
        {editMode ? (
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSaveProfile}
            initialValues={{
              username: userProfile?.username,
              email: userProfile?.email,
              organization: userProfile?.organization || '',
              title: userProfile?.title || '',
              bio: userProfile?.bio || ''
            }}
          >
            <Form.Item
              name="username"
              label="用户名"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input prefix={<UserOutlined />} />
            </Form.Item>
            
            <Form.Item
              name="email"
              label="邮箱"
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '请输入有效的邮箱地址' }
              ]}
            >
              <Input disabled />
            </Form.Item>
            
            <Form.Item
              name="organization"
              label="所属机构"
            >
              <Input />
            </Form.Item>
            
            <Form.Item
              name="title"
              label="职称/职位"
            >
              <Input />
            </Form.Item>
            
            <Form.Item
              name="bio"
              label="个人简介"
            >
              <Input.TextArea rows={4} />
            </Form.Item>
            
            <Form.Item
              name="password"
              label="新密码（留空表示不修改）"
            >
              <Input.Password prefix={<LockOutlined />} />
            </Form.Item>
            
            <Form.Item
              name="confirmPassword"
              label="确认新密码"
              dependencies={['password']}
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} />
            </Form.Item>
            
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} style={{ marginRight: 8 }}>
                保存资料
              </Button>
              <Button onClick={() => setEditMode(false)}>
                取消
              </Button>
            </Form.Item>
          </Form>
        ) : (
          <>
            <Descriptions bordered column={1}>
              <Descriptions.Item label="用户名">{userProfile?.username}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{userProfile?.email}</Descriptions.Item>
              <Descriptions.Item label="所属机构">{userProfile?.organization || '未设置'}</Descriptions.Item>
              <Descriptions.Item label="职称/职位">{userProfile?.title || '未设置'}</Descriptions.Item>
              <Descriptions.Item label="个人简介">{userProfile?.bio || '未设置个人简介'}</Descriptions.Item>
              <Descriptions.Item label="注册时间">{new Date(userProfile?.createdAt).toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="上次登录">{new Date(userProfile?.lastLogin).toLocaleString()}</Descriptions.Item>
            </Descriptions>
            
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Button type="primary" icon={<EditOutlined />} onClick={() => setEditMode(true)}>
                编辑资料
              </Button>
            </div>
          </>
        )}
        
        <Divider>活动记录</Divider>
        
        {userProfile?.activities && userProfile.activities.length > 0 ? (
          <List
            size="small"
            dataSource={userProfile.activities}
            renderItem={item => (
              <List.Item>
                <List.Item.Meta
                  title={`${item.action}`}
                  description={new Date(item.timestamp).toLocaleString()}
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty description="暂无活动记录" />
        )}
      </Card>
    </div>
  );
};

export default Profile;
