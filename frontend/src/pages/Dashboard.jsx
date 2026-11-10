/* Quản lý các bài thuộc người dùng hiện tại và thao tác theo trạng thái của từng bài. */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';
import PostCard from '../components/PostCard.jsx';

export default function Dashboard() {
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState('');

  const load = () => api.get('/posts', { params: { owner: 'me', limit: 50 } })
    .then((response) => setPosts(response.data.items))
    .catch((requestError) => setError(errorMessage(requestError)));

  useEffect(() => {
    load();
  }, []);

  const close = async (id) => {
    try {
      await api.patch(`/posts/${id}/status`, { status: 'CLOSED' });
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };
  const toggleNotifications=async(post)=>{try{await api.patch(`/posts/${post._id}/comment-notifications`,{enabled:post.commentNotificationsEnabled===false});await load();}catch(requestError){setError(errorMessage(requestError));}};

  return <div className="container py-5">
    <PageHeader title="Bài đăng của tôi" description="Theo dõi trạng thái, chỉnh sửa và tìm bài tương đồng." action={<Link className="btn btn-primary" to="/posts/new">Tạo bài đăng</Link>} />
    {error && <div className="alert alert-danger">{error}</div>}
    <div className="row g-4">
      {posts.map((post) => <div className="col-md-6 col-xl-4" key={post._id}><PostCard post={post} /><div className="d-flex gap-2 flex-wrap mt-2">{post.status === 'WAITING_HANDOVER' && <button className="btn btn-sm btn-outline-secondary" onClick={() => close(post._id)}>Đóng bài</button>}<button className="btn btn-sm btn-outline-primary" onClick={()=>toggleNotifications(post)}>{post.commentNotificationsEnabled===false?'Bật thông báo bình luận':'Tắt thông báo bình luận'}</button></div></div>)}
      {!posts.length && <div className="empty-state">Bạn chưa có bài đăng nào.</div>}
    </div>
  </div>;
}
