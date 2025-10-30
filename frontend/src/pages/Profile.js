import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Avatar, Descriptions, Spin, Alert, message, Divider, List, Empty, Tag, Space } from 'antd';
import { UserOutlined, LockOutlined, EditOutlined, SaveOutlined } from '@ant-design/icons';
import { getUserProfile, updateUserProfile } from '../services/auth.service';

const activityLabelMap = {
  login: '登录系统',
  view_artifact: '查看文物',
  search: '搜索操作',
  export: '导出数据',
  import: '导入数据'
};

const formatDateTime = (value) => {
  if (!value) {
    return '暂无记录';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '暂无记录';
  }
  return date.toLocaleString();
};

const Profile = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    let isMounted = true;

    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getUserProfile();
        if (!isMounted) {
          return;
        }
        setUserProfile(response.data);
      } catch (err) {
        if (!isMounted) {
          return;
        }
        console.error('加载用户资料失败:', err);
        const errorMessage = err.response?.data?.message || '加载用户资料失败，请稍后重试';
        setError(errorMessage);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!userProfile) {
      return;
    }

    form.setFieldsValue({
      username: userProfile.username || '',
      email: userProfile.email || '',
      organization: userProfile.organization || '',
      title: userProfile.title || '',
      bio: userProfile.bio || '',
      password: undefined,
      confirmPassword: undefined
    });
  }, [userProfile, form]);

  const handleSaveProfile = async (values) => {
    const trimmedUsername = values.username?.trim();
    if (!trimmedUsername) {
      message.error('用户名不能为空');
      return;
    }

    const payload = {
      username: trimmedUsername,
      organization: values.organization?.trim() || '',
      title: values.title?.trim() || '',
      bio: values.bio ?? ''
    };

    if (values.password) {
      payload.password = values.password;
      payload.confirmPassword = values.confirmPassword;
    }

    setSaving(true);

    try {
      const response = await updateUserProfile(payload);
      message.success('资料更新成功');

      const updatedProfile = {
        ...userProfile,
        ...response.data.user
      };

      setUserProfile(updatedProfile);

      form.setFieldsValue({
        username: updatedProfile.username || '',
        email: updatedProfile.email || '',
        organization: updatedProfile.organization || '',
        title: updatedProfile.title || '',
        bio: updatedProfile.bio || '',
        password: undefined,
        confirmPassword: undefined
      });

      const storedUser = localStorage.getItem('user');
      const cachedUser = storedUser ? JSON.parse(storedUser) : {};
      localStorage.setItem('user', JSON.stringify({ ...cachedUser, ...response.data.user }));

      setEditMode(false);
    } catch (err) {
      console.error('更新资料失败:', err);
      const errorMessage = err.response?.data?.message || '更新资料失败，请稍后重试';
      message.error(errorMessage);
    } finally {
      setSaving(false);
    }
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
              username: userProfile?.username || '',
              email: userProfile?.email || '',
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
              rules={[
                {
                  validator: (_, value) => {
                    if (!value) {
                      return Promise.resolve();
                    }
                    if (value.length < 8) {
                      return Promise.reject(new Error('密码长度至少为8位'));
                    }
                    return Promise.resolve();
                  }
                }
              ]}
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
                    const passwordValue = getFieldValue('password');
                    if (!passwordValue && !value) {
                      return Promise.resolve();
                    }
                    if (passwordValue && !value) {
                      return Promise.reject(new Error('请再次输入新密码'));
                    }
                    if (passwordValue !== value) {
                      return Promise.reject(new Error('两次输入的密码不一致'));
                    }
                    return Promise.resolve();
                  }
                })
              ]}
            >
              <Input.Password prefix={<LockOutlined />} />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                style={{ marginRight: 8 }}
                loading={saving}
              >
                保存资料
              </Button>
              <Button onClick={() => setEditMode(false)} disabled={saving}>
                取消
              </Button>
            </Form.Item>
          </Form>
        ) : (
          <>
            <Descriptions bordered column={1}>
              <Descriptions.Item label="用户名">{userProfile?.username}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{userProfile?.email}</Descriptions.Item>
              <Descriptions.Item label="角色">{userProfile?.role === 'admin' ? '管理员' : '普通用户'}</Descriptions.Item>
              <Descriptions.Item label="所属机构">{userProfile?.organization || '未设置'}</Descriptions.Item>
              <Descriptions.Item label="职称/职位">{userProfile?.title || '未设置'}</Descriptions.Item>
              <Descriptions.Item label="个人简介">{userProfile?.bio || '未设置个人简介'}</Descriptions.Item>
              <Descriptions.Item label="注册时间">{formatDateTime(userProfile?.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="上次登录">{formatDateTime(userProfile?.lastLogin)}</Descriptions.Item>
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
            renderItem={(item) => (
              <List.Item>
                <List.Item.Meta
                  title={
                    <Space size="small">
                      <Tag color="blue">{activityLabelMap[item.action] || item.action}</Tag>
                      <span>{formatDateTime(item.timestamp)}</span>
                    </Space>
                  }
                  description={item.details || '无附加信息'}
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
