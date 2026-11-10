/* Hiển thị hồ sơ công khai và các thao tác liên hệ/báo cáo được hỗ trợ. */
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, assetUrl, errorMessage } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function PublicProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [showReport, setShowReport] = useState(false); const [reasonCode, setReasonCode] = useState('SPAM'); const [reason, setReason] = useState(''); const [evidence, setEvidence] = useState([]); const [notice, setNotice] = useState('');
  useEffect(() => { api.get(`/users/${id}`).then((response) => setProfile(response.data)).catch((requestError) => setError(errorMessage(requestError))); }, [id]);
  const message = async () => {
    try { const response = await api.post('/conversations', { userId: id }); navigate(`/messages/${response.data._id}`); }
    catch (requestError) { setError(errorMessage(requestError)); }
  };
  const report = async (event) => { event.preventDefault(); try { let evidenceImages = []; if (evidence.length) { const body = new FormData(); evidence.forEach((file) => body.append('images', file)); evidenceImages = (await api.post('/posts/upload', body)).data.images; } await api.post(`/users/${id}/reports`, { reasonCode, reason, evidenceImages }); setNotice('Đã gửi báo cáo đến quản trị viên.'); setShowReport(false); } catch (requestError) { setError(errorMessage(requestError)); } };
  if (error && !profile) return <div className="container py-5"><div className="alert alert-danger">{error}</div></div>;
  if (!profile) return <div className="container py-5 text-center">Đang tải...</div>;
  return <div className="container py-5 narrow"><div className="form-card text-center">
    <img className="avatar-lg mb-3" src={assetUrl(profile.avatar) || 'https://placehold.co/120x120?text=U'} alt="" />
    <h1 className="h3">{profile.name}</h1><p className="text-muted">{profile.role}</p>
    <div className="text-start border rounded p-3 mb-3"><p><b>Email:</b> {profile.email}</p><p className="mb-0"><b>Số điện thoại:</b> {profile.phone || 'Chưa cập nhật'}</p></div>
    {notice && <div className="alert alert-success">{notice}</div>}{error && <div className="alert alert-danger">{error}</div>}
    {user && user.id !== profile.id && <div className="d-flex justify-content-center gap-2"><button className="btn btn-primary" onClick={message}>Nhắn tin riêng</button><button className="btn btn-outline-danger" onClick={() => setShowReport(!showReport)}>Báo cáo người dùng</button></div>}
    {showReport && <form className="text-start border rounded p-3 mt-3" onSubmit={report}><label className="form-label">Lý do</label><select className="form-select mb-2" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}><option value="SPAM">Spam</option><option value="FRAUD">Có dấu hiệu gian lận</option><option value="HARASSMENT">Quấy rối hoặc ngôn từ không phù hợp</option><option value="IMPERSONATION">Giả mạo</option><option value="OTHER">Khác</option></select><textarea required minLength="5" className="form-control mb-2" placeholder="Mô tả cụ thể..." value={reason} onChange={(e) => setReason(e.target.value)} /><label className="form-label">Minh chứng, tối đa 10 ảnh</label><input type="file" multiple accept="image/jpeg,image/png,image/webp" className="form-control mb-3" onChange={(e) => setEvidence([...e.target.files].slice(0, 10))} /><button className="btn btn-danger">Gửi báo cáo</button></form>}
  </div></div>;
}
