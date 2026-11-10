/* Trang khám phá bài đăng: tải dữ liệu, áp dụng bộ lọc và hiển thị danh sách kết quả. */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api.js';
import PostCard from '../components/PostCard.jsx';

export default function Home() {
  const [posts, setPosts] = useState([]);
  const [meta, setMeta] = useState({ categories: [], locations: [] });
  const [filters, setFilters] = useState({ keyword: '', type: '', category: '', location: '', status: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = () => {
    setLoading(true);
    api.get('/posts', { params: filters }).then((response) => setPosts(response.data.items)).catch((requestError) => setError(errorMessage(requestError))).finally(() => setLoading(false));
  };
  useEffect(() => { Promise.all([api.get('/metadata/categories'), api.get('/metadata/locations')]).then(([categories, locations]) => setMeta({ categories: categories.data, locations: locations.data })); }, []);
  /* Trì hoãn tải khi bộ lọc thay đổi để tránh gửi yêu cầu ở từng lần gõ; hủy lần chờ cũ trước lần mới. */
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [filters]);

  return <><section className="hero"><div className="container hero-inner"><div className="row align-items-center g-4"><div className="col-lg-7"><span className="eyebrow">Cộng đồng DNTU hỗ trợ nhau</span><h1>Tìm lại đồ thất lạc dễ dàng và an toàn</h1><p>Đăng tin có cấu trúc, tìm bài tương đồng, xác minh chủ sở hữu và quản lý bàn giao ngay trên một hệ thống.</p><div className="d-flex gap-2 flex-wrap"><Link className="btn btn-primary btn-lg" to="/posts/new?type=LOST">Tôi bị mất đồ</Link><Link className="btn btn-success btn-lg" to="/posts/new?type=FOUND">Tôi nhặt được đồ</Link></div></div><div className="col-lg-5"><div className="hero-card"><strong>Quy trình 4 bước</strong><ol><li>Đăng thông tin tài sản</li><li>Tìm và đối chiếu bài phù hợp</li><li>Xác minh chủ sở hữu</li><li>Bàn giao và xác nhận</li></ol></div></div></div></div></section>
    <section className="container py-5">
      <div className="filter-panel"><div className="row g-3"><div className="col-lg-3"><label className="form-label">Từ khóa</label><input className="form-control" placeholder="Ví, điện thoại, chìa khóa..." value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} /></div><div className="col-md-4 col-lg"><label className="form-label">Loại bài</label><select className="form-select" value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">Tất cả</option><option value="LOST">Đồ bị mất</option><option value="FOUND">Đồ nhặt được</option></select></div><div className="col-md-4 col-lg-2"><label className="form-label">Danh mục</label><select className="form-select" value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}><option value="">Tất cả</option>{meta.categories.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></div><div className="col-md-4 col-lg-2"><label className="form-label">Địa điểm</label><select className="form-select" value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })}><option value="">Tất cả</option>{meta.locations.filter((item) => item.name !== 'Địa điểm khác').map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}<option value="OTHER">Địa điểm khác</option></select></div><div className="col-md-4 col-lg-3"><label className="form-label">Trạng thái</label><select className="form-select" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Tất cả</option><option value="WAITING_HANDOVER">Đang chờ bàn giao</option><option value="HANDED_TO_CTSV">Đã bàn giao cho phòng CTSV</option><option value="HANDED_TO_LOSER">Đã bàn giao cho chủ sở hữu</option></select></div></div></div>
      <div className="d-flex justify-content-between align-items-center my-4"><h2 className="h3 mb-0">Bài đăng mới nhất</h2><span className="text-muted">{posts.length} kết quả</span></div>
      {error && <div className="alert alert-danger">{error}</div>}{loading ? <div className="text-center py-5">Đang tải...</div> : <div className="row g-4">{posts.map((post) => <div className="col-md-6 col-xl-4" key={post._id}><PostCard post={post} /></div>)}{!posts.length && <div className="empty-state">Không tìm thấy bài đăng phù hợp.</div>}</div>}
    </section></>;
}
