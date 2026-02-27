import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import apiClient from '../api/client';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  async function loadStoredAuth() {
    try {
      const storedToken = await SecureStore.getItemAsync('auth_token');
      const storedUser = await SecureStore.getItemAsync('auth_user');
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (err) {
      // Silently fail -- user will need to login
    } finally {
      setIsLoading(false);
    }
  }

  async function storeAuth(authToken: string, authUser: User) {
    await SecureStore.setItemAsync('auth_token', authToken);
    await SecureStore.setItemAsync('auth_user', JSON.stringify(authUser));
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
    await SecureStore.deleteItemAsync('auth_token');
    await SecureStore.deleteItemAsync('auth_user');
    setToken(null);
    setUser(null);
  }

  async function refreshUser() {
    if (token) {
      try {
        const storedUser = await SecureStore.getItemAsync('auth_user');
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }
      } catch {
        // ignore
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
