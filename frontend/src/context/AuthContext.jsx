/* Chia sẻ trạng thái người dùng và các thao tác đăng nhập/đăng xuất cho toàn bộ giao diện. */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';
const AuthContext = createContext(null);
/* Đọc token đã lưu trong trình duyệt để khôi phục phiên. */
const getToken = () => localStorage.getItem('unilost_token') || sessionStorage.getItem('unilost_token');

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  /* Khôi phục hồ sơ từ token; nếu phiên hết hiệu lực thì giao diện cần quay về trạng thái chưa đăng nhập. */
  useEffect(() => {
    if (!getToken()) return setLoading(false);
    api.get('/auth/me').then((response) => setUser(response.data)).catch((error) => {
      if (error.response?.status === 401) {
        localStorage.removeItem('unilost_token');
        sessionStorage.removeItem('unilost_token');
      }
    }).finally(() => setLoading(false));
  }, []);
  const save = (data, remember = false) => {
    const storage = remember ? localStorage : sessionStorage;
    localStorage.removeItem('unilost_token');
    sessionStorage.removeItem('unilost_token');
    storage.setItem('unilost_token', data.token);
    setUser(data.user);
  };
  const login = async (values, remember) => save((await api.post('/auth/login', { ...values, remember })).data, remember);
  const register = async (values, remember) => save((await api.post('/auth/register', { ...values, remember })).data, remember);
  /* Xóa phiên cục bộ và cập nhật trạng thái React để giao diện quay về chế độ chưa đăng nhập. */
  const logout = () => {
    localStorage.removeItem('unilost_token');
    sessionStorage.removeItem('unilost_token');
    setUser(null);
  };
  const refresh = async () => setUser((await api.get('/auth/me')).data);
  return <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
