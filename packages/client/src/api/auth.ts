import client from './client';
import type { User } from '@/types';

interface AuthResponse {
  token: string;
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
