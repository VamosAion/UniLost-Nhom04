/* Cho người đang đăng nhập thay đổi mật khẩu qua API; không lưu mật khẩu vào bộ nhớ trình duyệt. */
import React, { useState } from 'react';
import { api, errorMessage } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';

export default function ChangePassword() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [show, setShow] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); setError(''); setMessage('');
    if (form.newPassword !== form.confirmPassword) return setError('Mật khẩu xác nhận không khớp');
    try { await api.patch('/auth/password', { currentPassword: form.currentPassword, newPassword: form.newPassword }); setMessage('Đổi mật khẩu thành công'); setForm({ currentPassword: '', newPassword: '', confirmPassword: '' }); }
    catch (requestError) { setError(errorMessage(requestError)); }
  };
  return <div className="container py-5 narrow"><PageHeader title="Đổi mật khẩu" description="Mật khẩu mới cần có ít nhất 8 ký tự." />{message && <div className="alert alert-success">{message}</div>}{error && <div className="alert alert-danger">{error}</div>}<form className="form-card" onSubmit={submit}><label className="form-label">Mật khẩu hiện tại</label><input required minLength="8" type={show ? 'text' : 'password'} className="form-control mb-3" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} /><label className="form-label">Mật khẩu mới</label><input required minLength="8" type={show ? 'text' : 'password'} className="form-control mb-3" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} /><label className="form-label">Xác nhận mật khẩu mới</label><input required minLength="8" type={show ? 'text' : 'password'} className="form-control mb-3" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} /><label className="form-check mb-4"><input type="checkbox" className="form-check-input" checked={show} onChange={(event) => setShow(event.target.checked)} /> <span className="form-check-label">Hiện mật khẩu</span></label><button className="btn btn-primary">Đổi mật khẩu</button></form></div>;
}
