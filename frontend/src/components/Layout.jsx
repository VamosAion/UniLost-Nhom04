/* Khung giao diện chung: thanh điều hướng, nội dung trang con và footer. */
import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, assetUrl } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

const Badge = ({ count }) => count > 0 ? <span className="nav-unread" aria-label="Có nội dung chưa đọc"><span className="unread-dot" /></span> : null;
const BellIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>;
const MessageIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></svg>;

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState({ messages: 0, notifications: 0 });
  /* Cập nhật số nội dung chưa đọc để thanh điều hướng hiển thị dấu thông báo. */
  const refreshUnread = () => {
    if (!user) return;
    Promise.all([api.get('/messages/unread-count'), api.get('/notifications/unread-count')])
      .then(([messages, notifications]) => setUnread({ messages: messages.data.count, notifications: notifications.data.count }))
      .catch(() => {});
  };
  /* Đồng bộ dữ liệu định kỳ trong vòng đời component; chú ý hàm dọn timer khi component ngừng sử dụng. */
  useEffect(() => {
    refreshUnread();
    if (!user) return undefined;
    const timer = setInterval(refreshUnread, 5000);
    window.addEventListener('unilost:read', refreshUnread);
    return () => { clearInterval(timer); window.removeEventListener('unilost:read', refreshUnread); };
  }, [user?.id]);
  /* Xác nhận thao tác đăng xuất trước khi xóa phiên và chuyển trang. */
  const signOut = () => { if (!window.confirm('Bạn có chắc muốn đăng xuất khỏi UniLost?')) return; logout(); navigate('/'); };

  return <div className="app-shell"><nav className="navbar navbar-expand-lg navbar-dark sticky-top"><div className="container">
    <Link className="navbar-brand fw-bold" to="/"><span className="brand-mark">U</span> UniLost</Link>
    <button className="navbar-toggler" data-bs-toggle="collapse" data-bs-target="#nav"><span className="navbar-toggler-icon" /></button>
    <div id="nav" className="collapse navbar-collapse"><div className="navbar-nav me-auto">
      <NavLink className="nav-link" to="/">Khám phá</NavLink>
      {user && <><NavLink className="nav-link" to="/dashboard">Bài của tôi</NavLink><NavLink className="nav-link" to="/claims">Yêu cầu</NavLink></>}
      {['ADMIN', 'STAFF'].includes(user?.role) && <NavLink className="nav-link" to="/admin">Quản trị</NavLink>}
    </div><div className="d-flex gap-2 align-items-center">{user ? <>
      <Link className="btn btn-warning btn-sm" to="/posts/new">Đăng tin</Link>
      <Link className="nav-icon-button nav-with-badge" to="/messages" title="Tin nhắn" aria-label="Tin nhắn"><MessageIcon /><Badge count={unread.messages} /></Link>
      <Link className="nav-icon-button nav-with-badge" to="/notifications" title="Thông báo" aria-label="Thông báo"><BellIcon /><Badge count={unread.notifications} /></Link>
      <div className="dropdown"><button className="btn btn-light btn-sm dropdown-toggle d-inline-flex align-items-center gap-2" data-bs-toggle="dropdown"><img className="nav-avatar" src={assetUrl(user.avatar) || 'https://placehold.co/28x28?text=U'} alt="" />{user.name}</button><div className="dropdown-menu dropdown-menu-end"><Link className="dropdown-item" to="/profile">Hồ sơ</Link><Link className="dropdown-item" to="/change-password">Đổi mật khẩu</Link><button className="dropdown-item text-danger" onClick={signOut}>Đăng xuất</button></div></div>
    </> : <><Link className="btn btn-warning btn-sm" to="/posts/new">Đăng tin khách</Link><Link className="btn btn-outline-light btn-sm" to="/login">Đăng nhập</Link><Link className="btn btn-warning btn-sm" to="/register">Đăng ký</Link></>}</div></div>
  </div></nav><main><Outlet /></main>
    <footer className="footer site-footer mt-auto" aria-label="Thông tin dự án UniLost">
      <div className="container site-footer-grid">
        <section className="site-footer-column" aria-label="Nhóm thực hiện">
          <p>UniLost - Nhóm 04</p>
          <p>© 2026 UniLost - Nhóm 04</p>
        </section>
        <section className="site-footer-column" aria-label="Thông tin học phần">
          <p>Mẫu thiết kế phần mềm – 22DTH1</p>
          <p>Trường Đại Học Công Nghệ Đồng Nai - DNTU</p>
        </section>
        <section className="site-footer-column site-footer-contact" aria-label="Thông tin liên hệ">
          <p>Phòng một cửa</p>
          <p>0XX XXX XXXX - Nguyễn văn A</p>
          <p>0YY YYY YYYY - Nguyễn Thị B</p>
          <p>motcua@dntu.edu.vn</p>
          <p>hotrounilost@dntu.edu.vn</p>
        </section>
      </div>
    </footer>
  </div>;
}
