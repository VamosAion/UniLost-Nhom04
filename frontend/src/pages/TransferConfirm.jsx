/* Đọc mã bàn giao từ URL và gửi thao tác xác nhận/hủy; mã phải được backend kiểm tra trước khi thay đổi trạng thái. */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api, errorMessage } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';

const labels = { HANDED_TO_CTSV: 'bàn giao cho phòng công tác sinh viên', HANDED_TO_LOSER: 'bàn giao cho chủ sở hữu' };

export default function TransferConfirm() {
  const { token } = useParams(); const navigate = useNavigate(); const { user } = useAuth();
  const [item, setItem] = useState(null); const [qr, setQr] = useState('');
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const load = () => api.get(`/transfers/${token}`).then((response) => { setItem(response.data); setError(''); }).catch((requestError) => setError(errorMessage(requestError)));
  useEffect(() => { load(); }, [token]);
  const isCreator = item?.initiator?._id === user?.id;

  /* Đồng bộ dữ liệu định kỳ trong vòng đời component; chú ý hàm dọn timer khi component ngừng sử dụng. */
  useEffect(() => {
    if (!isCreator || item?.status !== 'PENDING') return undefined;
    QRCode.toDataURL(`${window.location.origin}/transfers/confirm/${token}`, { width: 420, margin: 2, color: { dark: '#101828', light: '#ffffff' } }).then(setQr);
    const timer = setInterval(async () => {
      try {
        const response = await api.get(`/transfers/${token}`);
        if (response.data.status === 'COMPLETED') navigate(`/posts/${response.data.post?._id}`, { replace: true });
      } catch { /* Giữ trang để người dùng có thể thử lại. */ }
    }, 2000);
    return () => clearInterval(timer);
  }, [isCreator, item?.status, token, navigate]);

  const confirm = async () => {
    if (!window.confirm('Xác nhận bạn đang trực tiếp tham gia lần bàn giao này?')) return;
    try {
      setError('');
      const response = await api.post(`/transfers/${token}/confirm`);
      setMessage(`${response.data.message} lúc ${new Date(response.data.confirmedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
      setItem((current) => current ? { ...current, status: 'COMPLETED' } : current);
    } catch (requestError) { setError(errorMessage(requestError)); }
  };

  const cancel = async () => {
    if (!window.confirm('Hủy mã QR hiện tại?')) return;
    try { await api.post(`/transfers/${token}/cancel`); navigate(`/posts/${item.post?._id}`, { replace: true }); }
    catch (requestError) { setError(errorMessage(requestError)); }
  };

  if (isCreator && item?.status === 'PENDING') return <div className="qr-flow-screen">
    <header className="qr-flow-header"><button type="button" onClick={cancel} aria-label="Hủy mã">×</button><strong>Tiếp tục bàn giao</strong><span /></header>
    <main className="qr-create-card"><div className="qr-party-note">{labels[item.targetStatus]}</div>{qr && <img className="transfer-qr" src={qr} alt="Mã QR xác nhận bàn giao" />}<div className="manual-code-label">Mã xác nhận</div><div className="manual-code">{token}</div><button className="btn btn-outline-primary" onClick={() => navigator.clipboard?.writeText(token)}>Sao chép mã</button><p>Đưa QR hoặc mã này cho {item.expectedConfirmer?.name} xác nhận.</p></main>
  </div>;

  return <div className="container py-5 narrow"><PageHeader title="Xác nhận bàn giao" description="Chỉ xác nhận khi bạn đang trực tiếp giao hoặc nhận đúng tài sản." />{error && <div className="alert alert-danger">{error}</div>}{message && <div className="alert alert-success">{message}</div>}{item && !message && <div className="form-card transfer-confirm-card"><div className="manual-code-label">Mã xác nhận</div><div className="manual-code">{item.token}</div><h2 className="h5 mt-4">{item.post?.title}</h2><p><b>Người tạo mã:</b> {item.initiator?.name}</p><p><b>Người xác nhận:</b> {item.expectedConfirmer?.name}</p><p><b>Nội dung:</b> {labels[item.targetStatus]}</p><button className="btn btn-success w-100 mt-3" disabled={item.status !== 'PENDING'} onClick={confirm}>Tôi đồng ý xác nhận bàn giao</button></div>}{message && item && <Link className="btn btn-primary" to={`/posts/${item.post?._id}`}>Trở về bài đăng</Link>}</div>;
}
