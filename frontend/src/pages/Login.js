import React, { useState } from 'react';
import { Form, Input, Button, Card, Checkbox, message, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../services/auth.service';

const Login = ({ onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const navigate = useNavigate();

  const onFinish = async (values) => {
    const { username, password } = values;
    setLoading(true);
    setFieldErrors({}); // 清除字段错误

    try {
      const response = await login(username, password);
      message.success('登录成功！');
      onLoginSuccess(response.user);
      navigate('/'); // 登录成功后跳转到首页
    } catch (error) {
      console.error('登录失败:', error);
      const errorResponse = error.response?.data;
      const errorMessage = errorResponse?.message || '登录失败，请检查用户名和密码';

      // 处理特定的密码错误
      if (errorResponse?.errorType) {
        handleSpecificErrors(errorResponse);
      } else if (errorMessage.includes('密码')) {
        // 针对一般密码错误提供更友好的提示
        setFieldErrors({
          password: '密码错误，请重新输入'
        });
      } else if (errorMessage.includes('用户名') || errorMessage.includes('不存在')) {
        // 用户名相关错误
        setFieldErrors({
          username: '用户名不存在或输入有误'
        });
      }

      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // 处理特定类型的错误
  const handleSpecificErrors = (errorResponse) => {
    const { errorType, message: errorMessage } = errorResponse;

    switch (errorType) {
      case 'PASSWORD_INCORRECT':
        setFieldErrors({
          password: '密码不正确，请重新输入'
        });
        break;
      case 'PASSWORD_EXPIRED':
        setFieldErrors({
          password: '密码已过期，请联系管理员重置'
        });
        break; case 'ACCOUNT_LOCKED':
        setFieldErrors({
          username: '账户已被锁定，请联系管理员解锁'
        });
        break;
      case 'MAX_ATTEMPTS_EXCEEDED':
        setFieldErrors({
          username: '登录尝试次数过多，请稍后再试或重置密码'
        });
        break;
      case 'USER_NOT_FOUND':
        setFieldErrors({
          username: '用户不存在，请检查用户名或注册新账户'
        });
        break; default:
        setFieldErrors({
          username: errorMessage || '登录失败，请检查用户名和密码'
        });
    }
  };
  return (
    <div className="login-container">
      <Card 
        className="login-form" 
        title={
          <Typography.Title level={5} style={{ margin: 0, whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'center' }}>
            文物大数据与人工智能集成系统
          </Typography.Title>
        } 
        bordered={false}
      >
        <Form
          name="login"
          initialValues={{ remember: true }}
          onFinish={onFinish}
        >          <Form.Item
          name="username"
          rules={[{ required: true, message: '请输入用户名或邮箱!' }]}
          validateStatus={fieldErrors.username ? 'error' : undefined}
          help={fieldErrors.username}
        >
            <Input prefix={<UserOutlined />} placeholder="用户名或邮箱" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码!' }]}
            validateStatus={fieldErrors.password ? 'error' : undefined}
            help={fieldErrors.password}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>

          <Form.Item>
            <Form.Item name="remember" valuePropName="checked" noStyle>
              <Checkbox>记住我</Checkbox>
            </Form.Item>

            <Link style={{ float: 'right' }} to="#">
              忘记密码
            </Link>
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" className="login-form-button" loading={loading} block>
              登录
            </Button>
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              还没有账号？ <Link to="/register">立即注册</Link>
            </div>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default Login;
