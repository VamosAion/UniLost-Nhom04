/* Tập hợp thông tin chi tiết và các thao tác liên quan đến một bài đăng; backend quyết định quyền thực hiện. */
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, assetUrl, errorMessage } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import PostCard, { statusText } from '../components/PostCard.jsx';
import TransferFlow from '../components/TransferFlow.jsx';

export default function PostDetail() {
  const { id } = useParams(); const { user, refresh } = useAuth(); const navigate = useNavigate();
  const [post, setPost] = useState(null); const [matches, setMatches] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [comments, setComments] = useState([]); const [commentsEnabled, setCommentsEnabled] = useState(true); const [commentsHidden, setCommentsHidden] = useState(false);
  const [comment, setComment] = useState(''); const [replyTo, setReplyTo] = useState(null); const [anonymous, setAnonymous] = useState(false); const [commentError, setCommentError] = useState(''); const commentInput = useRef(null);
  const [commentFiles,setCommentFiles]=useState([]); const [mentionItems,setMentionItems]=useState([]);
  const [proof, setProof] = useState(''); const [proofFiles, setProofFiles] = useState([]);
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const [pendingClaims, setPendingClaims] = useState(0);
  const load = () => api.get(`/posts/${id}`).then(async (response) => {
    setPost(response.data);
    const mayReview = response.data.owner?._id === user?.id || ['ADMIN', 'STAFF'].includes(user?.role);
    if (mayReview) {
      try { setPendingClaims((await api.get(`/posts/${id}/claim-summary`)).data.pending); } catch { setPendingClaims(0); }
    }
    setError((current) => current === 'Không thể kết nối máy chủ' ? '' : current);
  }).catch((requestError) => setError(errorMessage(requestError)));
  /* Tải bình luận của bài để cập nhật phần thảo luận. */
  const loadComments = () => api.get(`/posts/${id}/comments`).then((response) => { setComments(response.data.items); setCommentsEnabled(response.data.enabled); setCommentsHidden(Boolean(response.data.hidden)); });
  /* Tải lịch sử bàn giao liên quan tới bài đang xem. */
  const loadTransfers = () => user && api.get(`/posts/${id}/transfers`).then((response) => setTransfers(response.data)).catch(() => setTransfers([]));
  useEffect(() => { load(); loadComments(); loadTransfers(); setMatches([]); }, [id, user?.id]);
  /* Đồng bộ dữ liệu định kỳ trong vòng đời component; chú ý hàm dọn timer khi component ngừng sử dụng. */
  useEffect(() => {
    const timer = setInterval(() => { load(); loadTransfers(); }, 5000);
    return () => clearInterval(timer);
  }, [id, user?.id, user?.role]);

  const claim = async () => {
    try {
      let proofImages = [];
      if (proofFiles.length) { const body = new FormData(); proofFiles.forEach((file) => body.append('images', file)); proofImages = (await api.post('/posts/upload', body)).data.images; }
      await api.post(`/posts/${id}/claims`, { proof, proofImages }); setMessage('Đã gửi yêu cầu kèm minh chứng.'); setProof(''); setProofFiles([]);
    } catch (requestError) { setError(errorMessage(requestError)); }
  };
  const report = async () => { const reason = window.prompt('Nhập lý do báo cáo bài đăng:'); if (reason) try { await api.post(`/posts/${id}/reports`, { reason }); setMessage('Đã gửi báo cáo.'); } catch (requestError) { setError(errorMessage(requestError)); } };
  /* Yêu cầu backend tìm bài tương đồng với bài đang xem. */
  const findMatches = () => api.get(`/posts/${id}/matches`).then((response) => setMatches(response.data)).catch((requestError) => setError(errorMessage(requestError)));
  const deletePost = async () => { if (window.confirm('Xóa vĩnh viễn bài đăng này?')) try { await api.delete(`/posts/${id}`); navigate('/'); } catch (requestError) { setError(errorMessage(requestError)); } };
  /* Gửi xác nhận chủ bài đã tự tìm lại được đồ. */
  const selfFound = async () => { if (!window.confirm('Xác nhận bạn đã tự tìm lại được đồ bị mất?')) return; try { await api.patch(`/posts/${id}/self-found`); setMessage('Đã xác nhận bạn tự tìm lại được đồ bị mất.'); await load(); } catch (requestError) { setError(errorMessage(requestError)); } };
  const toggleComments = async () => { try { await api.patch(`/posts/${id}/comments`, { enabled: !commentsEnabled }); setCommentsEnabled(!commentsEnabled); } catch (requestError) { setError(errorMessage(requestError)); } };
  const toggleCommentsHidden = async () => { try { await api.patch(`/posts/${id}/comments-hidden`, { hidden: !commentsHidden }); setCommentsHidden(!commentsHidden); await loadComments(); } catch (requestError) { setError(errorMessage(requestError)); } };
  const toggleCommentNotifications=async()=>{try{const response=await api.patch(`/posts/${id}/comment-notifications`,{enabled:post.commentNotificationsEnabled===false});setPost({...post,commentNotificationsEnabled:response.data.enabled});}catch(e){setError(errorMessage(e));}};
  /* Mở hoặc tạo hội thoại để liên hệ người đăng bài. */
  const startMessage = async () => { try { const response = await api.post('/conversations', { userId: post.owner._id, postId: post._id }); navigate(`/messages/${response.data._id}`); } catch (requestError) { setError(errorMessage(requestError)); } };
  /* Mở hội thoại với quản trị viên từ ngữ cảnh bài viết. */
  const startAdminMessage = async () => { try { const response = await api.post('/conversations/admin', { postId: post._id }); navigate(`/messages/${response.data._id}`); } catch (requestError) { setError(errorMessage(requestError)); } };
  const sendComment = async (event) => { event.preventDefault(); if (!comment.trim()&&!commentFiles.length) return; setCommentError(''); try { let images=[];if(commentFiles.length){const body=new FormData();commentFiles.forEach(file=>body.append('images',file));images=(await api.post('/posts/upload',body)).data.images;} await api.post(`/posts/${id}/comments`, { content: comment,images, parent: replyTo?._id, isAnonymous: anonymous }); setComment('');setCommentFiles([]); setReplyTo(null); setAnonymous(false); await loadComments(); } catch (requestError) { setCommentError(errorMessage(requestError)); } };
  /* Ghi nhận bình luận đang trả lời để ô soạn gửi đúng quan hệ cha/con. */
  const chooseReply = (item) => { setReplyTo(item);setComment((current)=>current||`@${item.author?.studentId||item.author?.name||'Ẩn danh'} `); setCommentError(''); setTimeout(() => { commentInput.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); commentInput.current?.focus(); }, 0); };
  const changeComment=async(value)=>{setComment(value);if(commentError)setCommentError('');const match=value.match(/@([^\s@]{1,40})$/);if(!match)return setMentionItems([]);try{setMentionItems((await api.get('/mention-users',{params:{q:match[1]}})).data);}catch{setMentionItems([]);}};
  const pickMention=(person)=>{setComment((value)=>value.replace(/@[^\s@]*$/,`@${person.studentId} `));setMentionItems([]);commentInput.current?.focus();};
  /* Cập nhật lựa chọn ẩn danh cho phần bình luận. */
  const setAnonymousMode=async(checked)=>{if(checked&&!user.anonymousAlias){const alias=window.prompt('Tạo biệt danh dùng khi ẩn danh (2–40 ký tự):');if(!alias)return;try{await api.patch('/auth/me',{anonymousAlias:alias});await refresh();}catch(e){setCommentError(errorMessage(e));return;}}setAnonymous(checked);};
  const editComment = async (item) => { const content = window.prompt('Sửa bình luận:', item.content); if (!content || content === item.content) return; try { await api.patch(`/comments/${item._id}`, { content }); await loadComments(); } catch (e) { setError(errorMessage(e)); } };
  const deleteComment = async (item) => { if (!window.confirm('Xóa bình luận này?')) return; try { await api.delete(`/comments/${item._id}`); await loadComments(); } catch (e) { setError(errorMessage(e)); } };
  const reportComment = async (item) => { const reason = window.prompt('Lý do báo cáo bình luận:'); if (!reason) return; try { await api.post(`/comments/${item._id}/reports`, { reason, reasonCode: 'OTHER' }); setMessage('Đã gửi báo cáo bình luận.'); } catch (e) { setError(errorMessage(e)); } };
  const requestGuestCompletion = async () => { if (!window.confirm('Gửi yêu cầu để phòng CTSV kiểm tra và đánh dấu bài đã hoàn tất?')) return; try { const response = await api.post(`/posts/${id}/guest-completion-request`); setMessage(response.data.message); } catch (e) { setError(errorMessage(e)); } };
  const reviewGuestCompletion=async(action)=>{const note=action==='REJECT'?(window.prompt('Lý do từ chối xác nhận:')||'Chưa đủ căn cứ'):'';try{const response=await api.patch(`/posts/${id}/guest-completion`,{action,note});setMessage(response.data.message);await load();}catch(e){setError(errorMessage(e));}};
  const renderContent=(value)=>String(value||'').split(/(@\d{10})/g).map((part,index)=>/^@\d{10}$/.test(part)?<span className="comment-mention" key={`${part}-${index}`}>{part}</span>:part);

  if (error && !post) return <div className="container py-5"><div className="alert alert-danger">{error}</div></div>;
  if (!post) return <div className="container py-5 text-center">Đang tải...</div>;
  const mine = post.owner?._id === user?.id; const isAdmin = ['ADMIN', 'STAFF'].includes(user?.role); const location = post.customLocation || post.location?.name;
  const roots = comments.filter((item) => !item.parent);
  /* Chuyển các câu trả lời thành danh sách để giao diện hiển thị theo cấu trúc mong muốn. */
  const flattenReplies = (parent) => [parent, ...comments.filter((item) => String(item.parent?._id || item.parent || '') === parent._id).flatMap(flattenReplies)];
  const orderedComments = roots.flatMap(flattenReplies);

  return <div className="container py-5"><div className="row g-5">
    <div className="col-lg-7"><div className="gallery">{post.images?.length ? post.images.map((image, index) => <img key={image} src={assetUrl(image)} alt={`Ảnh tài sản ${index + 1}`} />) : <div className="image-placeholder large">{post.type === 'LOST' ? '?' : '✓'}</div>}</div></div>
    <div className="col-lg-5"><div className="d-flex gap-2 mb-3"><span className={`type-pill static ${post.type.toLowerCase()}`}>{post.type === 'LOST' ? 'Đồ bị mất' : 'Đồ nhặt được'}</span><span className="badge text-bg-light">{statusText[post.status]}</span></div>
      <h1>{post.title}</h1>{post.owner ? <Link className="user-link mb-3" to={`/users/${post.owner._id}`}><img className="avatar-sm" src={assetUrl(post.owner.avatar) || 'https://placehold.co/40x40?text=U'} alt="" /><span>Đăng bởi {post.owner.name}</span></Link> : <div className="note mb-3"><b>Người đăng khách:</b> {post.guestName}<br /><b>Điện thoại:</b> {post.guestPhone}</div>}
      <dl className="detail-list"><dt>Danh mục</dt><dd>{post.category?.name}</dd><dt>Địa điểm</dt><dd>{location}</dd><dt>Ngày</dt><dd>{new Date(post.eventDate).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</dd><dt>Màu sắc</dt><dd>{post.colors?.join(', ') || 'Không rõ'}</dd></dl>
      <p className="description">{post.description}</p>{message && <div className="alert alert-success">{message}</div>}{error && <div className="alert alert-danger">{error}</div>}
      {pendingClaims > 0 && <div className="alert alert-warning d-flex justify-content-between align-items-center gap-2"><span>Có <b>{pendingClaims}</b> yêu cầu trao đổi tài sản đang chờ xử lý.</span><Link className="btn btn-sm btn-primary" to="/claims?tab=received">Xem yêu cầu</Link></div>}
      {isAdmin && <div className="owner-tools mb-3"><Link className="btn btn-primary owner-edit" to={`/posts/${id}/edit`}>Chỉnh sửa</Link><button className="btn btn-outline-secondary owner-comments" onClick={toggleComments}>{commentsEnabled ? 'Tắt bình luận' : 'Bật bình luận'}</button><button className="btn btn-danger owner-delete" onClick={deletePost}>Xóa bài đăng</button><button className="btn btn-outline-secondary owner-hide" onClick={toggleCommentsHidden}>{commentsHidden ? 'Hiện toàn bộ bình luận' : 'Ẩn toàn bộ bình luận'}</button></div>}
      {mine&&!isAdmin&&<Link className="btn btn-outline-primary w-100 mb-3" to={`/posts/${id}/edit`}>Chỉnh sửa bài đăng và hình ảnh</Link>}
      {mine && post.type === 'LOST' && post.status === 'WAITING_HANDOVER' && <button className="btn btn-success w-100 mb-3 mt-2" onClick={selfFound}>Đã tìm lại được đồ bị mất</button>}
      {mine&&<button className="btn btn-outline-primary w-100 mb-3" onClick={toggleCommentNotifications}>{post.commentNotificationsEnabled===false?'Bật thông báo bình luận':'Tắt thông báo bình luận'}</button>}
      {user && (post.owner || (post.isGuest && post.type === 'LOST')) && post.status !== 'HANDED_TO_LOSER' && <TransferFlow post={post} onDone={() => { load(); loadTransfers(); }} />}
      {!mine && user && post.owner && !isAdmin && ['WAITING_HANDOVER','HANDED_TO_CTSV'].includes(post.status) && <div className="claim-box"><button className="btn btn-outline-primary mb-3" onClick={post.status === 'HANDED_TO_CTSV' ? startAdminMessage : startMessage}>{post.status === 'HANDED_TO_CTSV' ? 'Liên hệ phòng CTSV' : 'Nhắn tin người đăng'}</button><label className="form-label fw-bold">{post.status === 'HANDED_TO_CTSV' ? 'Thông tin chứng minh bạn là chủ sở hữu (gửi cho Admin)' : post.type === 'LOST' ? 'Thông tin chứng minh bạn đã nhặt được đồ' : 'Thông tin chứng minh bạn là chủ sở hữu'}</label><textarea className="form-control mb-2" rows="3" value={proof} onChange={(event) => setProof(event.target.value)} /><input type="file" multiple accept="image/jpeg,image/png,image/webp" className="form-control mb-3" onChange={(event) => setProofFiles([...event.target.files].slice(0, 3))} /><div className="action-grid"><button className="btn btn-primary" disabled={proof.length < 5} onClick={claim}>{post.status === 'HANDED_TO_CTSV' ? 'Gửi yêu cầu nhận đồ tới Admin' : post.type === 'LOST' ? 'Gửi yêu cầu trả lại đồ' : 'Gửi yêu cầu nhận đồ'}</button><button className="btn btn-outline-danger" onClick={report}>Báo cáo bài đăng</button></div></div>}
      {!mine && user && !isAdmin && post.status === 'HANDED_TO_LOSER' && <div className="claim-box"><p>Tài sản đã được bàn giao cho chủ sở hữu nên không thể gửi thêm yêu cầu.</p><button className="btn btn-primary w-100" onClick={startAdminMessage}>Liên hệ Admin</button></div>}
      {user && !isAdmin && post.isGuest && post.status === 'WAITING_HANDOVER' && <button className="btn btn-outline-success w-100 mb-3" onClick={requestGuestCompletion}>Yêu cầu Admin xác nhận đã hoàn tất trao trả</button>}
      {isAdmin&&post.isGuest&&post.status==='WAITING_HANDOVER'&&post.guestCompletionRequestedAt&&<div className="status-confirm-box"><b>Khách/người nhận báo đã hoàn tất trao trả</b><p className="small text-muted">Admin/Staff kiểm tra tình trạng và đưa ra quyết định.</p><div className="d-flex gap-2"><button className="btn btn-success" onClick={()=>reviewGuestCompletion('CONFIRM')}>Xác nhận đã hoàn tất</button><button className="btn btn-outline-danger" onClick={()=>reviewGuestCompletion('REJECT')}>Từ chối</button></div></div>}
      {(mine || isAdmin) && post.statusChangedAt && <div className="small text-muted mt-3">Cập nhật bàn giao lúc {new Date(post.statusChangedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</div>}
    </div>
  </div>

  <section className="mt-5 comment-section"><div className="d-flex justify-content-between align-items-center mb-3"><h2 className="h3 mb-0">Bình luận</h2>{(!commentsEnabled || commentsHidden) && <span className="text-muted">{commentsHidden ? 'Bình luận đang bị ẩn' : 'Đã tắt bình luận'}</span>}</div>
    <div className="comment-list">{orderedComments.map((item) => { const author = item.author || {}; const isMine = author._id === user?.id||author.realId===user?.id; return <article className={`comment-thread-item ${item.parent ? 'comment-reply' : ''}`} key={item._id}><img className="avatar-sm comment-avatar" src={assetUrl(author.avatar) || `https://placehold.co/40x40?text=${author.anonymous?'A':'U'}`} alt="" /><div className="comment-body"><div className="comment-bubble">{author._id ? <Link className="comment-author" to={`/users/${author._id}`}>{author.name}</Link> : <span className="comment-author">{author.name}{author.realName&&<small className="anonymous-real-name"> — {author.realName}</small>}</span>}<p>{renderContent(item.content)}</p>{item.images?.length>0&&<div className="comment-images">{item.images.map(image=><a href={assetUrl(image)} target="_blank" rel="noreferrer" key={image}><img src={assetUrl(image)} alt="Ảnh bình luận"/></a>)}</div>}</div><div className="comment-actions"><span>{new Date(item.createdAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}{item.editedAt && ' · Đã sửa'}</span>{user && commentsEnabled && <button type="button" onClick={() => chooseReply(item)}>Trả lời</button>}{user && <div className="dropdown d-inline-block"><button type="button" className="comment-more" data-bs-toggle="dropdown" aria-label="Tùy chọn bình luận">•••</button><div className="dropdown-menu">{isMine && <button className="dropdown-item" onClick={() => editComment(item)}>Sửa</button>}{(isMine || isAdmin) && <button className="dropdown-item text-danger" onClick={() => deleteComment(item)}>Xóa</button>}{!isMine && <button className="dropdown-item" onClick={() => reportComment(item)}>Báo cáo</button>}</div></div>}</div></div></article>; })}{!orderedComments.length && <div className="text-muted py-3">Chưa có bình luận. Hãy là người đầu tiên bình luận.</div>}</div>
    {user && commentsEnabled ? <form className="comment-composer" onSubmit={sendComment}>{replyTo && <div className="replying-to">Đang trả lời <b>{replyTo.author?.name || 'Ẩn danh'}</b><button type="button" onClick={() => setReplyTo(null)}>Hủy</button></div>}<div className="comment-input-row"><img className="avatar-sm" src={assetUrl(user.avatar) || 'https://placehold.co/40x40?text=U'} alt="" /><div className="comment-input-wrap mention-anchor"><input ref={commentInput} className={`form-control ${commentError ? 'is-invalid' : ''}`} maxLength="1000" placeholder="Viết bình luận hoặc nhập @mã sinh viên..." value={comment} onChange={(event) => changeComment(event.target.value)} />{mentionItems.length>0&&<div className="mention-menu">{mentionItems.map(person=><button type="button" key={person._id} onClick={()=>pickMention(person)}><img src={assetUrl(person.avatar)||'https://placehold.co/32x32?text=U'} alt=""/><span><b>{person.name}</b><small>{person.studentId}</small></span></button>)}</div>}<button className="btn btn-primary">Gửi</button>{commentError && <div className="comment-error">{commentError}</div>}</div></div>{commentFiles.length>0&&<div className="composer-previews">{commentFiles.map((file,index)=><span key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={()=>setCommentFiles(files=>files.filter((_,i)=>i!==index))}>×</button></span>)}</div>}<div className="comment-composer-options"><label className="btn btn-sm btn-outline-secondary">📷 Thêm ảnh<input hidden type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={event=>setCommentFiles([...event.target.files].slice(0,5))}/></label><label className="form-check comment-anonymous"><input className="form-check-input" type="checkbox" checked={anonymous} onChange={(event) => setAnonymousMode(event.target.checked)} /><span className="form-check-label">{user.anonymousAlias?`Bình luận với danh tính ${user.anonymousAlias}`:'Bình luận ẩn danh'}</span></label></div></form> : null}
  </section>
  {transfers.length > 0 && <section className="mt-5"><h2 className="h3">Lịch sử xác nhận bàn giao</h2><div className="row g-3">{transfers.map((item) => <div className="col-md-6" key={item._id}><div className="form-card"><div><b>{item.targetStatus === 'HANDED_TO_CTSV' ? 'Bàn giao cho phòng CTSV' : 'Bàn giao cho chủ sở hữu'}</b></div><div>Người tạo xác nhận: {item.initiator?.name}</div><div>Người xác nhận QR: {item.confirmedBy?.name}</div><div>Thời gian: {new Date(item.confirmedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</div></div></div>)}</div></section>}
  {matches.length > 0 && <section className="mt-5"><h2 className="h3">Bài đăng có khả năng trùng khớp</h2><div className="row g-3">{matches.map((item) => <div className="col-md-4" key={item.post._id}><div className="match-score">Khớp {item.score}%</div><PostCard post={item.post} /></div>)}</div></section>}
  </div>;
}
