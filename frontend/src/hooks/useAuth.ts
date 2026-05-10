import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as authApi from '../api/auth';
import type { UserInfo } from '../api/auth';

/** 认证状态 hook */
export function useAuth() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(() => {
    const token = localStorage.getItem('token');
    return !!token; // 有 token 时先 loading，等验证完成后再关闭
  });

  // 初始化：验证 token 并获取用户信息
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    authApi
      .getMe()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('token');
      })
      .finally(() => setLoading(false));
  }, []);

  /** 登录 */
  const login = useCallback(
    async (username: string, password: string) => {
      const res = await authApi.login({ username, password });
      localStorage.setItem('token', res.access_token);
      const userInfo = await authApi.getMe();
      setUser(userInfo);
      navigate('/');
    },
    [navigate],
  );

  /** 注册（注册成功后自动登录） */
  const register = useCallback(
    async (username: string, email: string, password: string) => {
      await authApi.register({ username, email, password, confirm_password: password });
      // 注册成功后自动登录获取 token
      const loginRes = await authApi.login({ username, password });
      localStorage.setItem('token', loginRes.access_token);
      const userInfo = await authApi.getMe();
      setUser(userInfo);
      navigate('/');
    },
    [navigate],
  );

  /** 登出 */
  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setUser(null);
    navigate('/login');
  }, [navigate]);

  return { user, loading, login, register, logout, isAuthenticated: !!user };
}
