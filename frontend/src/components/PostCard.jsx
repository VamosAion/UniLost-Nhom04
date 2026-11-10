/* Hiển thị tóm tắt bài đăng và liên kết tới chi tiết; dữ liệu bài được truyền qua props. */
import React from 'react';
import { Link } from 'react-router-dom';
import { assetUrl } from '../api.js';
export const statusText = { WAITING_HANDOVER: 'Đang chờ bàn giao', HANDED_TO_CTSV: 'Đã bàn giao cho phòng CTSV', HANDED_TO_LOSER: 'Đã bàn giao cho chủ sở hữu', CLOSED: 'Đã đóng', HIDDEN: 'Đã ẩn' };
const daysLeft = (date) => Math.max(0, Math.ceil((new Date(date) - Date.now()) / 86400000));

export default function PostCard({ post }) {
  const location = post.customLocation || post.location?.name || 'Chưa rõ';
  return <article className="card post-card h-100">
    <div className="post-image">{post.images?.[0] ? <img src={assetUrl(post.images[0])} alt="Ảnh tài sản" /> : <div className="image-placeholder">{post.type === 'LOST' ? '?' : '✓'}</div>}<span className={`type-pill ${post.type.toLowerCase()}`}>{post.type === 'LOST' ? 'Đồ bị mất' : 'Đồ nhặt được'}</span>{(['HANDED_TO_LOSER','CLOSED'].includes(post.status) || (post.isGuest && post.status === 'HANDED_TO_CTSV')) && <span className="completion-pill">✓ Đã hoàn tất</span>}</div>
    <div className="card-body d-flex flex-column">
      <div className="d-flex align-items-center gap-2 mb-2">
        {post.owner ? <Link className="user-link" to={`/users/${post.owner._id}`}><img className="avatar-sm" src={assetUrl(post.owner.avatar) || 'https://placehold.co/40x40?text=U'} alt="" /><span>{post.owner.name}</span></Link> : <span className="user-link"><span className="avatar-sm avatar-fallback">K</span><span>{post.guestName} · Khách</span></span>}
      </div>
      <div className="small text-muted mb-2">{post.category?.name || 'Chưa phân loại'} · {statusText[post.status]}</div>
      <h2 className="h5">{post.title}</h2><p className="text-muted clamp-2">{post.description}</p>
      <div className="small mt-auto"><div>📍 {location}</div><div>📅 {new Date(post.eventDate).toLocaleDateString('vi-VN')}</div>{post.isGuest && <div className="text-warning fw-semibold">⏳ Còn {daysLeft(post.expiresAt)} ngày</div>}</div>
      <Link className="btn btn-outline-primary btn-sm mt-3" to={`/posts/${post._id}`}>Xem chi tiết</Link>
    </div>
  </article>;
}
