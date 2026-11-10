/* Thu thập thông tin bài đăng, xử lý ảnh và gửi dữ liệu tạo/cập nhật tới backend. */
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, assetUrl, errorMessage } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';

const empty = { type: 'LOST', title: '', description: '', category: '', location: '', customLocation: '', eventDate: '', colors: '', secretDetail: '', contactNote: '', images: [], guestName: '', guestPhone: '', guestEmail: '', guestHandling: 'KEEP', guestCtsvMethod: 'SELF_DROP' };
const dateValue = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const latestDate = dateValue(new Date());
const earliest = new Date(); earliest.setFullYear(earliest.getFullYear() - 2);
const earliestDate = dateValue(earliest);

export default function PostForm() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [meta, setMeta] = useState({ categories: [], locations: [] });
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/metadata/categories'), api.get('/metadata/locations')]).then(([categories, locations]) => setMeta({ categories: categories.data, locations: locations.data }));
    if (id) api.get(`/posts/${id}`).then((response) => {
      const post = response.data;
      setForm({ ...post, eventDate: post.eventDate.slice(0, 10), category: post.category._id, location: post.location._id, colors: post.colors.join(', ') });
      if (post.customLocation) setForm((current) => ({ ...current, location: 'OTHER' }));
    });
  }, [id]);

  const change = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const removeExistingImage = (image) => setForm((current)=>({...current,images:(current.images||[]).filter((item)=>item!==image)}));
  const removeNewImage = (index) => setFiles((current)=>current.filter((_,itemIndex)=>itemIndex!==index));
  const imageCount=(form.images?.length||0)+files.length;
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      let images = form.images || [];
      if (files.length) {
        const body = new FormData();
        files.forEach((file) => body.append('images', file));
        images = [...images, ...(await api.post('/posts/upload', body)).data.images].slice(0, 5);
      }
      const other = meta.locations.find((item) => item.name === 'Địa điểm khác');
      const payload = {
        ...form,
        location: form.location === 'OTHER' ? other?._id : form.location,
        customLocation: form.location === 'OTHER' ? form.customLocation : '',
        images,
        colors: form.colors.split(',').map((item) => item.trim()).filter(Boolean),
      };
      const response = id ? await api.patch(`/posts/${id}`, payload) : await api.post('/posts', payload);
      if (response.data.pendingApproval) {
        if (response.data.managementToken) {
          const saved = JSON.parse(localStorage.getItem('unilost_guest_posts') || '[]');
          localStorage.setItem('unilost_guest_posts', JSON.stringify([{ token: response.data.managementToken, title: form.title, code: response.data.managementCode }, ...saved.filter((item) => item.token !== response.data.managementToken)].slice(0, 20)));
          navigate(`/guest/manage/${response.data.managementToken}`, { state: { managementCode: response.data.managementCode, created: true } });
        } else navigate('/');
      } else navigate(`/posts/${response.data._id}`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  return <div className="container py-5 narrow">
    <PageHeader title={id ? 'Chỉnh sửa bài đăng' : user ? 'Tạo bài đăng mới' : 'Đăng tin với tư cách khách'} description={user ? 'Cung cấp thông tin rõ ràng, nhưng không công khai chi tiết bí mật dùng để xác minh.' : 'Bài khách tồn tại trong 7 ngày và bắt buộc có số điện thoại liên hệ.'} />
    {error && <div className="alert alert-danger">{error}</div>}
    <form className="form-card" onSubmit={submit}><div className="row g-3">
      {!user && <><div className="col-md-6"><label className="form-label">Họ tên người đăng</label><input required name="guestName" className="form-control" value={form.guestName} onChange={change} /></div><div className="col-md-6"><label className="form-label">Số điện thoại liên hệ</label><input required inputMode="numeric" pattern="(032|033|034|035|036|037|038|039|081|082|083|084|085|088|070|076|077|078|079|052|056|058|059|099|093)[0-9]{7}" title="Nhập đủ 10 số với đầu số được hỗ trợ" name="guestPhone" className="form-control" placeholder="Nhập đủ 10 chữ số" value={form.guestPhone} onChange={(event) => setForm({ ...form, guestPhone: event.target.value })} /></div><div className="col-12"><label className="form-label">Email nhận thông báo</label><input required={form.type === 'FOUND'} type="email" name="guestEmail" className="form-control" placeholder="example@gmail.com" value={form.guestEmail} onChange={change} /></div></>}
      <div className="col-md-6"><label className="form-label">Loại bài</label><select name="type" className="form-select" value={form.type} onChange={change}><option value="LOST">Tôi bị mất đồ</option><option value="FOUND">Tôi nhặt được đồ</option></select></div>
      {!user && form.type === 'FOUND' && <div className="col-12"><div className="alert alert-info mb-0"><h2 className="h6">Bạn muốn xử lý đồ nhặt được thế nào?</h2><p className="small">Ưu tiên bàn giao cho phòng CTSV để tài sản được lưu giữ an toàn. Nếu giữ đồ và đăng bài, bạn phải cung cấp thông tin liên hệ để xử lý yêu cầu qua trang quản lý bí mật.</p><div className="row g-2"><div className="col-md-6"><label className="form-label">Lựa chọn</label><select className="form-select" name="guestHandling" value={form.guestHandling} onChange={change}><option value="KEEP">Tôi giữ đồ và tiếp tục đăng bài</option><option value="CTSV">Bàn giao cho phòng CTSV</option></select></div>{form.guestHandling === 'CTSV' && <div className="col-md-6"><label className="form-label">Cách bàn giao</label><select className="form-select" name="guestCtsvMethod" value={form.guestCtsvMethod} onChange={change}><option value="SELF_DROP">Tôi tự mang đến phòng CTSV</option><option value="ADMIN_PICKUP">Nhờ Admin liên hệ để nhận đồ</option></select></div>}</div></div></div>}
      <div className="col-md-6"><label className="form-label">Ngày xảy ra</label><input required type="date" name="eventDate" min={earliestDate} max={latestDate} className="form-control" value={form.eventDate} onChange={change} /><div className="form-text">Chỉ chọn trong 2 năm gần đây đến hôm nay.</div></div>
      <div className="col-12"><label className="form-label">Tiêu đề</label><input required maxLength="150" name="title" className="form-control" value={form.title} onChange={change} /></div>
      <div className="col-md-6"><label className="form-label">Danh mục</label><select required name="category" className="form-select" value={form.category} onChange={change}><option value="">Chọn danh mục</option>{meta.categories.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}</select></div>
      <div className="col-md-6"><label className="form-label">Địa điểm</label><select required name="location" className="form-select" value={form.location} onChange={change}><option value="">Chọn địa điểm</option>{meta.locations.filter((item) => item.name !== 'Địa điểm khác').map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}<option value="OTHER">Khác</option></select></div>
      {form.location === 'OTHER' && <div className="col-12"><label className="form-label">Địa điểm cụ thể</label><input required maxLength="200" name="customLocation" className="form-control" placeholder="Ví dụ: hành lang tầng 2 gần phòng A205" value={form.customLocation} onChange={change} /><div className="form-text">Bài này sẽ được xếp vào bộ lọc “Địa điểm khác”.</div></div>}
      <div className="col-12"><label className="form-label">Mô tả công khai</label><textarea required rows="5" maxLength="2000" name="description" className="form-control" value={form.description} onChange={change} /></div>
      <div className="col-md-6"><label className="form-label">Màu sắc</label><input name="colors" className="form-control" placeholder="đen, xanh" value={form.colors} onChange={change} /></div>
      <div className="col-12"><label className="form-label">Ảnh, tối đa 5 ảnh</label><div className="image-editor-grid">{(form.images||[]).map((image)=><div className="image-editor-item" key={image}><img src={assetUrl(image)} alt="Ảnh bài đăng"/><button type="button" aria-label="Xóa ảnh" onClick={()=>removeExistingImage(image)}>×</button></div>)}{files.map((file,index)=><div className="image-editor-item" key={`${file.name}-${index}`}><img src={URL.createObjectURL(file)} alt="Ảnh mới"/><button type="button" aria-label="Xóa ảnh" onClick={()=>removeNewImage(index)}>×</button></div>)}{imageCount<5&&<label className="image-add-tile"><span>＋</span><small>Thêm ảnh</small><input hidden type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event)=>setFiles((current)=>[...current,...event.target.files].slice(0,5-(form.images?.length||0)))}/></label>}</div><div className="form-text">Có thể xóa ảnh cũ rồi chọn ảnh mới để thay thế. Còn {5-imageCount} vị trí.</div></div>
      <div className="col-12"><label className="form-label">Chi tiết bí mật để xác minh</label><textarea name="secretDetail" className="form-control" value={form.secretDetail || ''} onChange={change} placeholder="Ví dụ: ký hiệu bên trong, nội dung màn hình khóa..." /></div>
      <div className="col-12"><label className="form-label">Ghi chú liên hệ</label><input name="contactNote" className="form-control" value={form.contactNote || ''} onChange={change} /></div>
    </div><div className="d-flex gap-2 justify-content-end mt-4"><button type="button" className="btn btn-outline-secondary" onClick={() => navigate(-1)}>Hủy</button><button disabled={busy} className="btn btn-primary">{busy ? 'Đang lưu...' : 'Lưu bài đăng'}</button></div></form>
  </div>;
}
