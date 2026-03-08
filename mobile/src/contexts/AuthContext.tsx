import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import apiClient from '../api/client';
import { deleteAuthItem, getAuthItem, setAuthItem } from '../lib/authStorage';

interface User {
  id: string;
  email: string;
  name: string;
  householdId: string | null;
  householdRole: 'owner' | 'member' | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  googleAuth: (idToken: string, googleId: string, email: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function fetchCurrentUser(authToken: string): Promise<User> {
  const response = await apiClient.get('/auth/me', {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });

  return response.data.user as User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  async function loadStoredAuth() {
    try {
      const storedToken = await getAuthItem('auth_token');
      if (storedToken) {
        const currentUser = await fetchCurrentUser(storedToken);
        await storeAuth(storedToken, currentUser);
      } else {
        setToken(null);
        setUser(null);
      }
    } catch (err) {
      await deleteAuthItem('auth_token');
      await deleteAuthItem('auth_user');
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function storeAuth(authToken: string, authUser: User) {
    await setAuthItem('auth_token', authToken);
    await setAuthItem('auth_user', JSON.stringify(authUser));
    setToken(authToken);
    setUser(authUser);
  }

  async function login(email: string, password: string) {
    const response = await apiClient.post('/auth/login', { email, password });
    await storeAuth(response.data.token, response.data.user);
  }

  async function register(email: string, password: string, name: string) {
    const response = await apiClient.post('/auth/register', { email, password, name });
    await storeAuth(response.data.token, response.data.user);
  }

  async function googleAuth(idToken: string, googleId: string, email: string, name: string) {
    const response = await apiClient.post('/auth/google', { idToken, googleId, email, name });
    await storeAuth(response.data.token, response.data.user);
  }

  async function logout() {
    await deleteAuthItem('auth_token');
    await deleteAuthItem('auth_user');
    setToken(null);
    setUser(null);
  }

  async function refreshUser() {
    if (token) {
      try {
        const currentUser = await fetchCurrentUser(token);
        await storeAuth(token, currentUser);
      } catch {
        await logout();
      }
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, googleAuth, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
