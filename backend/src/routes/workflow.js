/* API điều phối yêu cầu nhận đồ, bàn giao và thông báo; trạng thái được lưu ở backend để các bên cùng theo dõi. */
import { Router } from 'express';
import { Claim, Handover, Notification, Post, Report, User } from '../models.js';
import { auth } from '../auth.js';
import { clean, notify, validId, hasProhibitedLanguage } from '../utils.js';
import { sendMail } from '../mailer.js';
const router = Router();
/* Xác định vai trò có quyền quản lý theo quy tắc của phiên bản. */
const isModerator = (role) => ['ADMIN', 'STAFF'].includes(role);

const roles = (claim) => {
  const post = claim.post;
  return post.type === 'FOUND'
    ? { finderId: String(post.owner), receiverId: String(claim.claimant) }
    : { finderId: String(claim.claimant), receiverId: String(post.owner) };
};

/* POST /posts/:id/claims: Xử lý yêu cầu tạo/gửi yêu cầu nhận/trả đồ. Middleware auth xác thực người gọi trước handler. */
router.post('/posts/:id/claims', auth, async (req, res) => {
  if (!validId(req.params.id) || clean(req.body.proof).length < 5) return res.status(400).json({ message: 'Thông tin xác minh chưa hợp lệ' });
  if (hasProhibitedLanguage(req.body.proof)) return res.status(400).json({ message: 'Nội dung xác minh chứa ngôn từ không phù hợp' });
  const post = await Post.findById(req.params.id);
  if (!post || !['WAITING_HANDOVER', 'HANDED_TO_CTSV'].includes(post.status)) return res.status(400).json({ message: 'Tài sản đã bàn giao cho chủ sở hữu. Vui lòng liên hệ Admin nếu cần hỗ trợ' });
  if (!post.owner && !(post.isGuest && post.type === 'FOUND' && post.guestHandling === 'KEEP')) return res.status(400).json({ message: 'Bài khách này được xử lý qua phòng CTSV hoặc thông tin liên hệ công khai' });
  if (String(post.owner) === req.user.sub) return res.status(400).json({ message: 'Không thể gửi yêu cầu cho bài của chính mình' });
  if (await Claim.exists({ post: post.id, claimant: req.user.sub, status: 'PENDING' })) return res.status(409).json({ message: 'Bạn đã gửi yêu cầu cho bài này' });
  const admin = post.status === 'HANDED_TO_CTSV' ? await User.findOne({ role: 'ADMIN', status: 'ACTIVE' }) : null;
  const assignedTo = admin?.id || post.owner || null;
  const assignedToGuest = !assignedTo && post.isGuest;
  if (!assignedTo && !assignedToGuest) return res.status(503).json({ message: 'Chưa xác định được người tiếp nhận yêu cầu' });
  const claim = await Claim.create({ post: post.id, claimant: req.user.sub, assignedTo, assignedToGuest, proof: clean(req.body.proof), proofImages: Array.isArray(req.body.proofImages) ? req.body.proofImages.slice(0, 3) : [] });
  if (assignedTo) await notify(assignedTo, 'NEW_CLAIM', post.status === 'HANDED_TO_CTSV' ? 'Có yêu cầu nhận tài sản đang lưu tại phòng CTSV' : post.type === 'LOST' ? 'Có người đề nghị trả lại tài sản' : 'Có người yêu cầu nhận lại tài sản', `/claims?tab=received&claim=${claim.id}`);
  if (assignedToGuest && post.guestEmail) await sendMail({ to: post.guestEmail, subject: `UniLost - Có yêu cầu nhận tài sản: ${post.title}`, text: `Có người vừa gửi yêu cầu nhận tài sản trong bài “${post.title}”. Hãy mở đường dẫn quản lý bài mà UniLost đã cấp để xem minh chứng và phản hồi.` }).catch(() => {});
  res.status(201).json(claim);
});

/* GET /claims: Đọc yêu cầu nhận/trả đồ. Middleware auth xác thực người gọi trước handler. */
router.get('/claims', auth, async (req, res) => {
  const filter = {};
  if (req.query.scope === 'mine') filter.claimant = req.user.sub;
  else if (req.query.scope === 'received') filter.assignedTo = req.user.sub;
  else if (!isModerator(req.user.role)) return res.status(400).json({ message: 'Scope không hợp lệ' });
  res.json(await Claim.find(filter).populate({ path: 'post', populate: [{ path: 'category', select: 'name' }, { path: 'location', select: 'name' }, { path: 'owner', select: 'name avatar' }] }).populate('claimant', 'name email avatar').populate('assignedTo', 'name email role').sort({ createdAt: -1 }));
});

/* GET /posts/:id/claim-summary: Đọc tóm tắt yêu cầu của bài. Middleware auth xác thực người gọi trước handler. */
router.get('/posts/:id/claim-summary', auth, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'ID không hợp lệ' });
  const post = await Post.findById(req.params.id).select('owner');
  if (!post) return res.status(404).json({ message: 'Không tìm thấy bài đăng' });
  if (String(post.owner) !== req.user.sub && !isModerator(req.user.role)) return res.status(403).json({ message: 'Bạn không có quyền xem yêu cầu của bài này' });
  res.json({ pending: await Claim.countDocuments({ post: post.id, status: 'PENDING' }) });
});

/* PATCH /claims/:id/status: Cập nhật yêu cầu nhận/trả đồ. Middleware auth xác thực người gọi trước handler. */
router.patch('/claims/:id/status', auth, async (req, res) => {
  const claim = await Claim.findById(req.params.id).populate('post');
  if (!claim) return res.status(404).json({ message: 'Không tìm thấy yêu cầu' });
  const isClaimant = String(claim.claimant) === req.user.sub;
  const isAssignee = String(claim.assignedTo) === req.user.sub;
  if (req.body.status === 'CANCELLED' && !isClaimant) return res.status(403).json({ message: 'Chỉ người gửi được hủy yêu cầu' });
  if (['VERIFIED', 'REJECTED'].includes(req.body.status) && !isAssignee && !isModerator(req.user.role)) return res.status(403).json({ message: 'Bạn không có quyền duyệt' });
  if (!['VERIFIED', 'REJECTED', 'CANCELLED'].includes(req.body.status)) return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
  claim.status = req.body.status; claim.reviewNote = clean(req.body.reviewNote); claim.reviewedBy = req.user.sub; await claim.save();
  if (claim.status === 'VERIFIED') {
    await Claim.updateMany({ post: claim.post._id, _id: { $ne: claim.id }, status: { $in: ['PENDING', 'VERIFIED'] } }, {
      status: 'REJECTED', reviewNote: 'Một yêu cầu khác đã được chấp nhận', reviewedBy: req.user.sub,
    });
  }
  if (isClaimant === false) await notify(claim.claimant, claim.status === 'VERIFIED' ? 'CLAIM_ACCEPTED' : claim.status === 'REJECTED' ? 'CLAIM_REJECTED' : 'CLAIM_UPDATED', claim.status === 'VERIFIED' ? 'Yêu cầu của bạn đã được chấp nhận' : claim.status === 'REJECTED' ? `Yêu cầu của bạn bị từ chối${claim.reviewNote ? `: ${claim.reviewNote}` : ''}` : 'Yêu cầu của bạn đã được cập nhật', `/claims?tab=mine&claim=${claim.id}`);
  res.json(claim);
});

/* POST /claims/:id/handover: Xử lý yêu cầu tạo/gửi yêu cầu nhận/trả đồ. Middleware auth xác thực người gọi trước handler. */
router.post('/claims/:id/handover', auth, async (req, res) => {
  const claim = await Claim.findById(req.params.id).populate('post');
  if (!claim || claim.status !== 'VERIFIED') return res.status(400).json({ message: 'Yêu cầu chưa được xác minh' });
  const { finderId } = roles(claim);
  if (req.user.sub !== finderId) return res.status(403).json({ message: 'Người nhặt là người lên lịch bàn giao trước' });
  if (!['DIRECT', 'SUPPORT_OFFICE'].includes(req.body.method) || !req.body.scheduledAt || clean(req.body.locationText).length < 3) return res.status(400).json({ message: 'Thông tin bàn giao không hợp lệ' });
  const handover = await Handover.findOneAndUpdate({ claim: claim.id }, {
    method: req.body.method, finderScheduledAt: req.body.scheduledAt, finderLocation: clean(req.body.locationText),
    receiverScheduledAt: null, receiverLocation: '', note: clean(req.body.note), status: 'FINDER_SCHEDULED',
    finderConfirmed: false, receiverConfirmed: false, completionImages: [],
  }, { new: true, upsert: true, runValidators: true });
  res.status(201).json(handover);
});

/* PATCH /handovers/:id/receiver: Cập nhật bàn giao. Middleware auth xác thực người gọi trước handler. */
router.patch('/handovers/:id/receiver', auth, async (req, res) => {
  const handover = await Handover.findById(req.params.id).populate({ path: 'claim', populate: { path: 'post' } });
  if (!handover) return res.status(404).json({ message: 'Không tìm thấy lịch bàn giao' });
  const { finderId, receiverId } = roles(handover.claim);
  if (req.user.sub !== receiverId) return res.status(403).json({ message: 'Chỉ người mất được lên lịch nhận lại' });
  if (!req.body.scheduledAt || clean(req.body.locationText).length < 3) return res.status(400).json({ message: 'Thông tin nhận lại không hợp lệ' });
  handover.receiverScheduledAt = req.body.scheduledAt; handover.receiverLocation = clean(req.body.locationText); handover.status = 'RECEIVER_SCHEDULED'; await handover.save();
  res.json(handover);
});

/* GET /handovers: Đọc bàn giao. Middleware auth xác thực người gọi trước handler. */
router.get('/handovers', auth, async (req, res) => {
  const owned = await Post.find({ owner: req.user.sub }).distinct('_id');
  const claims = isModerator(req.user.role) ? await Claim.find({ status: 'VERIFIED' }).distinct('_id') : await Claim.find({ $or: [{ claimant: req.user.sub }, { post: { $in: owned } }] }).distinct('_id');
  const handovers = await Handover.find({ claim: { $in: claims } }).populate({ path: 'claim', populate: [{ path: 'post', select: 'title owner type status' }, { path: 'claimant', select: 'name email' }] }).sort({ finderScheduledAt: 1 });
  res.json(handovers.filter((item) => item.claim?.post && item.claim?.claimant));
});

/* PATCH /handovers/:id/confirm: Cập nhật bàn giao. Middleware auth xác thực người gọi trước handler. */
router.patch('/handovers/:id/confirm', auth, async (req, res) => {
  return res.status(409).json({ message: 'Vui lòng xác nhận bàn giao bằng mã QR trên trang chi tiết bài đăng' });
});

/* PATCH /handovers/:id/cancel: Cập nhật bàn giao. Middleware auth xác thực người gọi trước handler. */
router.patch('/handovers/:id/cancel', auth, async (req, res) => {
  const handover = await Handover.findById(req.params.id).populate({ path: 'claim', populate: { path: 'post' } });
  if (!handover) return res.status(404).json({ message: 'Không tìm thấy lịch' });
  const { finderId, receiverId } = roles(handover.claim);
  if (![finderId, receiverId].includes(req.user.sub) && !isModerator(req.user.role)) return res.status(403).json({ message: 'Bạn không có quyền' });
  handover.status = 'CANCELLED'; await handover.save(); res.json(handover);
});

/* GET /notifications: Đọc thông báo. Middleware auth xác thực người gọi trước handler. */
router.get('/notifications', auth, async (req, res) => res.json(await Notification.find({ recipient: req.user.sub }).sort({ createdAt: -1 }).limit(50)));
/* GET /notifications/unread-count: Đọc số nội dung chưa đọc. Middleware auth xác thực người gọi trước handler. */
router.get('/notifications/unread-count', auth, async (req, res) => res.json({ count: await Notification.countDocuments({ recipient: req.user.sub, read: false }) }));
/* PATCH /notifications/:id/read: Cập nhật thông báo. Middleware auth xác thực người gọi trước handler. */
router.patch('/notifications/:id/read', auth, async (req, res) => {
  const item = await Notification.findOneAndUpdate({ _id: req.params.id, recipient: req.user.sub }, { read: true }, { new: true });
  if (!item) return res.status(404).json({ message: 'Không tìm thấy thông báo' }); res.json(item);
});
/* PATCH /notifications/read-all: Cập nhật thông báo. Middleware auth xác thực người gọi trước handler. */
router.patch('/notifications/read-all', auth, async (req, res) => { await Notification.updateMany({ recipient: req.user.sub, read: false, type: { $ne: 'TRANSFER_PENDING' } }, { read: true }); res.json({ message: 'Đã đọc các thông báo không còn chờ xử lý' }); });
/* DELETE /notifications/:id: Xử lý yêu cầu xóa thông báo. Middleware auth xác thực người gọi trước handler. */
router.delete('/notifications/:id', auth, async (req, res) => {
  const item = await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.user.sub });
  if (!item) return res.status(404).json({ message: 'Không tìm thấy thông báo' });
  res.json({ message: 'Đã xóa thông báo' });
});
/* DELETE /notifications: Xử lý yêu cầu xóa thông báo. Middleware auth xác thực người gọi trước handler. */
router.delete('/notifications', auth, async (req, res) => {
  await Notification.deleteMany({ recipient: req.user.sub, type: { $ne: 'TRANSFER_PENDING' } });
  res.json({ message: 'Đã xóa các thông báo không còn chờ xử lý' });
});
/* POST /posts/:id/guest-completion-request: Xử lý yêu cầu tạo/gửi xác nhận hoàn tất bài khách. Middleware auth xác thực người gọi trước handler. */
router.post('/posts/:id/guest-completion-request', auth, async (req,res)=>{
  const post=await Post.findOne({_id:req.params.id,isGuest:true});
  if(!post)return res.status(404).json({message:'Không tìm thấy bài đăng khách'});
  if(post.status!=='WAITING_HANDOVER')return res.status(409).json({message:'Bài đăng đã được cập nhật trạng thái'});
  const admins=await User.find({role:{$in:['ADMIN','STAFF']},status:'ACTIVE'}).select('_id');
  post.guestCompletionRequestedAt=new Date();await post.save();
  await Promise.all(admins.map(admin=>notify(admin.id,'GUEST_COMPLETION_REQUEST',`Có yêu cầu xác nhận đã hoàn tất trao trả: ${post.title}`,`/posts/${post.id}`)));
  res.status(201).json({message:'Đã gửi yêu cầu xác nhận đến phòng CTSV'});
});
/* PATCH /posts/:id/guest-completion: Cập nhật xác nhận hoàn tất bài khách. Middleware auth xác thực người gọi trước handler. */
router.patch('/posts/:id/guest-completion', auth, async(req,res)=>{
  if(!isModerator(req.user.role))return res.status(403).json({message:'Chỉ Admin/Staff được xác nhận tình trạng'});
  const post=await Post.findOne({_id:req.params.id,isGuest:true});if(!post)return res.status(404).json({message:'Không tìm thấy bài đăng khách'});
  if(req.body.action==='CONFIRM'){
    post.status='HANDED_TO_LOSER';post.resolutionType='RETURNED_TO_OWNER';post.statusChangedBy=req.user.sub;post.statusChangedAt=new Date();post.guestCompletionRequestedAt=null;await post.save();
    return res.json({message:'Đã xác nhận tài sản được trao trả thành công',post});
  }
  if(req.body.action==='REJECT'){post.guestCompletionRequestedAt=null;post.approvalNote=clean(req.body.note).slice(0,300);await post.save();return res.json({message:'Đã từ chối yêu cầu xác nhận',post});}
  res.status(400).json({message:'Thao tác không hợp lệ'});
});
/* POST /posts/:id/reports: Xử lý yêu cầu tạo/gửi báo cáo vi phạm. Middleware auth xác thực người gọi trước handler. */
router.post('/posts/:id/reports', auth, async (req, res) => {
  if (isModerator(req.user.role)) return res.status(403).json({ message: 'Quản trị viên sử dụng chức năng xóa bài' });
  if (!validId(req.params.id) || clean(req.body.reason).length < 5) return res.status(400).json({ message: 'Lý do báo cáo chưa hợp lệ' });
  if (!await Post.exists({ _id: req.params.id })) return res.status(404).json({ message: 'Không tìm thấy bài đăng' });
  res.status(201).json(await Report.create({ targetType:'POST',post: req.params.id, reporter: req.user.sub,reasonCode:clean(req.body.reasonCode)||'OTHER',reason: clean(req.body.reason),evidenceImages:Array.isArray(req.body.evidenceImages)?req.body.evidenceImages.slice(0,10):[] }));
});
export default router;
