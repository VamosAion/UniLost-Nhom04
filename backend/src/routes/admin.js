/* API quản trị: các thao tác được đặt sau middleware kiểm tra đăng nhập và quyền quản lý. */
import { Router } from 'express';
import { AuditLog, Category, Claim, Comment, Conversation, Handover, Location, Message, Notification, PasswordReset, Post, Report, TransferVerification, User } from '../models.js';
import { auth, allow } from '../auth.js';
import { audit, clean, notify, publicUser, validId } from '../utils.js';
import { syncGuestReviewNotifications } from '../moderation.js';
import { sendMail } from '../mailer.js';

const router = Router();
router.use(auth, allow('ADMIN', 'STAFF'));

const primaryAdminEmail = () => String(process.env.ADMIN_EMAIL || 'admin@dntu.edu.vn').trim().toLowerCase();
/* Giới hạn thao tác nhạy cảm cho tài khoản quản trị chính. */
const primaryAdminOnly = async (req, res, next) => {
  const actor = await User.findById(req.user.sub).select('email role status');
  if (!actor || actor.email !== primaryAdminEmail() || actor.role !== 'ADMIN' || actor.status !== 'ACTIVE') {
    return res.status(403).json({ message: 'Chỉ tài khoản Admin chính được quản lý tài khoản' });
  }
  next();
};

/* GET /stats: Đọc thống kê quản trị. */
router.get('/stats', async (req, res) => res.json({
  users: await User.countDocuments(),
  activeUsers: await User.countDocuments({ status: 'ACTIVE' }),
  openPosts: await Post.countDocuments({ status: 'WAITING_HANDOVER' }),
  lostPosts: await Post.countDocuments({ type: 'LOST' }),
  foundPosts: await Post.countDocuments({ type: 'FOUND' }),
  returned: await Post.countDocuments({ status: { $in: ['HANDED_TO_CTSV', 'HANDED_TO_LOSER'] } }),
  pendingClaims: await Claim.countDocuments({ status: 'PENDING' }),
  pendingGuestPosts: await Post.countDocuments({ isGuest: true, approvalStatus: 'PENDING' }),
  pendingReports: await Report.countDocuments({ status: 'PENDING' }),
}));

/* GET /users: Đọc tài khoản/hồ sơ. */
router.get('/users', async (req, res) => {
  const filter = req.query.keyword ? {
    $or: [
      { name: { $regex: clean(req.query.keyword), $options: 'i' } },
      { email: { $regex: clean(req.query.keyword), $options: 'i' } },
    ],
  } : {};
  res.json((await User.find(filter).sort({ createdAt: -1 }).limit(100)).map(publicUser));
});

/* PATCH /users/:id: Cập nhật tài khoản/hồ sơ. */
router.patch('/users/:id', primaryAdminOnly, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'ID không hợp lệ' });
  const current = await User.findById(req.params.id);
  if (!current) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
  if (current.email === primaryAdminEmail()) return res.status(403).json({ message: 'Tài khoản Admin chính luôn có vai trò Admin và trạng thái Active' });
  const update = {};
  if (['USER', 'STAFF', 'ADMIN'].includes(req.body.role)) update.role = req.body.role;
  if (['ACTIVE', 'LOCKED'].includes(req.body.status)) update.status = req.body.status;
  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
  await audit(req.user.sub, 'UPDATE_USER', 'User', user.id, update);
  await syncGuestReviewNotifications();
  res.json(publicUser(user));
});

/* DELETE /users/:id: Xử lý yêu cầu xóa tài khoản/hồ sơ. */
router.delete('/users/:id', primaryAdminOnly, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'ID không hợp lệ' });
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
  if (target.email === primaryAdminEmail()) return res.status(403).json({ message: 'Không thể xóa tài khoản Admin chính' });
  const postIds = await Post.find({ owner: target.id }).distinct('_id');
  const claimIds = await Claim.find({ $or: [{ claimant: target.id }, { assignedTo: target.id }, { post: { $in: postIds } }] }).distinct('_id');
  const conversationIds = await Conversation.find({ participants: target.id }).distinct('_id');
  await Promise.all([
    Handover.deleteMany({ claim: { $in: claimIds } }),
    TransferVerification.deleteMany({ $or: [{ post: { $in: postIds } }, { initiator: target.id }, { expectedConfirmer: target.id }, { confirmedBy: target.id }] }),
    Comment.deleteMany({ $or: [{ post: { $in: postIds } }, { author: target.id }] }),
    Report.deleteMany({ $or: [{ post: { $in: postIds } }, { reporter: target.id }] }),
    Claim.deleteMany({ _id: { $in: claimIds } }),
    Message.deleteMany({ conversation: { $in: conversationIds } }),
    Conversation.deleteMany({ _id: { $in: conversationIds } }),
    Notification.deleteMany({ recipient: target.id }),
    PasswordReset.deleteMany({ user: target.id }),
    Post.deleteMany({ _id: { $in: postIds } }),
  ]);
  await User.deleteOne({ _id: target.id });
  await syncGuestReviewNotifications();
  await audit(req.user.sub, 'DELETE_USER', 'User', target.id, { email: target.email });
  res.json({ message: 'Đã xóa tài khoản và dữ liệu liên quan' });
});

/* GET /posts: Đọc bài đăng. */
router.get('/posts', async (req, res) => {
  const filter = {};
  if (['LOST', 'FOUND'].includes(req.query.type)) filter.type = req.query.type;
  if (validId(req.query.category)) filter.category = req.query.category;
  if (req.query.location === 'OTHER') filter.isOtherLocation = true;
  else if (validId(req.query.location)) filter.location = req.query.location;
  if (['WAITING_HANDOVER', 'HANDED_TO_CTSV', 'HANDED_TO_LOSER', 'CLOSED', 'HIDDEN'].includes(req.query.status)) filter.status = req.query.status;
  if (['PENDING', 'APPROVED', 'REJECTED'].includes(req.query.approvalStatus)) filter.approvalStatus = req.query.approvalStatus;
  const ownerKeyword = clean(req.query.owner);
  if (ownerKeyword) {
    const owners = await User.find({ $or: [
      { name: { $regex: ownerKeyword, $options: 'i' } },
      { email: { $regex: ownerKeyword, $options: 'i' } },
    ] }).distinct('_id');
    filter.$and = [{ $or: [
      { owner: { $in: owners } },
      { guestName: { $regex: ownerKeyword, $options: 'i' } },
      { guestPhone: { $regex: ownerKeyword, $options: 'i' } },
    ] }];
  }
  const keyword = clean(req.query.keyword);
  if (keyword) (filter.$and ||= []).push({ $or: [
    { title: { $regex: keyword, $options: 'i' } },
    { description: { $regex: keyword, $options: 'i' } },
  ] });
  res.json(await Post.find(filter).populate('owner', 'name email').populate('category', 'name').populate('location', 'name').sort({ createdAt: -1 }).limit(300));
});

/* POST /posts/bulk-delete: Xử lý yêu cầu tạo/gửi bài đăng. */
router.post('/posts/bulk-delete', async (req, res) => {
  const ids = [...new Set(Array.isArray(req.body.ids) ? req.body.ids.filter(validId) : [])].slice(0, 300);
  if (!ids.length) return res.status(400).json({ message: 'Vui lòng chọn ít nhất một bài viết' });
  const result = await Post.deleteMany({ _id: { $in: ids } });
  await syncGuestReviewNotifications();
  await audit(req.user.sub, 'BULK_DELETE_POSTS', 'Post', null, { requested: ids.length, deleted: result.deletedCount });
  res.json({ message: `Đã xóa ${result.deletedCount} bài viết`, deletedCount: result.deletedCount });
});

/* PATCH /posts/bulk-moderate: Cập nhật bài đăng. */
router.patch('/posts/bulk-moderate', async (req, res) => {
  const ids = [...new Set(Array.isArray(req.body.ids) ? req.body.ids.filter(validId) : [])].slice(0, 300);
  const approvalStatus = req.body.action === 'APPROVE' ? 'APPROVED' : req.body.action === 'REJECT' ? 'REJECTED' : '';
  if (!ids.length || !approvalStatus) return res.status(400).json({ message: 'Thông tin duyệt bài không hợp lệ' });
  const result = await Post.updateMany({ _id: { $in: ids }, isGuest: true, approvalStatus: 'PENDING' }, {
    approvalStatus, approvalNote: clean(req.body.note).slice(0, 300), reviewedBy: req.user.sub, reviewedAt: new Date(),
  });
  await audit(req.user.sub, `BULK_${approvalStatus}_GUEST_POSTS`, 'Post', null, { requested: ids.length, updated: result.modifiedCount });
  await syncGuestReviewNotifications();
  res.json({ message: approvalStatus === 'APPROVED' ? `Đã duyệt ${result.modifiedCount} bài khách` : `Đã từ chối ${result.modifiedCount} bài khách`, updatedCount: result.modifiedCount });
});

/* GET /reports: Đọc báo cáo vi phạm. */
router.get('/reports', async (req, res) => {
  const filter = ['PENDING', 'RESOLVED', 'REJECTED'].includes(req.query.status) ? { status: req.query.status } : {};
  res.json(await Report.find(filter).populate('post', 'title status type owner isGuest guestName').populate('user', 'name email avatar warningPoints status lockedUntil').populate({path:'comment',select:'content author post isAnonymous',populate:{path:'author',select:'name email'}}).populate('reporter', 'name email').populate('resolvedBy', 'name email').sort({ createdAt: -1 }).limit(300));
});

/* PATCH /reports/:id: Cập nhật báo cáo vi phạm. */
router.patch('/reports/:id', async (req, res) => {
  if (!validId(req.params.id) || !['WARN', 'DELETE_CONTENT', 'DISMISS'].includes(req.body.action)) return res.status(400).json({ message: 'Thông tin xử lý không hợp lệ' });
  const report = await Report.findById(req.params.id).populate('post comment user');
  if (!report) return res.status(404).json({ message: 'Không tìm thấy báo cáo' });
  if(report.status!=='PENDING')return res.status(409).json({message:'Báo cáo đã được xử lý'});
  if(report.targetType==='POST'&&report.post?.isGuest&&!['DELETE_CONTENT','DISMISS'].includes(req.body.action))return res.status(400).json({message:'Bài khách chỉ có thể xóa hoặc bỏ qua báo cáo'});
  if(report.targetType==='USER'&&!['WARN','DISMISS'].includes(req.body.action))return res.status(400).json({message:'Báo cáo trang cá nhân chỉ có thể cảnh cáo hoặc bỏ qua'});
  let targetUser=report.user||null;
  if(!targetUser&&report.comment?.author)targetUser=await User.findById(report.comment.author);
  if(!targetUser&&report.post?.owner)targetUser=await User.findById(report.post.owner);
  const points=report.post?.isGuest?0:req.body.action==='DELETE_CONTENT'?2:req.body.action==='WARN'?1:0;
  if(req.body.action==='DELETE_CONTENT'){
    if(report.targetType==='POST'&&report.post)await Post.deleteOne({_id:report.post._id});
    if(report.targetType==='COMMENT'&&report.comment)await Comment.deleteMany({$or:[{_id:report.comment._id},{parent:report.comment._id}]});
  }
  if(points&&targetUser&&targetUser.email!==primaryAdminEmail()){
    const previousPoints=targetUser.warningPoints||0;
    targetUser.warningPoints=Math.min(12,previousPoints+points);targetUser.warningPointsUpdatedAt=new Date();
    const reachedTen=previousPoints<10&&targetUser.warningPoints>=10;
    if(reachedTen)targetUser.warningTenSentAt=new Date();
    if(targetUser.warningPoints>=12){targetUser.status='LOCKED';targetUser.lockedUntil=new Date(Date.now()+7*24*60*60*1000);}
    await targetUser.save();
    const lockText=targetUser.status==='LOCKED'?' Tài khoản đã đủ 12 điểm và bị khóa 7 ngày.':'';
    const warningText=reachedTen&&targetUser.status!=='LOCKED'?' Tài khoản đã đạt 10/12 điểm cảnh cáo.':'';
    await notify(targetUser.id,targetUser.status==='LOCKED'?'ACCOUNT_LOCKED':'ACCOUNT_WARNING',`Tài khoản nhận ${points} điểm cảnh cáo. Tổng hiện tại: ${targetUser.warningPoints}/12.${warningText}${lockText}`,'/profile');
    await sendMail({to:targetUser.email,subject:targetUser.status==='LOCKED'?'UniLost - Tài khoản bị khóa 7 ngày':'UniLost - Cảnh cáo tài khoản',text:`Một báo cáo liên quan đến nội dung của bạn đã được xử lý. Tài khoản nhận ${points} điểm cảnh cáo, tổng hiện tại ${targetUser.warningPoints}/12.${warningText}${lockText} Mỗi ngày hệ thống tự giảm 1 điểm.`}).catch(()=>{});
  }
  report.status=req.body.action==='DISMISS'?'REJECTED':'RESOLVED';report.action=req.body.action;report.warningPointsApplied=points;report.resolution=clean(req.body.resolution).slice(0,500);report.resolvedBy=req.user.sub;await report.save();
  await audit(req.user.sub, 'RESOLVE_REPORT', 'Report', report.id, { status: report.status, action:report.action, points });
  res.json(report);
});

/* GET /catalog/:type: Đọc danh mục quản lý. */
router.get('/catalog/:type', async (req, res) => {
  const Model = req.params.type === 'categories' ? Category : req.params.type === 'locations' ? Location : null;
  if (!Model) return res.status(404).json({ message: 'Danh mục không hợp lệ' });
  res.json(await Model.find().sort({ name: 1 }));
});

/* POST /catalog/:type: Xử lý yêu cầu tạo/gửi danh mục quản lý. */
router.post('/catalog/:type', async (req, res, next) => {
  try {
    const Model = req.params.type === 'categories' ? Category : req.params.type === 'locations' ? Location : null;
    if (!Model) return res.status(404).json({ message: 'Danh mục không hợp lệ' });
    const item = await Model.create({ name: clean(req.body.name), description: clean(req.body.description), building: clean(req.body.building) });
    await audit(req.user.sub, 'CREATE_CATALOG', req.params.type, item.id);
    res.status(201).json(item);
  } catch (error) { next(error); }
});

/* PATCH /catalog/:type/:id: Cập nhật danh mục quản lý. */
router.patch('/catalog/:type/:id', async (req, res) => {
  const Model = req.params.type === 'categories' ? Category : req.params.type === 'locations' ? Location : null;
  if (!Model) return res.status(404).json({ message: 'Danh mục không hợp lệ' });
  const item = await Model.findByIdAndUpdate(req.params.id, {
    name: clean(req.body.name), description: clean(req.body.description), building: clean(req.body.building), active: req.body.active,
  }, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ message: 'Không tìm thấy dữ liệu' });
  await audit(req.user.sub, 'UPDATE_CATALOG', req.params.type, item.id);
  res.json(item);
});

/* GET /audit-logs: Đọc lịch sử quản trị. */
router.get('/audit-logs', async (req, res) => res.json(await AuditLog.find().populate('actor', 'name email').sort({ createdAt: -1 }).limit(100)));

export default router;
