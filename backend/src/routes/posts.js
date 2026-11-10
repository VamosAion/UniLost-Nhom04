/* API bài đăng mất/nhặt đồ: kiểm tra dữ liệu, truy vấn và áp dụng quyền trước các thay đổi. */
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Post } from '../models.js';
import { auth, optionalAuth } from '../auth.js';
import { clean, pageOptions, validId, validPhone, hasProhibitedLanguage } from '../utils.js';
import { matchingScore } from '../matching.js';
import { syncGuestReviewNotifications } from '../moderation.js';

const router = Router();
fs.mkdirSync('uploads', { recursive: true });
const storage = multer.diskStorage({
  destination: 'uploads',
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname).toLowerCase()}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});
const populate = (query) => query.populate('owner', 'name avatar').populate('category', 'name').populate('location', 'name building');

/* POST /upload: Xử lý yêu cầu tạo/gửi ảnh tải lên. */
router.post('/upload', optionalAuth, upload.array('images', 10), (req, res) => {
  res.status(201).json({ images: req.files.map((file) => `/uploads/${file.filename}`) });
});

/* GET /: Đọc bài đăng. */
router.get('/', optionalAuth, async (req, res) => {
  const { page, limit } = pageOptions(req.query);
  const filter = { status: { $ne: 'HIDDEN' }, approvalStatus: req.user ? { $ne: 'REJECTED' } : { $nin: ['PENDING', 'REJECTED'] } };
  if (req.query.type) filter.type = req.query.type;
  if (req.query.category && validId(req.query.category)) filter.category = req.query.category;
  if (req.query.location === 'OTHER') filter.isOtherLocation = true;
  else if (req.query.location && validId(req.query.location)) filter.location = req.query.location;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.owner === 'me' && req.user) filter.owner = req.user.sub;
  if (req.query.keyword) filter.$text = { $search: clean(req.query.keyword) };
  const [items, total] = await Promise.all([
    populate(Post.find(filter).select('-secretDetail')).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Post.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

/* POST /: Xử lý yêu cầu tạo/gửi bài đăng. */
router.post('/', optionalAuth, async (req, res, next) => {
  try {
    const data = parseBody(req.body);
    if (!data.type || !data.title || !data.description || !validId(data.category) || !validId(data.location) || !data.eventDate) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
    }
    if ([data.title, data.description, data.customLocation, data.contactNote, data.secretDetail, req.body.guestName].some(hasProhibitedLanguage)) return res.status(400).json({ message: 'Nội dung chứa ngôn từ không phù hợp. Vui lòng điều chỉnh trước khi đăng.' });
    const eventDate = new Date(data.eventDate); const earliest = new Date(); earliest.setFullYear(earliest.getFullYear() - 2); earliest.setHours(0, 0, 0, 0); const latest = new Date(); latest.setHours(23, 59, 59, 999);
    if (Number.isNaN(eventDate.getTime()) || eventDate < earliest || eventDate > latest) return res.status(400).json({ message: 'Ngày xảy ra chỉ được chọn trong khoảng 2 năm gần đây đến hôm nay' });
    if (!req.user) {
      data.isGuest = true;
      data.guestName = clean(req.body.guestName).slice(0, 100);
      data.guestPhone = clean(req.body.guestPhone).slice(0, 20);
      data.guestEmail = clean(req.body.guestEmail).toLowerCase().slice(0, 160);
      data.guestHandling = req.body.guestHandling === 'CTSV' ? 'CTSV' : 'KEEP';
      data.guestCtsvMethod = data.guestHandling === 'CTSV' && ['SELF_DROP', 'ADMIN_PICKUP'].includes(req.body.guestCtsvMethod) ? req.body.guestCtsvMethod : '';
      data.approvalStatus = 'PENDING';
      data.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      if (data.guestName.length < 2 || !validPhone(data.guestPhone)) {
        return res.status(400).json({ message: 'Khách cần nhập họ tên và số điện thoại đủ 10 số, đúng đầu số được hỗ trợ' });
      }
      if (data.type === 'FOUND' && !/^\S+@\S+\.\S+$/.test(data.guestEmail)) return res.status(400).json({ message: 'Khách đăng bài nhặt được cần nhập email để nhận yêu cầu và đường dẫn quản lý' });
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      if (await Post.countDocuments({ isGuest: true, guestPhone: data.guestPhone, createdAt: { $gte: dayStart } }) >= 3) return res.status(429).json({ message: 'Số điện thoại này đã đăng tối đa 3 bài trong hôm nay' });
      const rawIp = String(req.ip || req.socket.remoteAddress || 'unknown');
      data.guestIpHash = crypto.createHash('sha256').update(`${process.env.IP_HASH_SECRET || process.env.JWT_SECRET}:${rawIp}`).digest('hex');
      if (await Post.countDocuments({ isGuest: true, guestIpHash: data.guestIpHash, createdAt: { $gte: dayStart } }) >= 5) return res.status(429).json({ message: 'Thiết bị hoặc mạng này đã gửi quá nhiều bài trong hôm nay' });
      const managementToken = crypto.randomBytes(32).toString('hex');
      const managementCode = String(crypto.randomInt(10000000, 100000000));
      data.guestManagementTokenHash = crypto.createHash('sha256').update(managementToken).digest('hex');
      data.guestManagementCodeHash = crypto.createHash('sha256').update(managementCode).digest('hex');
      req.guestCredentials = { managementToken, managementCode };
    } else data.owner = req.user.sub;
    const post = await Post.create(data);
    if (data.isGuest) await syncGuestReviewNotifications();
    const result = (await populate(Post.findById(post.id))).toObject();
    if (data.isGuest) {
      result.pendingApproval = true;
      result.managementToken = req.guestCredentials.managementToken;
      result.managementCode = req.guestCredentials.managementCode;
      result.managementPath = `/guest/manage/${req.guestCredentials.managementToken}`;
    }
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/* GET /:id/matches: Đọc gợi ý bài tương đồng. Middleware auth xác thực người gọi trước handler. */
router.get('/:id/matches', auth, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'ID không hợp lệ' });
  const source = await Post.findById(req.params.id).populate('category location');
  if (!source) return res.status(404).json({ message: 'Không tìm thấy bài đăng' });
  const candidates = await populate(Post.find({ _id: { $ne: source.id }, type: source.type === 'LOST' ? 'FOUND' : 'LOST', status: 'WAITING_HANDOVER' })).limit(100);
  res.json(candidates.map((post) => ({ post, score: matchingScore(normalize(source), normalize(post)) })).filter((item) => item.score >= 30).sort((a, b) => b.score - a.score));
});

/* GET /:id: Đọc bài đăng. */
router.get('/:id', optionalAuth, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'ID không hợp lệ' });
  let query = Post.findById(req.params.id);
  if (req.user) query = query.select('+secretDetail');
  const post = await populate(query);
  if (!post || (post.status === 'HIDDEN' && !['ADMIN', 'STAFF'].includes(req.user?.role)) || (post.approvalStatus === 'REJECTED' && !['ADMIN', 'STAFF'].includes(req.user?.role)) || (post.approvalStatus === 'PENDING' && !req.user)) {
    return res.status(404).json({ message: 'Không tìm thấy bài đăng' });
  }
  const result = post.toObject();
  if (String(post.owner?._id) !== req.user?.sub && !['ADMIN', 'STAFF'].includes(req.user?.role)) delete result.secretDetail;
  res.json(result);
});

/* PATCH /:id: Cập nhật bài đăng. Middleware auth xác thực người gọi trước handler. */
router.patch('/:id', auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Không tìm thấy bài đăng' });
  if (String(post.owner)!==req.user.sub&&!['ADMIN', 'STAFF'].includes(req.user.role)) return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa bài đăng' });
  Object.assign(post, parseBody(req.body));
  await post.save();
  res.json(await populate(Post.findById(post.id)));
});

/* PATCH /:id/status: Cập nhật bài đăng. Middleware auth xác thực người gọi trước handler. */
router.patch('/:id/status', auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Không tìm thấy bài đăng' });
  if (String(post.owner) !== req.user.sub && !['ADMIN', 'STAFF'].includes(req.user.role)) return res.status(403).json({ message: 'Bạn không có quyền' });
  if(req.body.status==='CLOSED'&&String(post.owner)===req.user.sub){post.status='CLOSED';post.statusChangedBy=req.user.sub;post.statusChangedAt=new Date();await post.save();return res.json(post);}
  return res.status(409).json({ message: 'Trạng thái bàn giao chỉ được cập nhật sau khi hai bên xác nhận bằng mã QR' });
});

/* PATCH /:id/self-found: Cập nhật xác nhận tự tìm lại đồ. Middleware auth xác thực người gọi trước handler. */
router.patch('/:id/self-found', auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Không tìm thấy bài đăng' });
  if (post.type !== 'LOST' || String(post.owner) !== req.user.sub || post.status !== 'WAITING_HANDOVER') return res.status(403).json({ message: 'Chỉ chủ bài mất đồ đang chờ bàn giao mới dùng được chức năng này' });
  post.status = 'CLOSED'; post.resolutionType = 'RECEIVED_BACK'; post.statusChangedBy = req.user.sub; post.statusChangedAt = new Date(); await post.save();
  res.json({ message: 'Đã xác nhận bạn tự tìm lại được đồ bị mất', post });
});

/* PATCH /:id/comments: Cập nhật bình luận. Middleware auth xác thực người gọi trước handler. */
router.patch('/:id/comments', auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Không tìm thấy bài đăng' });
  if (!['ADMIN', 'STAFF'].includes(req.user.role)) return res.status(403).json({ message: 'Chỉ quản trị viên được bật hoặc tắt bình luận' });
  post.commentsEnabled = Boolean(req.body.enabled);
  await post.save();
  res.json(post);
});

/* PATCH /:id/comments-hidden: Cập nhật chế độ hiển thị bình luận. Middleware auth xác thực người gọi trước handler. */
router.patch('/:id/comments-hidden', auth, async(req,res)=>{
  const post=await Post.findById(req.params.id);if(!post)return res.status(404).json({message:'Không tìm thấy bài đăng'});
  if(!['ADMIN','STAFF'].includes(req.user.role))return res.status(403).json({message:'Chỉ quản trị viên được ẩn toàn bộ bình luận'});
  post.commentsHidden=Boolean(req.body.hidden);await post.save();res.json(post);
});

/* PATCH /:id/comment-notifications: Cập nhật tùy chọn thông báo bình luận. Middleware auth xác thực người gọi trước handler. */
router.patch('/:id/comment-notifications', auth, async(req,res)=>{
  const post=await Post.findById(req.params.id);if(!post)return res.status(404).json({message:'Không tìm thấy bài đăng'});
  if(String(post.owner)!==req.user.sub)return res.status(403).json({message:'Chỉ chủ bài đăng được thay đổi thông báo bình luận'});
  post.commentNotificationsEnabled=Boolean(req.body.enabled);await post.save();res.json({enabled:post.commentNotificationsEnabled});
});

/* DELETE /:id: Xử lý yêu cầu xóa bài đăng. Middleware auth xác thực người gọi trước handler. */
router.delete('/:id', auth, async (req, res) => {
  if (!['ADMIN', 'STAFF'].includes(req.user.role)) return res.status(403).json({ message: 'Chỉ quản trị viên được xóa bài đăng' });
  const post = await Post.findByIdAndDelete(req.params.id);
  if (!post) return res.status(404).json({ message: 'Không tìm thấy bài đăng' });
  res.json({ message: 'Đã xóa bài đăng' });
});

function parseBody(input) {
  const customLocation = clean(input.customLocation).slice(0, 200);
  return {
    type: input.type,
    title: clean(input.title).slice(0, 150),
    description: clean(input.description).slice(0, 2000),
    category: input.category,
    location: input.location,
    customLocation,
    isOtherLocation: Boolean(customLocation),
    eventDate: input.eventDate,
    colors: Array.isArray(input.colors) ? input.colors.map(clean).slice(0, 5) : [],
    images: Array.isArray(input.images) ? input.images.slice(0, 5) : [],
    secretDetail: clean(input.secretDetail).slice(0, 500),
    contactNote: clean(input.contactNote).slice(0, 300),
    guestEmail: clean(input.guestEmail).toLowerCase().slice(0, 160),
  };
}
function normalize(post) {
  return {
    type: post.type,
    category: String(post.category?._id || post.category),
    location: post.isOtherLocation ? post.customLocation : String(post.location?._id || post.location),
    eventDate: post.eventDate,
    colors: post.colors,
    title: post.title,
    description: post.description,
  };
}
export default router;
