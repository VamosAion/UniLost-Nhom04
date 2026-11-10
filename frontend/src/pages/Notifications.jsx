/* Hiển thị thông báo, trạng thái đã đọc và điều hướng tới nội dung liên quan. */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';

export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  const load = () => api.get('/notifications')
    .then((response) => setItems(response.data))
    .catch((requestError) => setError(errorMessage(requestError)));

  /* Đồng bộ dữ liệu định kỳ trong vòng đời component; chú ý hàm dọn timer khi component ngừng sử dụng. */
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  const remove = async (item) => { try { await api.delete(`/notifications/${item._id}`); await load(); window.dispatchEvent(new Event('unilost:read')); } catch (requestError) { setError(errorMessage(requestError)); } };
  const removeAll = async () => { if (!window.confirm('Xóa tất cả thông báo đã xử lý?')) return; try { await api.delete('/notifications'); await load(); window.dispatchEvent(new Event('unilost:read')); } catch (requestError) { setError(errorMessage(requestError)); } };

  const read = async (item) => {
    try {
      await api.patch(`/notifications/${item._id}/read`);
      await load(); window.dispatchEvent(new Event('unilost:read'));
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const openItem = async (event, item) => {
    if (item.type === 'TRANSFER_PENDING') {
      event.preventDefault(); navigate(item.link); return;
    }
    if (!item.read) {
      event.preventDefault();
      try {
        await api.patch(`/notifications/${item._id}/read`);
        window.dispatchEvent(new Event('unilost:read'));
        navigate(item.link);
      } catch (requestError) { setError(errorMessage(requestError)); }
    }
  };

  const readAll = async () => {
    try {
      await api.patch('/notifications/read-all');
      await load(); window.dispatchEvent(new Event('unilost:read'));
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  return <div className="container py-5 narrow">
    <PageHeader title="Thông báo" action={<div className="d-flex gap-2 flex-wrap"><button className="btn btn-outline-danger" onClick={removeAll}>Xóa thông báo đã xử lý</button><button className="btn btn-outline-primary" onClick={readAll}>Đánh dấu đã đọc</button></div>} />
    {error && <div className="alert alert-danger">{error}</div>}
    <div className="list-group shadow-sm">
      {items.map((item) => <div className={`list-group-item p-3 ${item.read ? '' : 'unread'}`} key={item._id}><div className="notification-row">
        <div className="notification-content"><span className={item.read ? '' : 'notification-dot'} /><div><strong>{item.message}</strong><div className="small text-muted">{new Date(item.createdAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</div></div></div>
        <div className="notification-actions">{item.link && <Link className="btn btn-sm btn-outline-primary" to={item.link} onClick={(event) => openItem(event, item)}>Xem</Link>}{!item.read && item.type !== 'TRANSFER_PENDING' && <button className="btn btn-sm btn-light" onClick={() => read(item)}>Đã đọc</button>}{item.type !== 'TRANSFER_PENDING' && <button className="btn btn-sm btn-outline-danger" onClick={() => remove(item)}>Xóa</button>}</div>
      </div></div>)}
      {!items.length && <div className="list-group-item p-4 text-center text-muted">Chưa có thông báo.</div>}
    </div>
  </div>;
}
