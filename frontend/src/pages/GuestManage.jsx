/* Trang quản lý bài khách qua token riêng; token đóng vai trò liên kết truy cập để thao tác với bài tương ứng. */
import React, { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';

export default function GuestManage() {
  const { token } = useParams(); const location = useLocation();
  const [data, setData] = useState(null); const [error, setError] = useState(''); const [transfer, setTransfer] = useState(null);
  const load = () => api.get(`/guest/posts/${token}`).then((response) => setData(response.data)).catch((requestError) => setError(errorMessage(requestError)));
  /* Đồng bộ dữ liệu định kỳ trong vòng đời component; chú ý hàm dọn timer khi component ngừng sử dụng. */
  useEffect(() => { load(); const timer = setInterval(load, 5000); return () => clearInterval(timer); }, [token]);
  const review = async (claim, status) => { const reviewNote = status === 'REJECTED' ? window.prompt('Nhập lý do từ chối:') || '' : ''; try { await api.patch(`/guest/posts/${token}/claims/${claim._id}`, { status, reviewNote }); await load(); } catch (e) { setError(errorMessage(e)); } };
  const createTransfer = async (claim) => { try { setTransfer((await api.post(`/guest/posts/${token}/claims/${claim._id}/transfers`)).data); } catch (e) { setError(errorMessage(e)); } };
  if (!data) return <div className="container py-5">{error ? <div className="alert alert-danger">{error}</div> : 'Đang tải...'}</div>;
  return <div className="container py-5 narrow"><PageHeader title="Quản lý bài đăng khách" description="Đường dẫn này là bí mật. Không chia sẻ cho người không liên quan." />
    {location.state?.created && <div className="alert alert-success"><b>Đã gửi bài chờ Admin duyệt.</b><div>Mã quản lý dự phòng: <code>{location.state.managementCode}</code></div><div>Hãy lưu lại đường dẫn hiện tại để xử lý yêu cầu nhận đồ.</div></div>}
    {error && <div className="alert alert-danger">{error}</div>}
    <div className="form-card mb-4"><h2 className="h5">{data.post.title}</h2><div>Trạng thái duyệt: <b>{data.post.approvalStatus}</b></div><div>Trạng thái bài: <b>{data.post.status}</b></div>{data.post.approvalNote && <div>Ghi chú Admin: {data.post.approvalNote}</div>}{data.post.approvalStatus === 'APPROVED' && <Link to={`/posts/${data.post._id}`}>Mở bài đăng</Link>}</div>
    <h2 className="h4">Yêu cầu nhận đồ</h2>{data.claims.map((claim) => <div className="form-card mb-3" key={claim._id}><div className="d-flex justify-content-between"><b>{claim.claimant?.name}</b><span className="badge text-bg-light">{claim.status}</span></div><p>{claim.proof}</p>{claim.reviewNote && <p className="text-danger">Lý do: {claim.reviewNote}</p>}{claim.status === 'PENDING' && <div className="d-flex gap-2"><button className="btn btn-success" onClick={() => review(claim, 'VERIFIED')}>Chấp nhận</button><button className="btn btn-outline-danger" onClick={() => review(claim, 'REJECTED')}>Từ chối</button></div>}{claim.status === 'VERIFIED' && <button className="btn btn-primary" onClick={() => createTransfer(claim)}>Tạo mã bàn giao</button>}</div>)}
    {!data.claims.length && <div className="empty-state">Chưa có yêu cầu.</div>}{transfer && <div className="alert alert-primary"><h3 className="h5">Mã bàn giao</h3><div className="display-6 fw-bold">{transfer.token}</div><div>Mã hết hạn sau 10 phút. Người nhận đăng nhập và nhập mã để xác nhận.</div></div>}
  </div>;
}
