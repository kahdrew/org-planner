import client from './client';
import type { User } from '@/types';

interface AuthResponse {
  user: User;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await client.post<AuthResponse>('/auth/login', { email, password });
  return data;
}

export async function register(email: string, password: string, name: string): Promise<AuthResponse> {
  const { data } = await client.post<AuthResponse>('/auth/register', { email, password, name });
  return data;
}

export async function me(): Promise<AuthResponse> {
  const { data } = await client.get<AuthResponse>('/auth/me');
  return data;
}

export async function logout(): Promise<void> {
  await client.post('/auth/logout');
}
