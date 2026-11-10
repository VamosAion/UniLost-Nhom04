/* Màn hình hội thoại và tin nhắn; các thao tác cụ thể được giới hạn bởi API và chính sách của phiên bản. */
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, assetUrl, errorMessage } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';

const EDIT_WINDOW_MS = 15 * 60 * 1000;

export default function Messages() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState('');
  const [files, setFiles] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const messageEnd = useRef(null);

  /* Tải danh sách hội thoại để cập nhật cột chọn cuộc trò chuyện. */
  const loadConversations = () => api.get('/conversations').then((response) => setConversations(response.data)).catch((requestError) => setError(errorMessage(requestError)));
  /* Tải tin nhắn của hội thoại đang chọn. */
  const loadMessages = () => id && api.get(`/conversations/${id}/messages`).then((response) => {
    setMessages(response.data);
    loadConversations();
    window.dispatchEvent(new Event('unilost:read'));
  }).catch((requestError) => setError(errorMessage(requestError)));

  useEffect(() => { loadConversations(); }, []);
  /* Đồng bộ dữ liệu định kỳ trong vòng đời component; chú ý hàm dọn timer khi component ngừng sử dụng. */
  useEffect(() => {
    setEditing(null);
    loadMessages();
    if (!id) return undefined;
    const timer = setInterval(loadMessages, 5000);
    return () => clearInterval(timer);
  }, [id]);
  useEffect(() => { messageEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, id]);

  /* Tải ảnh lên API trước khi dùng đường dẫn ảnh trong tin nhắn. */
  const uploadImages = async (selectedFiles) => {
    if (!selectedFiles.length) return [];
    const body = new FormData();
    selectedFiles.forEach((file) => body.append('images', file));
    return (await api.post('/posts/upload', body)).data.images;
  };

  const send = async (event) => {
    event.preventDefault();
    if (!content.trim() && !files.length) return;
    try {
      setError('');
      const images = await uploadImages(files);
      await api.post(`/conversations/${id}/messages`, { content, images });
      setContent(''); setFiles([]);
      await loadMessages(); await loadConversations();
      setTimeout(() => messageEnd.current?.scrollIntoView({ behavior: 'smooth' }), 0);
    } catch (requestError) { setError(errorMessage(requestError)); }
  };

  /* Đưa nội dung tin đã chọn vào trạng thái chỉnh sửa của giao diện. */
  const beginEdit = (message) => setEditing({ id: message._id, content: message.content || '', images: [...(message.images || [])], files: [] });
  /* Gửi thay đổi tin nhắn; backend kiểm tra lại quyền và thời hạn sửa. */
  const saveEdit = async () => {
    if (!editing) return;
    try {
      setError('');
      const addedImages = await uploadImages(editing.files);
      await api.patch(`/messages/${editing.id}`, { content: editing.content, images: [...editing.images, ...addedImages].slice(0, 5) });
      setEditing(null); await loadMessages();
    } catch (requestError) { setError(errorMessage(requestError)); }
  };

  const deleteMessage = async (message) => {
    if (!window.confirm('Xóa tin nhắn này chỉ ở phía bạn? Người còn lại vẫn thấy tin nhắn và bạn không thể khôi phục.')) return;
    try {
      setError(''); await api.delete(`/messages/${message._id}`);
      setMessages((current) => current.filter((item) => item._id !== message._id));
      await loadConversations();
    } catch (requestError) { setError(errorMessage(requestError)); }
  };

  /* Yêu cầu thu hồi tin nhắn theo chính sách backend. */
  const recallMessage = async (message) => {
    if (!window.confirm('Thu hồi tin nhắn này với tất cả mọi người? Nội dung và hình ảnh sẽ bị xóa và không thể khôi phục.')) return;
    try {
      setError(''); await api.patch(`/messages/${message._id}/recall`);
      if (editing?.id === message._id) setEditing(null);
      await loadMessages(); await loadConversations();
    } catch (requestError) { setError(errorMessage(requestError)); }
  };

  /* Gửi yêu cầu xóa lịch sử hội thoại theo phạm vi mà API hỗ trợ. */
  const clearConversation = async () => {
    if (!window.confirm('Xóa toàn bộ lịch sử trò chuyện này ở phía bạn? Người còn lại vẫn giữ lịch sử của họ.')) return;
    try {
      await api.delete(`/conversations/${id}`); setMessages([]); await loadConversations(); navigate('/messages');
    } catch (requestError) { setError(errorMessage(requestError)); }
  };

  const current = conversations.find((item) => item._id === id);
  const partner = (conversation) => conversation.participants.find((item) => item._id !== user.id);
  const canEdit = (message, mine) => mine && !message.recalledAt && !message.deletedAt && Date.now() - new Date(message.createdAt).getTime() <= EDIT_WINDOW_MS;
  const preview = (message) => {
    if (!message) return 'Bắt đầu trò chuyện';
    if (message.recalledAt || message.deletedAt) return 'Tin nhắn đã được thu hồi';
    return message.content || (message.images?.length ? 'Đã gửi hình ảnh' : 'Bắt đầu trò chuyện');
  };

  return <div className="container py-5">
    <PageHeader title="Tin nhắn riêng" description="Trao đổi riêng với thành viên để xác minh và thống nhất việc bàn giao." />
    {error && <div className="alert alert-danger">{error}</div>}
    <div className="row g-3">
      <div className="col-md-4"><div className="list-group">
        {conversations.map((conversation) => {
          const other = partner(conversation);
          return <Link key={conversation._id} to={`/messages/${conversation._id}`} className={`list-group-item list-group-item-action ${id === conversation._id ? 'active' : ''}`}>
            <div className="d-flex align-items-center gap-2"><span className="position-relative"><img className="avatar-sm" src={assetUrl(other?.avatar) || 'https://placehold.co/40x40?text=U'} alt="" />{conversation.unreadCount > 0 && <span className="conversation-dot" />}</span>
              <div className="flex-grow-1 overflow-hidden"><strong>{other?.name}</strong><div className="small text-truncate">{preview(conversation.lastMessage)}</div></div>
            </div>
          </Link>;
        })}
        {!conversations.length && <div className="list-group-item text-muted">Chưa có cuộc trò chuyện.</div>}
      </div></div>
      <div className="col-md-8"><div className="form-card message-panel">
        {!id ? <div className="text-center text-muted py-5">Chọn một cuộc trò chuyện.</div> : <>
          <div className="conversation-header">
            <h2 className="h5 mb-0"><Link to={`/users/${partner(current || { participants: [] })?._id}`}>{partner(current || { participants: [] })?.name || 'Cuộc trò chuyện'}</Link></h2>
            <button type="button" className="conversation-delete-button" onClick={clearConversation} title="Xóa toàn bộ lịch sử trò chuyện" aria-label="Xóa toàn bộ lịch sử trò chuyện">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 11H7.7L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" /></svg>
            </button>
          </div>
          <div className="message-list">{messages.map((message) => {
            const mine = message.sender?._id === user.id;
            const recalled = Boolean(message.recalledAt || message.deletedAt);
            return <div key={message._id} className={`message-row ${mine ? 'mine' : 'received'}`}>
              <div className={`message-bubble ${mine ? 'mine' : ''} ${recalled ? 'message-recalled' : ''}`}>
                <div><Link to={`/users/${message.sender?._id}`}><strong>{message.sender?.name}</strong></Link></div>
                {recalled ? <div className="recalled-message-text">Tin nhắn đã được thu hồi</div> : <>
                  {message.post && <Link className="message-post-reference" to={`/posts/${message.post._id}`}><span className={`badge ${message.post.type === 'LOST' ? 'text-bg-primary' : 'text-bg-success'}`}>{message.post.type === 'LOST' ? 'Đồ bị mất' : 'Đồ nhặt được'}</span><span>{message.post.title}</span><small>Nhấn để xem bài viết</small></Link>}
                  {message.content && <div className="message-content">{message.content}</div>}
                  {message.images?.length > 0 && <div className="message-images">{message.images.map((image) => <a href={assetUrl(image)} target="_blank" rel="noreferrer" key={image}><img src={assetUrl(image)} alt="Ảnh tin nhắn" /></a>)}</div>}
                </>}
                <small>{new Date(message.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}{message.editedAt && !recalled && ' · Đã sửa'}</small>
              </div>
              <div className="dropdown message-outside-menu"><button className="btn btn-link btn-sm message-menu-button" data-bs-toggle="dropdown" aria-label="Tùy chọn tin nhắn">•••</button><div className={`dropdown-menu ${mine ? 'dropdown-menu-end' : 'dropdown-menu-start'}`}>
                  {canEdit(message, mine) && <button className="dropdown-item" onClick={() => beginEdit(message)}>Sửa</button>}
                  <button className="dropdown-item text-danger" onClick={() => deleteMessage(message)}>Xóa ở phía tôi</button>
                  {mine && !recalled && <button className="dropdown-item text-warning" onClick={() => recallMessage(message)}>Thu hồi với mọi người</button>}
                </div>
              </div>
            </div>;
          })}<div ref={messageEnd} /></div>

          {editing && <div className="message-edit-box"><div className="d-flex justify-content-between align-items-center mb-2"><strong>Chỉnh sửa tin nhắn</strong><button type="button" className="btn-close" onClick={() => setEditing(null)} aria-label="Đóng" /></div>
            <textarea className="form-control" maxLength="2000" rows="3" value={editing.content} onChange={(event) => setEditing({ ...editing, content: event.target.value })} />
            <div className="message-edit-images mt-2">
              {editing.images.map((image) => <span key={image}><img src={assetUrl(image)} alt="Ảnh đang chỉnh sửa" /><button type="button" onClick={() => setEditing({ ...editing, images: editing.images.filter((item) => item !== image) })}>×</button></span>)}
              {editing.files.map((file, index) => <span key={`${file.name}-${index}`} className="message-new-file"><small>{file.name}</small><button type="button" onClick={() => setEditing({ ...editing, files: editing.files.filter((_, itemIndex) => itemIndex !== index) })}>×</button></span>)}
              {editing.images.length + editing.files.length < 5 && <label className="message-edit-add">+<input hidden type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => setEditing({ ...editing, files: [...editing.files, ...event.target.files].slice(0, 5 - editing.images.length) })} /></label>}
            </div>
            <div className="d-flex justify-content-end gap-2 mt-3"><button type="button" className="btn btn-outline-secondary" onClick={() => setEditing(null)}>Hủy</button><button type="button" className="btn btn-primary" onClick={saveEdit}>Lưu chỉnh sửa</button></div>
            <small className="text-muted">Tin nhắn chỉ được sửa trong vòng 15 phút sau khi gửi.</small>
          </div>}

          {files.length > 0 && <div className="composer-previews">{files.map((file, index) => <span key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={() => setFiles((currentFiles) => currentFiles.filter((_, itemIndex) => itemIndex !== index))}>×</button></span>)}</div>}
          <form className="d-flex gap-2 mt-3" onSubmit={send}><label className="btn btn-outline-secondary">📷<input hidden type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => setFiles([...event.target.files].slice(0, 5))} /></label><input className="form-control" maxLength="2000" placeholder="Nhập tin nhắn..." value={content} onChange={(event) => setContent(event.target.value)} /><button className="btn btn-primary">Gửi</button></form>
        </>}
      </div></div>
    </div>
  </div>;
}
