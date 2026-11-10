/* API tương tác: hồ sơ công khai, bình luận, hội thoại và tin nhắn theo phạm vi của phiên bản. */
import { Router } from 'express';
import mongoose from 'mongoose';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Comment, Conversation, Message, Notification, Post, User } from '../models.js';
import { auth, optionalAuth } from '../auth.js';
import { clean, notify, publicUser, validId, hasProhibitedLanguage, isModerator } from '../utils.js';
import { canEditMessage, messageIsRecalled, serializeMessage } from '../messagePolicy.js';
const router = Router();

/* Tìm tin nhắn trong phạm vi hội thoại mà người dùng có quyền tham gia. */
async function findMessageForParticipant(messageId, userId) {
  if (!validId(messageId)) return null;
  const message = await Message.findById(messageId);
  if (!message) return null;
  const conversation = await Conversation.findOne({ _id: message.conversation, participants: userId });
  return conversation ? message : null;
}

/* Chỉ dọn tệp ảnh khi không còn dữ liệu khác tham chiếu đến ảnh đó. */
async function removeUnusedMessageImages(imagePaths, currentMessageId) {
  await Promise.all(imagePaths.filter((value) => /^\/uploads\/[\w.-]+$/.test(value)).map(async (imagePath) => {
    const usedElsewhere = await Promise.all([
      Message.exists({ _id: { $ne: currentMessageId }, images: imagePath }),
      Post.exists({ images: imagePath }),
      Comment.exists({ images: imagePath }),
    ]);
    if (usedElsewhere.some(Boolean)) return;
    try { await fs.unlink(path.resolve('uploads', path.basename(imagePath))); }
    catch (error) { if (error.code !== 'ENOENT') console.error('Không thể xóa ảnh tin nhắn:', error); }
  }));
}

async function ensureAdminConversation(userId) {
  const admin = await User.findOne({ role: 'ADMIN', status: 'ACTIVE' });
  if (!admin || String(admin.id) === String(userId)) return null;
  let conversation = await Conversation.findOne({ participants: { $all: [userId, admin.id], $size: 2 } });
  if (!conversation) conversation = await Conversation.create({ participants: [userId, admin.id] });
  return conversation;
}

/* GET /users/:id: Đọc tài khoản/hồ sơ. */
router.get('/users/:id', optionalAuth, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'ID không hợp lệ' });
  const user = await User.findById(req.params.id);
  if (!user || user.status !== 'ACTIVE') return res.status(404).json({ message: 'Không tìm thấy người dùng' });
  res.json(publicUser(user));
});

const serializeComment=(item,viewer)=>{const result=item.toObject();if(result.isAnonymous){const real=result.author;const self=String(real?._id||real)===viewer?.sub;result.author={_id:null,name:result.anonymousAlias||'Ẩn danh',avatar:'',anonymous:true,...(self?{realId:real?._id||real}:{}),...(isModerator(viewer?.role)?{realName:real?.name||'',realId:real?._id||real}:{})};}return result;};

/* GET /mention-users: Đọc tài khoản/hồ sơ. Middleware auth xác thực người gọi trước handler. */
router.get('/mention-users', auth, async(req,res)=>{
  const q=clean(req.query.q).replace(/^@/,'');if(q.length<1)return res.json([]);
  const escaped=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const items=await User.find({status:'ACTIVE',$or:[{studentId:new RegExp(`^${escaped}`,'i')},{name:new RegExp(escaped,'i')}]}).select('name studentId avatar').limit(8);
  res.json(items);
});

/* GET /posts/:id/comments: Đọc bình luận. */
router.get('/posts/:id/comments', optionalAuth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Không tìm thấy bài đăng' });
  const moderator=isModerator(req.user?.role);
  if(post.commentsHidden&&!moderator)return res.json({enabled:post.commentsEnabled,hidden:true,items:[]});
  const items=await Comment.find({post:req.params.id,...(moderator?{}:{hidden:false})}).populate('author','name avatar studentId').sort({createdAt:1});
  res.json({ enabled: post.commentsEnabled, hidden:post.commentsHidden, items:items.map(item=>serializeComment(item,req.user)) });
});

/* POST /posts/:id/comments: Xử lý yêu cầu tạo/gửi bình luận. Middleware auth xác thực người gọi trước handler. */
router.post('/posts/:id/comments', auth, async (req, res) => {
  const content = clean(req.body.content);
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Không tìm thấy bài đăng' });
  if (!post.commentsEnabled) return res.status(403).json({ message: 'Chủ bài đăng đã tắt bình luận' });
  const images=Array.isArray(req.body.images)?req.body.images.slice(0,5):[];
  if (!content&&!images.length) return res.status(400).json({ message: 'Vui lòng nhập nội dung hoặc chọn ảnh' });
  if (content&&hasProhibitedLanguage(content)) return res.status(400).json({ message: 'Bình luận chứa ngôn từ không phù hợp' });
  let parent = null;
  if (req.body.parent) parent = await Comment.findOne({ _id: req.body.parent, post: post.id });
  const author=await User.findById(req.user.sub);
  if(req.body.isAnonymous&&!author?.anonymousAlias)return res.status(409).json({message:'Bạn cần tạo biệt danh ẩn danh trước khi bình luận'});
  const comment = await Comment.create({ post: post.id, author: req.user.sub, parent: parent?.id || null, content, images, isAnonymous:Boolean(req.body.isAnonymous),anonymousAlias:req.body.isAnonymous?author.anonymousAlias:'' });
  if (post.owner && post.commentNotificationsEnabled !== false && String(post.owner) !== req.user.sub) await notify(post.owner, 'COMMENT', 'Có bình luận mới trên bài đăng của bạn', `/posts/${post.id}`);
  if (parent && String(parent.author) !== req.user.sub && String(parent.author) !== String(post.owner)) await notify(parent.author, 'COMMENT_REPLY', 'Có người trả lời bình luận của bạn', `/posts/${post.id}`);
  const mentionedIds=[...new Set([...content.matchAll(/@(\d{10})(?!\d)/g)].map(match=>match[1]))];
  if(mentionedIds.length){const users=await User.find({studentId:{$in:mentionedIds},_id:{$ne:req.user.sub},status:'ACTIVE'}).select('_id');await Promise.all(users.map(user=>notify(user.id,'COMMENT_MENTION','Bạn được nhắc đến trong một bình luận',`/posts/${post.id}`)));}
  await comment.populate('author','name avatar studentId');
  res.status(201).json(serializeComment(comment,req.user));
});

/* PATCH /comments/:id: Cập nhật bình luận. Middleware auth xác thực người gọi trước handler. */
router.patch('/comments/:id', auth, async(req,res)=>{
  const comment=await Comment.findById(req.params.id);if(!comment)return res.status(404).json({message:'Không tìm thấy bình luận'});
  if(String(comment.author)!==req.user.sub)return res.status(403).json({message:'Bạn chỉ được sửa bình luận của mình'});
  const content=clean(req.body.content);if(!content||hasProhibitedLanguage(content))return res.status(400).json({message:'Nội dung bình luận không hợp lệ'});
  comment.content=content.slice(0,1000);comment.editedAt=new Date();await comment.save();res.json(comment);
});

/* DELETE /comments/:id: Xử lý yêu cầu xóa bình luận. Middleware auth xác thực người gọi trước handler. */
router.delete('/comments/:id', auth, async(req,res)=>{
  const comment=await Comment.findById(req.params.id);if(!comment)return res.status(404).json({message:'Không tìm thấy bình luận'});
  if(String(comment.author)!==req.user.sub&&!isModerator(req.user.role))return res.status(403).json({message:'Bạn không có quyền xóa bình luận'});
  await Comment.deleteMany({$or:[{_id:comment.id},{parent:comment.id}]});res.json({message:'Đã xóa bình luận'});
});

/* POST /users/:id/reports: Xử lý yêu cầu tạo/gửi báo cáo vi phạm. Middleware auth xác thực người gọi trước handler. */
router.post('/users/:id/reports', auth, async(req,res)=>{
  const {Report}=await import('../models.js');if(!validId(req.params.id)||req.params.id===req.user.sub)return res.status(400).json({message:'Người dùng không hợp lệ'});
  if(!await User.exists({_id:req.params.id}))return res.status(404).json({message:'Không tìm thấy người dùng'});
  const reason=clean(req.body.reason);if(reason.length<5)return res.status(400).json({message:'Vui lòng nhập lý do báo cáo'});
  res.status(201).json(await Report.create({targetType:'USER',user:req.params.id,reporter:req.user.sub,reasonCode:clean(req.body.reasonCode)||'OTHER',reason,evidenceImages:Array.isArray(req.body.evidenceImages)?req.body.evidenceImages.slice(0,10):[]}));
});

/* POST /comments/:id/reports: Xử lý yêu cầu tạo/gửi bình luận. Middleware auth xác thực người gọi trước handler. */
router.post('/comments/:id/reports', auth, async(req,res)=>{
  const {Report}=await import('../models.js');const comment=await Comment.findById(req.params.id);if(!comment)return res.status(404).json({message:'Không tìm thấy bình luận'});
  const reason=clean(req.body.reason);if(reason.length<5)return res.status(400).json({message:'Vui lòng nhập lý do báo cáo'});
  res.status(201).json(await Report.create({targetType:'COMMENT',comment:comment.id,post:comment.post,reporter:req.user.sub,reasonCode:clean(req.body.reasonCode)||'OTHER',reason,evidenceImages:Array.isArray(req.body.evidenceImages)?req.body.evidenceImages.slice(0,10):[]}));
});

/* GET /conversations: Đọc hội thoại. Middleware auth xác thực người gọi trước handler. */
router.get('/conversations', auth, async (req, res) => {
  await ensureAdminConversation(req.user.sub);
  const conversations = await Conversation.find({ participants: req.user.sub, hiddenFor: { $ne: req.user.sub } }).populate('participants', 'name avatar email role').sort({ lastMessageAt: -1 });
  const result = await Promise.all(conversations.map(async (conversation) => {
    const [lastMessageRow, unreadCount] = await Promise.all([
      Message.findOne({ conversation: conversation.id, hiddenFor: { $ne: req.user.sub } }).sort({ createdAt: -1 }),
      Message.countDocuments({ conversation: conversation.id, sender: { $ne: req.user.sub }, hiddenFor: { $ne: req.user.sub }, readBy: { $ne: req.user.sub } }),
    ]);
    return { ...conversation.toObject(), lastMessage: lastMessageRow ? serializeMessage(lastMessageRow) : null, unreadCount };
  }));
  res.json(result);
});

/* GET /messages/unread-count: Đọc số nội dung chưa đọc. Middleware auth xác thực người gọi trước handler. */
router.get('/messages/unread-count', auth, async (req, res) => {
  const ids = await Conversation.find({ participants: req.user.sub }).distinct('_id');
  const userId = new mongoose.Types.ObjectId(req.user.sub);
  const rows = await Message.aggregate([{ $match: { conversation: { $in: ids }, sender: { $ne: userId }, hiddenFor: { $ne: userId }, readBy: { $ne: userId } } }, { $group: { _id: '$sender' } }, { $count: 'count' }]);
  res.json({ count: rows[0]?.count || 0 });
});

async function setPendingPost(conversation, postId) {
  if (!postId) return;
  if (!validId(postId) || !await Post.exists({ _id: postId })) throw Object.assign(new Error('Bài viết được nhắc đến không hợp lệ'), { status: 400 });
  conversation.pendingPost = postId;
  await conversation.save();
}

/* POST /conversations/admin: Xử lý yêu cầu tạo/gửi hội thoại. Middleware auth xác thực người gọi trước handler. */
router.post('/conversations/admin', auth, async (req, res) => {
  const conversation = await ensureAdminConversation(req.user.sub);
  if (!conversation) return res.status(404).json({ message: 'Không tìm thấy tài khoản Admin' });
  try { await setPendingPost(conversation, req.body.postId); }
  catch (error) { return res.status(error.status || 400).json({ message: error.message }); }
  res.status(201).json(conversation);
});

/* POST /conversations: Xử lý yêu cầu tạo/gửi hội thoại. Middleware auth xác thực người gọi trước handler. */
router.post('/conversations', auth, async (req, res) => {
  if (!validId(req.body.userId) || req.body.userId === req.user.sub) return res.status(400).json({ message: 'Người nhận không hợp lệ' });
  if (!await User.exists({ _id: req.body.userId, status: 'ACTIVE' })) return res.status(404).json({ message: 'Không tìm thấy người nhận' });
  let conversation = await Conversation.findOne({ participants: { $all: [req.user.sub, req.body.userId], $size: 2 } });
  if (!conversation) conversation = await Conversation.create({ participants: [req.user.sub, req.body.userId] });
  try { await setPendingPost(conversation, req.body.postId); }
  catch (error) { return res.status(error.status || 400).json({ message: error.message }); }
  res.status(201).json(conversation);
});

/* GET /conversations/:id/messages: Đọc hội thoại. Middleware auth xác thực người gọi trước handler. */
router.get('/conversations/:id/messages', auth, async (req, res) => {
  const conversation = await Conversation.findOne({ _id: req.params.id, participants: req.user.sub });
  if (!conversation) return res.status(404).json({ message: 'Không tìm thấy cuộc trò chuyện' });
  await Message.updateMany({ conversation: conversation.id, hiddenFor: { $ne: req.user.sub }, readBy: { $ne: req.user.sub } }, { $addToSet: { readBy: req.user.sub } });
  await Notification.updateMany({ recipient: req.user.sub, type: 'MESSAGE', link: `/messages/${conversation.id}`, read: false }, { read: true });
  const cleared=conversation.clearedFor?.find(item=>String(item.user)===req.user.sub);
  const filter={conversation:conversation.id,hiddenFor:{$ne:req.user.sub},...(cleared?{createdAt:{$gt:cleared.at}}:{})};
  const messages=await Message.find(filter).populate('sender', 'name avatar').populate('post', 'title type status images').sort({ createdAt: 1 }).limit(200);
  res.json(messages.map(serializeMessage));
});

/* POST /conversations/:id/messages: Xử lý yêu cầu tạo/gửi hội thoại. Middleware auth xác thực người gọi trước handler. */
router.post('/conversations/:id/messages', auth, async (req, res) => {
  const content = clean(req.body.content);
  const images=Array.isArray(req.body.images)?req.body.images.slice(0,5):[];
  const conversation = await Conversation.findOne({ _id: req.params.id, participants: req.user.sub });
  if (!conversation || (!content&&!images.length)) return res.status(400).json({ message: 'Tin nhắn không hợp lệ' });
  if (content&&hasProhibitedLanguage(content)) return res.status(400).json({ message: 'Tin nhắn chứa ngôn từ không phù hợp' });
  const message = await Message.create({ conversation: conversation.id, sender: req.user.sub, post: conversation.pendingPost || null, content,images, readBy: [req.user.sub] });
  conversation.lastMessageAt = new Date(); conversation.pendingPost = null; conversation.hiddenFor=[]; await conversation.save();
  await message.populate([{ path: 'sender', select: 'name avatar' }, { path: 'post', select: 'title type status images' }]);
  res.status(201).json(message);
});
/* PATCH /messages/:id: Cập nhật tin nhắn. Middleware auth xác thực người gọi trước handler. */
router.patch('/messages/:id', auth, async(req,res)=>{
  const message=await findMessageForParticipant(req.params.id,req.user.sub);
  if(!message)return res.status(404).json({message:'Không tìm thấy tin nhắn'});
  if(String(message.sender)!==req.user.sub)return res.status(403).json({message:'Bạn chỉ được sửa tin nhắn đã gửi'});
  if(messageIsRecalled(message))return res.status(409).json({message:'Tin nhắn đã thu hồi nên không thể sửa'});
  if(!canEditMessage(message,req.user.sub))return res.status(409).json({message:'Chỉ được sửa tin nhắn trong vòng 15 phút sau khi gửi'});
  const content=clean(req.body.content);
  const images=Array.isArray(req.body.images)?req.body.images.filter(value=>typeof value==='string'&&value.trim()).slice(0,5):message.images;
  if(!content&&!images.length)return res.status(400).json({message:'Tin nhắn phải có nội dung hoặc hình ảnh'});
  if(content&&hasProhibitedLanguage(content))return res.status(400).json({message:'Tin nhắn chứa ngôn từ không phù hợp'});
  const removedImages=message.images.filter(image=>!images.includes(image));
  message.content=content.slice(0,2000);message.images=images;message.editedAt=new Date();await message.save();
  await removeUnusedMessageImages(removedImages,message.id);
  await message.populate([{path:'sender',select:'name avatar'},{path:'post',select:'title type status images'}]);
  res.json(serializeMessage(message));
});

// Xóa chỉ ẩn bản ghi đối với người đang thao tác. Không có endpoint khôi phục.
/* DELETE /messages/:id: Xử lý yêu cầu xóa tin nhắn. Middleware auth xác thực người gọi trước handler. */
router.delete('/messages/:id', auth, async(req,res)=>{
  const message=await findMessageForParticipant(req.params.id,req.user.sub);
  if(!message)return res.status(404).json({message:'Không tìm thấy tin nhắn'});
  if(!message.hiddenFor.some(id=>String(id)===req.user.sub))message.hiddenFor.push(req.user.sub);
  await message.save();
  res.json({message:'Đã xóa tin nhắn ở phía bạn'});
});

// Thu hồi chỉ dành cho người gửi và ảnh/nội dung đều bị loại bỏ cho cả hai phía.
/* PATCH /messages/:id/recall: Cập nhật tin nhắn. Middleware auth xác thực người gọi trước handler. */
router.patch('/messages/:id/recall', auth, async(req,res)=>{
  const message=await findMessageForParticipant(req.params.id,req.user.sub);
  if(!message)return res.status(404).json({message:'Không tìm thấy tin nhắn'});
  if(String(message.sender)!==req.user.sub)return res.status(403).json({message:'Bạn chỉ được thu hồi tin nhắn đã gửi'});
  if(messageIsRecalled(message))return res.status(409).json({message:'Tin nhắn đã được thu hồi'});
  const removedImages=[...message.images];
  message.content='';message.images=[];message.post=null;message.recalledAt=new Date();message.editedAt=null;
  await message.save();
  await removeUnusedMessageImages(removedImages,message.id);
  res.json({message:'Đã thu hồi tin nhắn',item:serializeMessage(message)});
});
/* DELETE /conversations/:id: Xử lý yêu cầu xóa hội thoại. Middleware auth xác thực người gọi trước handler. */
router.delete('/conversations/:id', auth, async(req,res)=>{
  const conversation=await Conversation.findOne({_id:req.params.id,participants:req.user.sub});if(!conversation)return res.status(404).json({message:'Không tìm thấy cuộc trò chuyện'});
  conversation.clearedFor=(conversation.clearedFor||[]).filter(item=>String(item.user)!==req.user.sub);conversation.clearedFor.push({user:req.user.sub,at:new Date()});
  if(!conversation.hiddenFor.some(id=>String(id)===req.user.sub))conversation.hiddenFor.push(req.user.sub);await conversation.save();
  res.json({message:'Đã xóa lịch sử trò chuyện ở phía bạn'});
});
export default router;
