/* Biểu mẫu đăng nhập/đăng ký; gửi dữ liệu tới lớp xác thực và hiển thị lỗi trả về từ backend. */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const [form, setForm] = useState({ name: '', email: '', password: '', code: '' });
  const [codeSent, setCodeSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const normalizedEmail = () => { const raw=form.email.trim().toLowerCase(); return raw.includes('@')?raw:`${raw}@dntu.edu.vn`; };
  const sendCode = async () => {
    const email=normalizedEmail(); if(!/^\d{10}@dntu\.edu\.vn$/i.test(email))return setError('Hãy nhập đúng email sinh viên DNTU trước khi gửi mã');
    setBusy(true);setError('');try{await api.post('/auth/register/send-code',{email});setCodeSent(true);}catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  };

  const submit = async (event) => {
    event.preventDefault();
    const rawEmail = form.email.trim().toLowerCase();
    if (rawEmail.includes('@') && !rawEmail.endsWith('@dntu.edu.vn')) return setError('Sai định dạng email. Vui lòng sử dụng email DNTU');
    const email = normalizedEmail();
    if (!/^\d{10}@dntu\.edu\.vn$/i.test(email) && isRegister) {
      return setError('Sai định dạng. Email sinh viên phải gồm 10 chữ số mã sinh viên@dntu.edu.vn');
    }
    if (!/^[^\s@]+@dntu\.edu\.vn$/i.test(email)) {
      return setError('Sai định dạng email. Vui lòng sử dụng email DNTU');
    }
    setBusy(true); setError('');
    try {
      if (isRegister) await register({ ...form, email }, remember);
      else await login({ ...form, email }, remember);
      navigate('/');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  return <div className="auth-page"><div className="auth-card">
    <div className="text-center mb-4"><span className="brand-mark big">U</span><h1 className="h3 mt-3">{isRegister ? 'Tạo tài khoản UniLost' : 'Chào mừng trở lại'}</h1><p className="text-muted">{isRegister ? 'Sử dụng email sinh viên DNTU' : 'Đăng nhập để quản lý tài sản của bạn'}</p></div>
    {error && <div className="alert alert-danger">{error}</div>}
    <form onSubmit={submit}>
      {isRegister && <div className="mb-3"><label className="form-label">Họ và tên</label><input required minLength="2" className="form-control" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>}
      <div className="mb-3"><label className="form-label">Email DNTU</label><input required type="text" inputMode="email" className="form-control" placeholder="Mã sinh viên hoặc email DNTU" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /><div className="form-text">Nếu chỉ nhập mã sinh viên, hệ thống tự thêm @dntu.edu.vn.</div></div>
      {isRegister && <div className="mb-3"><label className="form-label">Mã xác minh email</label><div className="input-group"><input required inputMode="numeric" maxLength="6" className="form-control" placeholder="Nhập mã 6 số" value={form.code} onChange={(event)=>setForm({...form,code:event.target.value.replace(/\D/g,'').slice(0,6)})}/><button type="button" className="btn btn-outline-primary" disabled={busy} onClick={sendCode}>{codeSent?'Gửi lại mã':'Gửi mã'}</button></div>{codeSent&&<div className="form-text text-success">Mã đã gửi, vui lòng kiểm tra email và thư rác.</div>}</div>}
      <div className="mb-3"><label className="form-label">Mật khẩu</label><div className="input-group"><input required minLength="8" type={showPassword ? 'text' : 'password'} className="form-control" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><button type="button" className="btn btn-outline-secondary" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Ẩn' : 'Hiện'}</button></div></div>
      <div className="d-flex justify-content-between align-items-center mb-3"><label className="form-check"><input className="form-check-input" type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> <span className="form-check-label">Nhớ đăng nhập</span></label>{!isRegister && <Link to="/forgot-password">Quên mật khẩu?</Link>}</div>
      <button disabled={busy} className="btn btn-primary w-100">{busy ? 'Đang xử lý...' : isRegister ? 'Đăng ký' : 'Đăng nhập'}</button>
    </form>
    <p className="text-center mt-4 mb-0">{isRegister ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Đăng nhập' : 'Đăng ký'}</Link></p>
  </div></div>;
}
