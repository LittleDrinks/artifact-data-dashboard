import client from './client';

export interface LoginParams {
  username: string;
  password: string;
}

export interface RegisterParams {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export interface UserInfo {
  id: number;
  username: string;
  email: string;
  role: string;
}

/** 登录 */
export async function login(params: LoginParams): Promise<AuthResponse> {
  const form = new URLSearchParams();
  form.append('username', params.username);
  form.append('password', params.password);
  const res = await client.post<AuthResponse>('/auth/login', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return res.data;
}

/** 注册 */
export async function register(params: RegisterParams): Promise<AuthResponse> {
  const res = await client.post<AuthResponse>('/auth/register', params);
  return res.data;
}

/** 获取当前用户信息 */
export async function getMe(): Promise<UserInfo> {
  const res = await client.get<UserInfo>('/auth/me');
  return res.data;
}
