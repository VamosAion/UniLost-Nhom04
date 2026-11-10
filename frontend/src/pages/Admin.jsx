/* Màn hình quản trị: tải dữ liệu và gọi API cho các thao tác quản lý được hỗ trợ trong phiên bản này. */
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';
import { statusText } from '../components/PostCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Admin() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  /* Xác định vai trò có quyền quản lý theo quy tắc của phiên bản. */
  const isModerator = ['ADMIN', 'STAFF'].includes(user?.role);
  const canManageAccounts = user?.email?.toLowerCase() === 'admin@dntu.edu.vn' && user?.role === 'ADMIN';
  const [tab, setTab] = useState(searchParams.get('tab') === 'guest-posts' ? 'guestPosts' : 'overview');
  const [stats, setStats] = useState({});
  const [users, setUsers] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [catalogType, setCatalogType] = useState('categories');
  const [posts, setPosts] = useState([]);
  const [selectedPosts, setSelectedPosts] = useState([]);
  const [postMeta, setPostMeta] = useState({ categories: [], locations: [] });
  const [postFilters, setPostFilters] = useState({ keyword: '', owner: '', type: '', category: '', location: '', status: '', approvalStatus: 'APPROVED' });
  const [reports, setReports] = useState([]);
  const [reportStatus, setReportStatus] = useState('PENDING');
  const [guestPosts, setGuestPosts] = useState([]);
  const [selectedGuestPosts, setSelectedGuestPosts] = useState([]);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      setStats((await api.get('/admin/stats')).data);
      if (tab === 'users' && isModerator) setUsers((await api.get('/admin/users')).data);
      if (tab === 'catalog' && isModerator) {
        setCatalog((await api.get(`/admin/catalog/${catalogType}`)).data);
      }
      if (tab === 'posts' && isModerator) {
        const [postResponse, categories, locations] = await Promise.all([
          api.get('/admin/posts', { params: postFilters }),
          api.get('/metadata/categories'),
          api.get('/metadata/locations'),
        ]);
        setPosts(postResponse.data);
        setPostMeta({ categories: categories.data, locations: locations.data });
        setSelectedPosts((current) => current.filter((id) => postResponse.data.some((post) => post._id === id)));
      }
      if (tab === 'reports' && isModerator) setReports((await api.get('/admin/reports', { params: { status: reportStatus } })).data);
      if (tab === 'guestPosts' && isModerator) {
        const response = await api.get('/admin/posts', { params: { approvalStatus: 'PENDING' } });
        setGuestPosts(response.data.filter((post) => post.isGuest));
        setSelectedGuestPosts((current) => current.filter((id) => response.data.some((post) => post._id === id)));
      }
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  /* Đồng bộ dữ liệu định kỳ trong vòng đời component; chú ý hàm dọn timer khi component ngừng sử dụng. */
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [tab, catalogType, isModerator, postFilters, reportStatus]);

  useEffect(() => {
    if (searchParams.get('tab') === 'guest-posts') setTab('guestPosts');
  }, [searchParams]);

  const togglePost = (id) => setSelectedPosts((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleAllPosts = () => setSelectedPosts(selectedPosts.length === posts.length ? [] : posts.map((post) => post._id));
  const bulkDeletePosts = async () => {
    if (!selectedPosts.length || !window.confirm(`Bạn có chắc muốn xóa vĩnh viễn ${selectedPosts.length} bài viết đã chọn?`)) return;
    try {
      const response = await api.post('/admin/posts/bulk-delete', { ids: selectedPosts });
      setSelectedPosts([]);
      await load();
      window.alert(response.data.message);
    } catch (requestError) { setError(errorMessage(requestError)); }
  };
  const bulkModeratePosts = async (action) => {
    const eligible = guestPosts.filter((post) => selectedGuestPosts.includes(post._id)).map((post) => post._id);
    if (!eligible.length) return setError('Hãy chọn ít nhất một bài khách đang chờ duyệt.');
    const verb = action === 'APPROVE' ? 'duyệt' : 'từ chối';
    if (!window.confirm(`Bạn có chắc muốn ${verb} ${eligible.length} bài khách đã chọn?`)) return;
    try {
      await api.patch('/admin/posts/bulk-moderate', { ids: eligible, action });
      setSelectedGuestPosts([]); await load(); window.dispatchEvent(new Event('unilost:read'));
    } catch (requestError) { setError(errorMessage(requestError)); }
  };
  const resolveReport = async (report, action) => {
    const resolution = window.prompt(action === 'DISMISS' ? 'Lý do bỏ qua báo cáo:' : 'Ghi chú xử lý báo cáo:', 'Đã kiểm tra nội dung báo cáo');
    if (resolution === null) return;
    try { await api.patch(`/admin/reports/${report._id}`, { action, resolution }); await load(); }
    catch (requestError) { setError(errorMessage(requestError)); }
  };
  const deleteReportedPost = async (report) => {
    if (!report.post || !window.confirm('Xóa vĩnh viễn bài viết bị báo cáo này?')) return;
    try { await api.delete(`/posts/${report.post._id}`); await load(); }
    catch (requestError) { setError(errorMessage(requestError)); }
  };

  const updateUser = async (selectedUser, field, value) => {
    try {
      await api.patch(`/admin/users/${selectedUser.id}`, { [field]: value });
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };
  const deleteUser = async (selectedUser) => {
    if (!window.confirm(`Xóa tài khoản ${selectedUser.email} và toàn bộ dữ liệu liên quan?`)) return;
    try { await api.delete(`/admin/users/${selectedUser.id}`); await load(); }
    catch (requestError) { setError(errorMessage(requestError)); }
  };

  const addCatalog = async () => {
    const name = window.prompt('Nhập tên mới:');
    if (!name?.trim()) return;
    try {
      await api.post(`/admin/catalog/${catalogType}`, { name: name.trim() });
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const saveCatalog = async (item, update) => {
    try {
      await api.patch(`/admin/catalog/${catalogType}/${item._id}`, {
        name: item.name,
        description: item.description || '',
        building: item.building || '',
        active: item.active,
        ...update,
      });
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const editCatalog = (item) => {
    const name = window.prompt('Cập nhật tên:', item.name);
    if (name?.trim()) saveCatalog(item, { name: name.trim() });
  };

  const statsLabels = {
    users: 'Tổng tài khoản', activeUsers: 'Đang hoạt động', openPosts: 'Bài đang mở',
    lostPosts: 'Bài mất đồ', foundPosts: 'Bài nhặt được', returned: 'Đã hoàn trả',
    pendingClaims: 'Yêu cầu chờ',
    pendingGuestPosts: 'Bài khách chờ duyệt', pendingReports: 'Báo cáo chờ xử lý',
  };

  return (
    <div className="container py-5">
      <PageHeader title="Trung tâm quản trị" description="Theo dõi hoạt động, quản lý tài khoản và dữ liệu dùng chung." />

      <div className="nav nav-pills mb-4">
        <button className={`nav-link ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Tổng quan</button>
        {isModerator && <button className={`nav-link ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>Tài khoản</button>}
        {isModerator && <button className={`nav-link ${tab === 'catalog' ? 'active' : ''}`} onClick={() => setTab('catalog')}>Danh mục</button>}
        {isModerator && <button className={`nav-link ${tab === 'posts' ? 'active' : ''}`} onClick={() => setTab('posts')}>Bài viết</button>}
        {isModerator && <button className={`nav-link ${tab === 'guestPosts' ? 'active' : ''}`} onClick={() => setTab('guestPosts')}>Bài khách chờ duyệt</button>}
        {isModerator && <button className={`nav-link ${tab === 'reports' ? 'active' : ''}`} onClick={() => setTab('reports')}>Nội dung bị báo cáo</button>}
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {tab === 'overview' && <div className="row g-3">{Object.entries(statsLabels).map(([key, label]) => (
        <div className="col-6 col-md-3" key={key}><div className="stat-card"><span>{label}</span><strong>{stats[key] ?? 0}</strong></div></div>
      ))}</div>}

      {tab === 'users' && isModerator && <div className="table-responsive"><table className="table align-middle">
        <thead><tr><th>Người dùng</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th>{canManageAccounts && <th>Thao tác</th>}</tr></thead>
        <tbody>{users.map((listedUser) => <tr key={listedUser.id}>
          <td>{listedUser.name}</td><td>{listedUser.email}</td>
          <td>{listedUser.email?.toLowerCase() === 'admin@dntu.edu.vn' ? <span className="badge text-bg-primary">ADMIN</span> : <select disabled={!canManageAccounts} className="form-select form-select-sm" value={listedUser.role} onChange={(event) => updateUser(listedUser, 'role', event.target.value)}><option value="USER">USER</option><option value="STAFF">STAFF</option><option value="ADMIN">ADMIN</option></select>}</td>
          <td>{listedUser.email?.toLowerCase() === 'admin@dntu.edu.vn' ? <span className="badge text-bg-success">ACTIVE</span> : <select disabled={!canManageAccounts} className="form-select form-select-sm" value={listedUser.status} onChange={(event) => updateUser(listedUser, 'status', event.target.value)}><option>ACTIVE</option><option>LOCKED</option></select>}</td>
          {canManageAccounts && <td>{listedUser.email?.toLowerCase() !== 'admin@dntu.edu.vn' && <button className="btn btn-sm btn-outline-danger" onClick={() => deleteUser(listedUser)}>Xóa tài khoản</button>}</td>}
        </tr>)}</tbody>
      </table></div>}

      {tab === 'catalog' && isModerator && <>
        <div className="d-flex gap-2 mb-3"><select className="form-select w-auto" value={catalogType} onChange={(event) => setCatalogType(event.target.value)}><option value="categories">Danh mục tài sản</option><option value="locations">Địa điểm</option></select><button className="btn btn-primary" onClick={addCatalog}>Thêm mới</button></div>
        <div className="row g-3">{catalog.map((item) => <div className="col-md-6" key={item._id}><div className="form-card d-flex justify-content-between align-items-center gap-3">
          <div><strong>{item.name}</strong><div className="small text-muted">{item.building || item.description || 'Không có mô tả'}</div></div>
          <div className="d-flex gap-2 align-items-center"><span className={`badge ${item.active ? 'text-bg-success' : 'text-bg-secondary'}`}>{item.active ? 'Đang dùng' : 'Đã tắt'}</span><button className="btn btn-sm btn-outline-primary" onClick={() => editCatalog(item)}>Sửa</button><button className="btn btn-sm btn-outline-secondary" onClick={() => saveCatalog(item, { active: !item.active })}>{item.active ? 'Tắt' : 'Bật'}</button></div>
        </div></div>)}</div>
      </>}

      {tab === 'posts' && isModerator && <>
        <div className="filter-panel mb-4"><div className="row g-3">
          <div className="col-md-4"><label className="form-label">Từ khóa bài viết</label><input className="form-control" placeholder="Tiêu đề hoặc nội dung" value={postFilters.keyword} onChange={(event) => setPostFilters({ ...postFilters, keyword: event.target.value })} /></div>
          <div className="col-md-4"><label className="form-label">Người đăng</label><input className="form-control" placeholder="Họ tên hoặc email" value={postFilters.owner} onChange={(event) => setPostFilters({ ...postFilters, owner: event.target.value })} /></div>
          <div className="col-md-4"><label className="form-label">Loại bài</label><select className="form-select" value={postFilters.type} onChange={(event) => setPostFilters({ ...postFilters, type: event.target.value })}><option value="">Tất cả</option><option value="LOST">Đồ bị mất</option><option value="FOUND">Đồ nhặt được</option></select></div>
          <div className="col-md-4"><label className="form-label">Danh mục</label><select className="form-select" value={postFilters.category} onChange={(event) => setPostFilters({ ...postFilters, category: event.target.value })}><option value="">Tất cả</option>{postMeta.categories.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></div>
          <div className="col-md-4"><label className="form-label">Địa điểm</label><select className="form-select" value={postFilters.location} onChange={(event) => setPostFilters({ ...postFilters, location: event.target.value })}><option value="">Tất cả</option>{postMeta.locations.filter((item) => item.name !== 'Địa điểm khác').map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}<option value="OTHER">Địa điểm khác</option></select></div>
          <div className="col-md-4"><label className="form-label">Trạng thái</label><select className="form-select" value={postFilters.status} onChange={(event) => setPostFilters({ ...postFilters, status: event.target.value })}><option value="">Tất cả</option><option value="WAITING_HANDOVER">Đang chờ bàn giao</option><option value="HANDED_TO_CTSV">Đã bàn giao cho phòng CTSV</option><option value="HANDED_TO_LOSER">Đã bàn giao cho chủ sở hữu</option><option value="CLOSED">Đã đóng</option><option value="HIDDEN">Đã ẩn</option></select></div>
        </div></div>
        <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap"><span className="text-muted">Có {posts.length} bài viết · Đã chọn {selectedPosts.length}</span><button className="btn btn-danger" disabled={!selectedPosts.length} onClick={bulkDeletePosts}>Xóa các bài đã chọn</button></div>
        <div className="table-responsive"><table className="table align-middle admin-post-table">
          <thead><tr><th><input className="form-check-input" type="checkbox" checked={posts.length > 0 && selectedPosts.length === posts.length} onChange={toggleAllPosts} aria-label="Chọn tất cả bài viết" /></th><th>Bài viết</th><th>Người đăng</th><th>Danh mục</th><th>Địa điểm</th><th>Trạng thái</th><th>Ngày đăng</th></tr></thead>
          <tbody>{posts.map((post) => <tr key={post._id}><td><input className="form-check-input" type="checkbox" checked={selectedPosts.includes(post._id)} onChange={() => togglePost(post._id)} aria-label={`Chọn ${post.title}`} /></td><td><Link to={`/posts/${post._id}`}>{post.title}</Link><div className="small text-muted">{post.type === 'LOST' ? 'Đồ bị mất' : 'Đồ nhặt được'}</div></td><td>{post.owner?.name || post.guestName || 'Khách'}<div className="small text-muted">{post.owner?.email || post.guestPhone || ''}</div></td><td>{post.category?.name || '—'}</td><td>{post.customLocation || post.location?.name || '—'}</td><td><span className="badge text-bg-light">{statusText[post.status] || post.status}</span></td><td>{new Date(post.createdAt).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</td></tr>)}</tbody>
        </table>{!posts.length && <div className="empty-state">Không tìm thấy bài viết phù hợp.</div>}</div>
      </>}

      {tab === 'guestPosts' && isModerator && <>
        <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap"><div><h2 className="h4 mb-1">Bài khách chờ duyệt</h2><span className="text-muted">Có {guestPosts.length} bài đang chờ · Đã chọn {selectedGuestPosts.length}</span></div><div className="d-flex gap-2"><button className="btn btn-success" disabled={!selectedGuestPosts.length} onClick={() => bulkModeratePosts('APPROVE')}>Duyệt đã chọn</button><button className="btn btn-outline-danger" disabled={!selectedGuestPosts.length} onClick={() => bulkModeratePosts('REJECT')}>Từ chối đã chọn</button></div></div>
        <div className="table-responsive"><table className="table align-middle"><thead><tr><th><input className="form-check-input" type="checkbox" checked={guestPosts.length > 0 && selectedGuestPosts.length === guestPosts.length} onChange={() => setSelectedGuestPosts(selectedGuestPosts.length === guestPosts.length ? [] : guestPosts.map((post) => post._id))} /></th><th>Bài viết</th><th>Người đăng khách</th><th>Danh mục</th><th>Địa điểm</th><th>Ngày gửi</th></tr></thead><tbody>{guestPosts.map((post) => <tr key={post._id}><td><input className="form-check-input" type="checkbox" checked={selectedGuestPosts.includes(post._id)} onChange={() => setSelectedGuestPosts((current) => current.includes(post._id) ? current.filter((id) => id !== post._id) : [...current, post._id])} /></td><td><Link to={`/posts/${post._id}`}>{post.title}</Link><div className="small text-muted">{post.type === 'LOST' ? 'Đồ bị mất' : 'Đồ nhặt được'}</div></td><td>{post.guestName}<div className="small text-muted">{post.guestPhone}</div></td><td>{post.category?.name || '—'}</td><td>{post.customLocation || post.location?.name || '—'}</td><td>{new Date(post.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</td></tr>)}</tbody></table>{!guestPosts.length && <div className="empty-state">Không có bài đăng khách đang chờ duyệt.</div>}</div>
      </>}

      {tab === 'reports' && isModerator && <>
        <div className="report-filter-box mb-4"><label className="form-label mb-0 fw-semibold">Trạng thái xử lý</label><select className="form-select" value={reportStatus} onChange={(event) => setReportStatus(event.target.value)}><option value="PENDING">Chờ xử lý</option><option value="RESOLVED">Đã xử lý</option><option value="REJECTED">Đã bỏ qua</option><option value="">Tất cả</option></select></div>
        <div className="row g-3">{reports.map((report) => { const target = report.targetType === 'USER' ? report.user?.name : report.targetType === 'COMMENT' ? `Bình luận: ${report.comment?.content || 'đã xóa'}` : report.post?.title || 'Bài viết đã bị xóa'; const guestPost=report.targetType==='POST'&&report.post?.isGuest; const userReport=report.targetType==='USER'; return <div className="col-lg-6" key={report._id}><div className="form-card h-100"><div className="d-flex justify-content-between gap-2"><h2 className="h5">{report.post ? <Link to={`/posts/${report.post._id}`}>{target}</Link> : target}</h2><span className="badge text-bg-light">{report.status === 'PENDING' ? 'Chờ xử lý' : report.status === 'RESOLVED' ? 'Đã xử lý' : 'Đã bỏ qua'}</span></div><p className="small text-uppercase text-muted">{report.targetType}{guestPost?' · BÀI KHÁCH':''}</p><p className="mb-2"><b>Lý do báo cáo:</b> {report.reason}</p><div className="small text-muted mb-3">Người báo cáo: {report.reporter?.name || 'Không xác định'} · {report.reporter?.email || ''}</div>{report.resolution && <div className="alert alert-light py-2">Kết quả: {report.resolution}</div>}{report.status === 'PENDING' && <div className="d-flex gap-2 flex-wrap">{!guestPost&&<button className="btn btn-primary" onClick={() => resolveReport(report, 'WARN')}>Cảnh cáo tài khoản (+1)</button>}<button className="btn btn-outline-secondary" onClick={() => resolveReport(report, 'DISMISS')}>Bỏ qua</button>{!userReport&&<button className="btn btn-danger" onClick={() => resolveReport(report, 'DELETE_CONTENT')}>{guestPost?'Xóa bài':'Xóa nội dung (+2 cảnh cáo)'}</button>}</div>}</div></div>; })}{!reports.length && <div className="empty-state">Không có nội dung bị báo cáo trong trạng thái này.</div>}</div>
      </>}
    </div>
  );
}
