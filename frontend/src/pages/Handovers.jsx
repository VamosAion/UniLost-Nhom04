/* Theo dõi lịch và trạng thái bàn giao, hiển thị các thao tác của bên tham gia. */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, assetUrl, errorMessage } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';

const formatHanoi = (value) => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa lên lịch';
const toHanoiIso = (value) => new Date(`${value}:00+07:00`).toISOString();
const labels = { FINDER_SCHEDULED: 'Chưa bàn giao', RECEIVER_SCHEDULED: 'Chưa bàn giao', COMPLETED: 'Đã bàn giao', CANCELLED: 'Đã hủy' };

export default function Handovers({ embedded = false }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const load = () => api.get('/handovers').then((response) => setItems(response.data)).catch((requestError) => setError(errorMessage(requestError)));
  /* Đồng bộ dữ liệu định kỳ trong vòng đời component; chú ý hàm dọn timer khi component ngừng sử dụng. */
  useEffect(() => { load(); const timer = setInterval(load, 5000); return () => clearInterval(timer); }, []);

  const participantIds = (item) => {
    const post = item.claim?.post;
    const claimant = item.claim?.claimant;
    if (!post || !claimant) return { finder: '', receiver: '' };
    return post.type === 'FOUND'
      ? { finder: String(post.owner?._id || post.owner || ''), receiver: String(claimant._id || claimant) }
      : { finder: String(claimant._id || claimant), receiver: String(post.owner?._id || post.owner || '') };
  };

  const receiverSchedule = async (item) => {
    const scheduledAt = window.prompt('Thời gian nhận theo YYYY-MM-DDTHH:mm (UTC+7):');
    const locationText = window.prompt('Địa điểm nhận:', item.method === 'SUPPORT_OFFICE' ? 'Phòng Công tác Sinh viên' : item.finderLocation);
    if (!scheduledAt || !locationText) return;
    try { await api.patch(`/handovers/${item._id}/receiver`, { scheduledAt: toHanoiIso(scheduledAt), locationText }); await load(); }
    catch (requestError) { setError(errorMessage(requestError)); }
  };

  return <div className={embedded ? '' : 'container py-5'}>
    {!embedded && <PageHeader title="Lịch bàn giao" description="Thời gian hiển thị theo múi giờ Hà Nội (UTC+7). Người nhặt lên lịch trước, người mất xác nhận lịch nhận sau." />}
    {error && <div className="alert alert-danger">{error}</div>}
    <div className="row g-3">{items.map((item) => {
      const ids = participantIds(item);
      const isFinder = ids.finder === user?.id;
      const isReceiver = ids.receiver === user?.id;
      return <div className="col-lg-6" key={item._id}><div className="form-card h-100">
        <div className="d-flex justify-content-between gap-2"><h2 className="h5">{item.claim?.post?.title}</h2><span className="badge text-bg-primary">{labels[item.status]}</span></div>
        <p className="mb-1"><b>Phương thức:</b> {item.method === 'DIRECT' ? 'Bàn giao trực tiếp' : 'Qua phòng CTSV'}</p>
        <div className="handover-step"><b>Lịch trả của người nhặt</b><div>{formatHanoi(item.finderScheduledAt)}</div><div>{item.finderLocation}</div></div>
        <div className="handover-step"><b>Lịch nhận của người mất</b><div>{formatHanoi(item.receiverScheduledAt)}</div><div>{item.receiverLocation || 'Chưa xác nhận'}</div></div>
        {isReceiver && item.status === 'FINDER_SCHEDULED' && <button className="btn btn-primary" onClick={() => receiverSchedule(item)}>Lên lịch nhận lại đồ</button>}
        {(isFinder || isReceiver) && item.status === 'RECEIVER_SCHEDULED' && <Link className="btn btn-success w-100 mt-3" to={`/posts/${item.claim.post._id}`}>Xác nhận bàn giao bằng QR</Link>}
        <div className="small text-muted mt-3">Trạng thái bàn giao: <b>{labels[item.status]}</b>{item.status === 'RECEIVER_SCHEDULED' && ' — chờ hai bên xác nhận QR'}</div>
        {item.completionImages?.length > 0 && <div className="evidence-grid mt-3">{item.completionImages.map((image) => <img key={image} src={assetUrl(image)} alt="Minh chứng bàn giao" />)}</div>}
      </div></div>;
    })}{!items.length && <div className="empty-state">Chưa có lịch bàn giao. Lịch được tạo sau khi yêu cầu được xác minh.</div>}</div>
  </div>;
}
