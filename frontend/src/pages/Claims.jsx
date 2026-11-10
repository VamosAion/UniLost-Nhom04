/* Danh sách yêu cầu nhận/trả đồ và các thao tác cập nhật trạng thái theo quyền của người dùng. */
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, assetUrl, errorMessage } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Handovers from './Handovers.jsx';

const labels = {
  PENDING: 'Đang chờ',
  VERIFIED: 'Đã xác minh',
  REJECTED: 'Bị từ chối',
  CANCELLED: 'Đã hủy',
};

export default function Claims() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'mine');
  const selectedClaim = params.get('claim');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  const load = () => {
    if (tab === 'handovers') return Promise.resolve();
    const scope = ['ADMIN', 'STAFF'].includes(user.role) && tab === 'all' ? undefined : tab;
    return api.get('/claims', { params: { scope } })
      .then((response) => setItems(response.data))
      .catch((requestError) => setError(errorMessage(requestError)));
  };

  /* Đồng bộ dữ liệu định kỳ trong vòng đời component; chú ý hàm dọn timer khi component ngừng sử dụng. */
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [tab]);

  useEffect(() => {
    const requestedTab = params.get('tab');
    if (requestedTab && requestedTab !== tab) setTab(requestedTab);
  }, [params]);

  useEffect(() => {
    if (selectedClaim && items.length) document.getElementById(`claim-${selectedClaim}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [items, selectedClaim]);

  const update = async (id, status) => {
    try {
      const reviewNote = status === 'REJECTED'
        ? window.prompt('Lý do từ chối:') || 'Thông tin chưa phù hợp'
        : '';
      await api.patch(`/claims/${id}/status`, { status, reviewNote });
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  return (
    <div className="container py-5">
      <PageHeader title="Yêu cầu và bàn giao" description="Theo dõi yêu cầu đã gửi, yêu cầu đã nhận và lịch bàn giao." />
      <div className="nav nav-pills mb-4">
        <button className={`nav-link ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>Đã gửi</button>
        <button className={`nav-link ${tab === 'received' ? 'active' : ''}`} onClick={() => setTab('received')}>Đã nhận</button>
        <button className={`nav-link ${tab === 'handovers' ? 'active' : ''}`} onClick={() => setTab('handovers')}>Bàn giao</button>
        {['ADMIN', 'STAFF'].includes(user.role) && <button className={`nav-link ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>Tất cả</button>}
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {tab === 'handovers' ? <Handovers embedded /> : <div className="table-responsive">
        <table className="table align-middle">
          <thead><tr><th>Bài đăng</th><th>Người yêu cầu</th><th>Người đăng bài / tiếp nhận</th><th>Thông tin xác minh</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>{items.map((item) => (
            <tr id={`claim-${item._id}`} key={item._id} className={selectedClaim === item._id ? 'claim-highlight' : ''}>
              <td><Link to={`/posts/${item.post?._id}`}>{item.post?.title}</Link>{item.post?.status === 'HANDED_TO_CTSV' && <div className="small text-primary">Đang lưu tại phòng CTSV</div>}</td><td><b>{item.claimant?.name}</b><div className="small text-muted">{item.claimant?.email}</div></td><td><b>{item.post?.owner?.name||'Người đăng khách'}</b><div className="small text-muted">Tiếp nhận: {item.assignedTo?.name||'Qua link quản lý khách'}</div></td>
              <td className="proof-cell"><div>{item.proof}</div>{item.proofImages?.length > 0 && <div className="claim-proof-images">{item.proofImages.map((image) => <img src={assetUrl(image)} alt="Minh chứng yêu cầu" key={image} />)}</div>}</td>
              <td><span className="badge text-bg-light">{labels[item.status]}</span>{item.status === 'REJECTED' && item.reviewNote && <div className="small text-danger mt-1">Lý do: {item.reviewNote}</div>}</td>
              <td>
                {item.status === 'PENDING' && <div className="d-flex gap-1 flex-wrap">
                  {tab !== 'mine' && <><button className="btn btn-sm btn-success" onClick={() => update(item._id, 'VERIFIED')}>Xác minh</button><button className="btn btn-sm btn-outline-danger" onClick={() => update(item._id, 'REJECTED')}>Từ chối</button></>}
                  {tab === 'mine' && <button className="btn btn-sm btn-outline-secondary" onClick={() => update(item._id, 'CANCELLED')}>Hủy</button>}
                </div>}
                {item.status === 'VERIFIED' && item.post?.status === 'WAITING_HANDOVER' && <Link className="btn btn-sm btn-primary" to={`/posts/${item.post?._id}`}>Mở xác nhận bàn giao</Link>}
                {item.status === 'VERIFIED' && item.post?.status === 'HANDED_TO_CTSV' && ['ADMIN', 'STAFF'].includes(user.role) && <Link className="btn btn-sm btn-primary" to={`/posts/${item.post?._id}`}>Xác nhận đã trao đồ</Link>}
              </td>
            </tr>
          ))}</tbody>
        </table>
        {!items.length && <div className="empty-state">Chưa có yêu cầu.</div>}
      </div>}
    </div>
  );
}
