/* Chỉnh sửa thông tin hồ sơ của người đang đăng nhập. */
import React, { useEffect, useState } from 'react';
import { api, assetUrl, errorMessage } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';

export default function Profile() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({ name: '', phone: '' });
  const [avatar, setAvatar] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => setForm({ name: user.name, phone: user.phone || '' }), [user]);
  const submit = async (event) => {
    event.preventDefault(); setError(''); setMessage('');
    try {
      await api.patch('/auth/me', form);
      if (avatar) { const body = new FormData(); body.append('avatar', avatar); await api.post('/auth/avatar', body); }
      await refresh(); setMessage('Đã cập nhật hồ sơ');
    } catch (requestError) { setError(errorMessage(requestError)); }
  };
  return <div className="container py-5 narrow"><PageHeader title="Hồ sơ cá nhân" description={`${user.email} · ${user.role}`} />
    {message && <div className="alert alert-success">{message}</div>}{error && <div className="alert alert-danger">{error}</div>}
    <form className="form-card" onSubmit={submit}>
      <div className="text-center mb-4"><img className="avatar-lg" src={assetUrl(user.avatar) || 'https://placehold.co/120x120?text=U'} alt="Ảnh đại diện" /></div>
      <label className="form-label">Họ và tên</label><input className="form-control mb-3" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      <label className="form-label">Số điện thoại</label><input className="form-control mb-3" inputMode="numeric" pattern="(032|033|034|035|036|037|038|039|081|082|083|084|085|088|070|076|077|078|079|052|056|058|059|099|093)[0-9]{7}" title="Nhập đủ 10 số với đầu số được hỗ trợ" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
      <label className="form-label">Ảnh đại diện</label><input type="file" accept="image/jpeg,image/png,image/webp" className="form-control mb-4" onChange={(event) => setAvatar(event.target.files[0])} /><div className="form-text mb-3">Chọn ảnh trực tiếp từ máy, tối đa 3 MB.</div>
      <button className="btn btn-primary">Lưu thay đổi</button>
    </form>
  </div>;
}
