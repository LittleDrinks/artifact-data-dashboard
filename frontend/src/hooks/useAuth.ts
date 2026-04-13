import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as authApi from '../api/auth';
import type { UserInfo } from '../api/auth';

/** 认证状态 hook */
export function useAuth() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // 初始化：检查 token 并获取用户信息
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
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

  /** 注册 */
  const register = useCallback(
    async (username: string, email: string, password: string) => {
      const res = await authApi.register({ username, email, password });
      localStorage.setItem('token', res.access_token);
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
