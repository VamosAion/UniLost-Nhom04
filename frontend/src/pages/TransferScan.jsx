/* Đọc QR hoặc mã nhập tay để mở trang xác nhận bàn giao; quản lý vòng đời bộ quét camera. */
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Html5QrcodeScanner } from 'html5-qrcode';

const tokenFrom = (value) => String(value || '').trim().split('/').filter(Boolean).pop();

export default function TransferScan() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') === 'manual' ? 'manual' : 'scan';
  const [manual, setManual] = useState('');
  const [cameraError, setCameraError] = useState('');

  useEffect(() => {
    if (mode !== 'scan') return undefined;
    const scanner = new Html5QrcodeScanner('qr-reader', {
      fps: 10, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true,
    }, false);
    scanner.render((value) => {
      scanner.clear().catch(() => {});
      navigate(`/transfers/confirm/${tokenFrom(value)}`);
    }, () => {});
    return () => { scanner.clear().catch(() => setCameraError('Không thể đóng camera.')); };
  }, [mode, navigate]);

  const submit = (event) => {
    event.preventDefault();
    const token = tokenFrom(manual);
    if (token) navigate(`/transfers/confirm/${token}`);
  };

  const close = () => navigate(location.state?.returnTo || '/', { replace: true });

  return <div className="qr-flow-screen qr-scan-page">
    <header className="qr-flow-header"><button type="button" onClick={close} aria-label="Đóng">×</button><strong>{mode === 'scan' ? 'Quét QR' : 'Nhập mã'}</strong><span /></header>
    {mode === 'scan' ? <main className="qr-camera-card">
      {!window.isSecureContext && <div className="qr-camera-warning">Camera có thể bị trình duyệt chặn khi dùng HTTP. Bạn vẫn có thể chọn ảnh QR hoặc chuyển sang Nhập mã.</div>}
      {cameraError && <div className="alert alert-warning">{cameraError}</div>}
      <div id="qr-reader" />
      <div className="qr-focus-frame"><i /><i /><i /><i /></div>
    </main> : <main className="qr-manual-card">
      <div className="manual-illustration"><span>▣</span><b>••••••</b><small>Xác nhận an toàn</small></div>
      <form onSubmit={submit}><input autoFocus inputMode="numeric" pattern="[0-9]*" maxLength="6" className="form-control form-control-lg" placeholder="Nhập mã 6 số" value={manual} onChange={(event) => setManual(event.target.value.replace(/\D/g, '').slice(0, 6))} /><button disabled={manual.length !== 6} className="btn btn-primary btn-lg w-100 mt-3">Gửi mã</button></form>
    </main>}
    <nav className="qr-flow-tabs two"><button className={mode === 'scan' ? 'active' : ''} onClick={() => setParams({})}>▦ <span>Quét QR</span></button><button className={mode === 'manual' ? 'active' : ''} onClick={() => setParams({ mode: 'manual' })}>⌨ <span>Nhập mã</span></button></nav>
  </div>;
}
