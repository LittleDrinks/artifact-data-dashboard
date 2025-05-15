import React, { useState } from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { register } from '../services/auth.service';

const Register = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  
  const onFinish = async (values) => {
    const { username, email, password, confirmPassword } = values;
    
    if (password !== confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }
    
    setLoading(true);
    
    try {
      await register(username, email, password);
      message.success('注册成功！请登录');
      navigate('/login');
    } catch (error) {
      console.error('注册失败:', error);
      const errorMessage = error.response?.data?.message || '注册失败，请稍后重试';
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="login-container">
      <Card className="login-form" title={<h2 className="login-form-title">注册账号</h2>} bordered={false}>
        <Form
          name="register"
          onFinish={onFinish}
          scrollToFirstError
        >
          <Form.Item
            name="username"
            rules={[
              { required: true, message: '请输入用户名!' },
              { min: 3, message: '用户名至少3个字符' },
              { max: 20, message: '用户名最多20个字符' }
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          
          <Form.Item
            name="email"
            rules={[
              { required: true, message: '请输入邮箱!' },
              { type: 'email', message: '请输入有效的邮箱地址!' }
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="邮箱" />
          </Form.Item>
          
          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码!' },
              { min: 6, message: '密码至少6个字符' }
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          
          <Form.Item
            name="confirmPassword"
            rules={[
              { required: true, message: '请确认密码!' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致!'));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="确认密码" />
          </Form.Item>
          
          <Form.Item>
            <Button type="primary" htmlType="submit" className="login-form-button" loading={loading}>
              注册
            </Button>
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              已有账号？ <Link to="/login">立即登录</Link>
            </div>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default Register;
