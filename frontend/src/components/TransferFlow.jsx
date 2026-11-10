/* Điều phối thao tác bàn giao từ bài viết: chọn phương án, tạo mã xác nhận và hiển thị trạng thái. */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api, errorMessage } from '../api.js';

const labels = {
  HANDED_TO_CTSV: 'Bàn giao cho phòng công tác sinh viên',
  HANDED_TO_LOSER: 'Bàn giao cho chủ sở hữu',
};

export default function TransferFlow({ post, onDone }) {
  const navigate = useNavigate();
  const [targets, setTargets] = useState([]);
  const [counterparts, setCounterparts] = useState({});
  const [target, setTarget] = useState('');
  const [stage, setStage] = useState('select');
  const [qr, setQr] = useState('');
  const [token, setToken] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/posts/${post._id}/transfer-options`).then((response) => {
      setTargets(response.data.targets);
      setCounterparts(response.data.counterparts || {});
      setTarget(response.data.targets[0] || '');
    }).catch(() => setTargets([]));
  }, [post._id, post.status]);

  /* Đồng bộ dữ liệu định kỳ trong vòng đời component; chú ý hàm dọn timer khi component ngừng sử dụng. */
  useEffect(() => {
    if (stage !== 'qr' || !token) return undefined;
    let stopped = false;
    const check = async () => {
      try {
        const response = await api.get(`/transfers/${token}`);
        if (!stopped && response.data.status === 'COMPLETED') {
          setStage('select'); setQr(''); setToken('');
          onDone?.();
          navigate(`/posts/${post._id}`, { replace: true });
        }
      } catch { /* Mã có thể vừa hết hạn hoặc mạng tạm ngắt; lần kiểm tra sau sẽ thử lại. */ }
    };
    check();
    const timer = setInterval(check, 2000);
    return () => { stopped = true; clearInterval(timer); };
  }, [stage, token, navigate, post._id]);

  const confirmChoice = () => {
    if (target && window.confirm(`Bạn có chắc muốn thực hiện “${labels[target]}”?`)) setStage('method');
  };

  const createQr = async () => {
    setBusy(true); setError('');
    try {
      const response = await api.post('/transfers', { postId: post._id, targetStatus: target });
      const link = `${window.location.origin}/transfers/confirm/${response.data.token}`;
      setQr(await QRCode.toDataURL(link, { width: 420, margin: 2, color: { dark: '#101828', light: '#ffffff' } }));
      setToken(response.data.token); setExpiresAt(response.data.expiresAt); setStage('qr');
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  };

  const closeQr = async () => {
    if (!window.confirm('Hủy mã QR hiện tại và quay lại bài viết?')) return;
    try { if (token) await api.post(`/transfers/${token}/cancel`); }
    catch (requestError) { setError(errorMessage(requestError)); }
    setStage('select'); setQr(''); setToken(''); onDone?.();
  };
  const openScanner = (mode = 'scan') => {
    setStage('select'); setQr(''); setToken('');
    navigate(`/transfers/scan${mode === 'manual' ? '?mode=manual' : ''}`, { state: { returnTo: `/posts/${post._id}` } });
  };
  if (!targets.length) return null;

  return <div className="status-confirm-box">
    <h3 className="h6">Xác nhận bàn giao hai bên</h3>
    {error && <div className="alert alert-danger py-2">{error}</div>}
    {stage === 'select' && <><div className="d-flex gap-2 flex-wrap"><select className="form-select flex-grow-1" value={target} onChange={(event) => setTarget(event.target.value)}>{targets.map((item) => <option value={item} key={item}>{labels[item]}</option>)}</select><button className="btn btn-warning" onClick={confirmChoice}>Xác nhận</button></div>{counterparts[target] && <div className="small mt-2">Người xác nhận cùng bạn: <b>{counterparts[target].name}</b>{counterparts[target].role === 'ADMIN' ? ' (Phòng CTSV)' : ''}</div>}</>}
    {stage === 'method' && <><p className="small text-muted">Một bên tạo mã, bên còn lại quét QR hoặc nhập mã 6 số để xác nhận.</p><div className="d-grid gap-2 d-md-flex"><button disabled={busy} className="btn btn-primary" onClick={createQr}>{busy ? 'Đang tạo...' : 'Tạo mã QR'}</button><button className="btn btn-outline-primary" onClick={() => openScanner('scan')}>Quét hoặc nhập mã</button><button className="btn btn-light" onClick={() => setStage('select')}>Quay lại</button></div></>}
    {stage === 'qr' && <div className="qr-flow-screen">
      <header className="qr-flow-header"><button type="button" onClick={closeQr} aria-label="Hủy mã">×</button><strong>Tạo mã</strong><span /></header>
      <main className="qr-create-card"><div className="qr-party-note">{labels[target]}</div><img className="transfer-qr" src={qr} alt="Mã QR xác nhận bàn giao" /><div className="manual-code-label">Mã xác nhận</div><div className="manual-code">{token}</div><button className="btn btn-outline-primary" onClick={() => navigator.clipboard?.writeText(token)}>Sao chép mã</button><p>Đưa QR hoặc mã này cho bên còn lại xác nhận.</p><small>Hết hạn: {new Date(expiresAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</small></main>
    </div>}
  </div>;
}
