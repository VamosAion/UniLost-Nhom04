/* Luồng khôi phục mật khẩu: yêu cầu mã xác minh rồi gửi mã cùng mật khẩu mới. */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api.js';

export default function ForgotPassword() {
  const [form, setForm] = useState({ email: '', code: '', newPassword: '' });
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [resetting, setResetting] = useState(false);

  const sendCode = async (event) => {
    event.preventDefault();
    if (sendingCode) return;
    setSendingCode(true); setError(''); setMessage('Đang gửi mã xác nhận, vui lòng chờ...');
    try {
      await api.post('/auth/forgot-password', { email: form.email });
      setMessage('Mã xác nhận đã được gửi. Vui lòng kiểm tra hộp thư hoặc hòm thư rác nếu không thấy mã.');
      setStep(2);
    }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setSendingCode(false); }
  };
  const reset = async (event) => {
    event.preventDefault();
    if (resetting) return;
    setResetting(true); setError('');
    try { setMessage((await api.post('/auth/reset-password', form)).data.message); setStep(3); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setResetting(false); }
  };

  return <div className="auth-page"><div className="auth-card">
    <h1 className="h3 mb-3">Khôi phục mật khẩu</h1>
    {message && <div className="alert alert-success">{message}</div>}
    {error && <div className="alert alert-danger">{error}</div>}
    {step === 1 && <form onSubmit={sendCode}><label className="form-label">Email sinh viên DNTU</label><input required disabled={sendingCode} type="text" inputMode="email" className="form-control mb-3" placeholder="Mã sinh viên hoặc email DNTU" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /><button disabled={sendingCode} className="btn btn-primary w-100">{sendingCode ? 'Đang gửi mã và chuyển bước...' : 'Gửi mã xác nhận'}</button>{sendingCode && <div className="text-center text-muted small mt-2">Vui lòng không đóng trang hoặc nhấn gửi lại.</div>}</form>}
    {step === 2 && <form onSubmit={reset}><label className="form-label">Mã gồm 6 chữ số</label><input required disabled={resetting} inputMode="numeric" pattern="[0-9]{6}" maxLength="6" className="form-control mb-3" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.replace(/\D/g, '').slice(0, 6) })} /><label className="form-label">Mật khẩu mới</label><div className="input-group mb-3"><input required disabled={resetting} minLength="8" type={showPassword ? 'text' : 'password'} className="form-control" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} /><button disabled={resetting} type="button" className="btn btn-outline-secondary" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Ẩn' : 'Hiện'}</button></div><button disabled={resetting} className="btn btn-primary w-100">{resetting ? 'Đang đặt lại mật khẩu...' : 'Đặt lại mật khẩu'}</button></form>}
    <p className="text-center mt-4 mb-0"><Link to="/login">Quay lại đăng nhập</Link></p>
  </div></div>;
}
