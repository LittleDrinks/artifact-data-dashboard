import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Tabs, Alert } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { useAuth } from '../hooks/useAuth';

/** 登录/注册页面 */
export default function Login() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const onLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    setErrorMsg('');
    try {
      await login(values.username, values.password);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        '登录失败';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const onRegister = async (values: {
    username: string;
    email: string;
    password: string;
    confirm_password: string;
  }) => {
    setLoading(true);
    setErrorMsg('');
    try {
      await register(values.username, values.email, values.password);
      setSuccessMsg('注册成功，正在跳转...');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        '注册失败';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // 如果已登录，跳转首页
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-panel)',
      }}
    >
      <Card
        style={{
          width: 400,
          borderRadius: 'var(--r-card)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {/* Logo */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 8,
              background: 'var(--purple)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 22,
              fontWeight: 400,
              marginBottom: 12,
            }}
          >
            文
          </div>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 400,
              color: 'var(--text-heading)',
              letterSpacing: '-0.22px',
              margin: 0,
            }}
          >
            文物大数据平台
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-body)', marginTop: 4 }}>
            人机协作的文化遗产数据平台
          </p>
        </div>

        {errorMsg && (
          <Alert
            message={errorMsg}
            type="error"
            showIcon
            closable
            style={{ marginBottom: 16 }}
            onClose={() => setErrorMsg('')}
          />
        )}
        {successMsg && (
          <Alert
            message={successMsg}
            type="success"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          centered
          items={[
            {
              key: 'login',
              label: '登录',
              children: (
                <Form onFinish={onLogin} autoComplete="off">
                  <Form.Item
                    name="username"
                    rules={[{ required: true, message: '请输入用户名' }]}
                  >
                    <Input
                      prefix={<UserOutlined />}
                      placeholder="用户名"
                      size="large"
                    />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    rules={[{ required: true, message: '请输入密码' }]}
                  >
                    <Input.Password
                      prefix={<LockOutlined />}
                      placeholder="密码"
                      size="large"
                    />
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={loading}
                      block
                      size="large"
                    >
                      登录
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'register',
              label: '注册',
              children: (
                <Form onFinish={onRegister} autoComplete="off">
                  <Form.Item
                    name="username"
                    rules={[{ required: true, message: '请输入用户名' }]}
                  >
                    <Input
                      prefix={<UserOutlined />}
                      placeholder="用户名"
                      size="large"
                    />
                  </Form.Item>
                  <Form.Item
                    name="email"
                    rules={[
                      { required: true, message: '请输入邮箱' },
                      { type: 'email', message: '请输入有效的邮箱' },
                    ]}
                  >
                    <Input
                      prefix={<MailOutlined />}
                      placeholder="邮箱"
                      size="large"
                    />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    rules={[
                      { required: true, message: '请输入密码' },
                      { min: 8, message: '密码至少8个字符' },
                    ]}
                  >
                    <Input.Password
                      prefix={<LockOutlined />}
                      placeholder="密码"
                      size="large"
                    />
                  </Form.Item>
                  <Form.Item
                    name="confirm_password"
                    dependencies={['password']}
                    rules={[
                      { required: true, message: '请确认密码' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('password') === value) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error('两次密码不一致'));
                        },
                      }),
                    ]}
                  >
                    <Input.Password
                      prefix={<LockOutlined />}
                      placeholder="确认密码"
                      size="large"
                    />
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={loading}
                      block
                      size="large"
                    >
                      注册
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
