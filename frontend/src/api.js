/* Dùng chung kết nối Axios tới backend qua /api. Token được gắn vào yêu cầu để backend xác định người đang thao tác. */
import axios from 'axios';
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('unilost_token') || sessionStorage.getItem('unilost_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
export const assetUrl = (value) => value;
export const errorMessage = (error) => error.response?.data?.message || 'Không thể kết nối máy chủ';
