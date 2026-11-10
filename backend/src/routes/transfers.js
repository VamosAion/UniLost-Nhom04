/* API xác nhận bàn giao bằng mã: kiểm tra bên tham gia, trạng thái và hiệu lực mã trước khi ghi nhận thao tác. */
import crypto from 'node:crypto';
import { Router } from 'express';
import { Claim, Handover, Notification, Post, TransferVerification, User } from '../models.js';
import { auth } from '../auth.js';
import { notify, validId } from '../utils.js';

const router = Router();

/* Tìm yêu cầu đã được xác minh làm căn cứ xác định bên tham gia bàn giao. */
const latestVerifiedClaim = (postId) => Claim.findOne({ post: postId, status: 'VERIFIED' }).sort({ updatedAt: -1 });

/* GET /posts/:id/transfer-options: Đọc phương án bàn giao. Middleware auth xác thực người gọi trước handler. */
router.get('/posts/:id/transfer-options', auth, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'ID không hợp lệ' });
  const post = await Post.findById(req.params.id);
  if (!post || post.status === 'HANDED_TO_LOSER') return res.json({ targets: [] });
  const claim = await latestVerifiedClaim(post.id);
  const admin = await User.findOne({ role: 'ADMIN', status: 'ACTIVE' });
  const finderId = post.type === 'FOUND' ? String(post.owner) : claim ? String(claim.claimant) : '';
  const ownerId = post.type === 'FOUND' ? (claim ? String(claim.claimant) : '') : String(post.owner);
  const targets = [];
  const counterpartIds = {};
  if (post.isGuest && post.type === 'LOST' && post.status === 'WAITING_HANDOVER' && admin) {
    targets.push('HANDED_TO_CTSV'); counterpartIds.HANDED_TO_CTSV = String(admin.id);
  } else
  if (post.status === 'HANDED_TO_CTSV') {
    if (admin && ownerId && [String(admin.id), ownerId].includes(req.user.sub)) {
      targets.push('HANDED_TO_LOSER'); counterpartIds.HANDED_TO_LOSER = req.user.sub === String(admin.id) ? ownerId : String(admin.id);
    }
  } else if (post.status === 'WAITING_HANDOVER') {
    if (admin && finderId && [String(admin.id), finderId].includes(req.user.sub)) {
      targets.push('HANDED_TO_CTSV'); counterpartIds.HANDED_TO_CTSV = req.user.sub === String(admin.id) ? finderId : String(admin.id);
    }
    if (finderId && ownerId && [finderId, ownerId].includes(req.user.sub)) {
      targets.push('HANDED_TO_LOSER'); counterpartIds.HANDED_TO_LOSER = req.user.sub === finderId ? ownerId : finderId;
    }
  }
  const people = await User.find({ _id: { $in: Object.values(counterpartIds) } }).select('name role');
  const byId = Object.fromEntries(people.map((person) => [String(person.id), { id: person.id, name: person.name, role: person.role }]));
  res.json({ targets, counterparts: Object.fromEntries(Object.entries(counterpartIds).map(([key, value]) => [key, byId[value]])) });
});

/* Xác định các bên giao/nhận để áp dụng quy tắc bàn giao phù hợp. */
async function resolveParties(post, actor, targetStatus) {
  const claim = await latestVerifiedClaim(post.id);
  const finderId = post.type === 'FOUND' ? String(post.owner) : claim ? String(claim.claimant) : '';
  const loserId = post.type === 'FOUND' ? (claim ? String(claim.claimant) : '') : String(post.owner);
  const admin = await User.findOne({ role: 'ADMIN', status: 'ACTIVE' });

  if (post.isGuest && post.type === 'LOST' && targetStatus === 'HANDED_TO_CTSV') {
    if (!admin) return { error: 'Chưa xác định được Admin phòng công tác sinh viên' };
    return { claim: null, expectedConfirmer: String(admin.id), method: 'SUPPORT_OFFICE' };
  }

  if (post.status === 'HANDED_TO_CTSV') {
    if (!admin || !loserId) return { error: 'Chưa xác định được Admin hoặc chủ sở hữu' };
    const pair = [String(admin.id), loserId];
    if (!pair.includes(actor.sub)) return { error: 'Chỉ Admin và chủ sở hữu được xác nhận lần bàn giao này' };
    return { claim, expectedConfirmer: actor.sub === pair[0] ? pair[1] : pair[0], method: 'SUPPORT_OFFICE' };
  }

  if (targetStatus === 'HANDED_TO_CTSV') {
    if (!admin || !finderId) return { error: 'Chưa xác định được người giữ đồ hoặc Admin' };
    const pair = [finderId, String(admin.id)];
    if (!pair.includes(actor.sub)) return { error: 'Chỉ người đang giữ đồ và Admin được xác nhận bàn giao' };
    return { claim, expectedConfirmer: actor.sub === pair[0] ? pair[1] : pair[0], method: 'SUPPORT_OFFICE' };
  }

  if (!claim) return { error: 'Cần có một yêu cầu đã được chấp nhận trước khi bàn giao cho chủ sở hữu' };
  const pair = [finderId, loserId];
  if (!pair.includes(actor.sub)) return { error: 'Bạn không thuộc yêu cầu đã được chấp nhận' };
  return { claim, expectedConfirmer: actor.sub === pair[0] ? pair[1] : pair[0], method: 'DIRECT' };
}

/* Sinh mã ngắn phục vụ bước xác nhận bàn giao. */
async function createShortToken() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const token = String(crypto.randomInt(100000, 1000000));
    if (!await TransferVerification.exists({ token })) return token;
  }
  return crypto.randomBytes(12).toString('hex');
}

/* POST /transfers: Xử lý yêu cầu tạo/gửi mã bàn giao. Middleware auth xác thực người gọi trước handler. */
router.post('/transfers', auth, async (req, res) => {
  if (!validId(req.body.postId) || !['HANDED_TO_CTSV', 'HANDED_TO_LOSER'].includes(req.body.targetStatus)) return res.status(400).json({ message: 'Thông tin xác nhận không hợp lệ' });
  const post = await Post.findById(req.body.postId);
  if (!post) return res.status(404).json({ message: 'Không tìm thấy bài đăng' });
  if (post.status === 'HANDED_TO_LOSER') return res.status(400).json({ message: 'Tài sản đã được bàn giao cho chủ sở hữu' });
  if (post.status === 'HANDED_TO_CTSV' && req.body.targetStatus !== 'HANDED_TO_LOSER') return res.status(400).json({ message: 'Tài sản hiện đang ở phòng CTSV' });
  const parties = await resolveParties(post, req.user, req.body.targetStatus);
  if (parties.error) return res.status(403).json({ message: parties.error });
  const previous = await TransferVerification.find({ post: post.id, initiator: req.user.sub, status: 'PENDING' }).select('token');
  if (previous.length) {
    await TransferVerification.updateMany({ _id: { $in: previous.map((item) => item.id) } }, { status: 'CANCELLED', expiresAt: null });
    await Notification.deleteMany({ type: 'TRANSFER_PENDING', link: { $in: previous.map((item) => `/transfers/confirm/${item.token}`) } });
  }
  const transfer = await TransferVerification.create({
    post: post.id, claim: parties.claim?.id || null, initiator: req.user.sub,
    expectedConfirmer: parties.expectedConfirmer, targetStatus: req.body.targetStatus,
    method: parties.method, proofImages: [], token: await createShortToken(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  const pendingLink = `/transfers/confirm/${transfer.token}`;
  const pendingMessage = `Hoàn tất thủ tục bàn giao: ${post.title}`;
  await Promise.all([...new Set([req.user.sub, String(parties.expectedConfirmer)])].map((recipient) => notify(recipient, 'TRANSFER_PENDING', pendingMessage, pendingLink)));
  res.status(201).json({ token: transfer.token, expiresAt: transfer.expiresAt });
});

/* GET /transfers/:token: Đọc mã bàn giao. Middleware auth xác thực người gọi trước handler. */
router.get('/transfers/:token', auth, async (req, res) => {
  const transfer = await TransferVerification.findOne({ token: req.params.token }).populate('post', 'title type status').populate('initiator', 'name email').populate('expectedConfirmer', 'name email');
  if (!transfer) return res.status(404).json({ message: 'Mã QR không tồn tại hoặc đã hết hạn' });
  const allowed=[transfer.initiator?._id&&String(transfer.initiator._id),transfer.expectedConfirmer?._id&&String(transfer.expectedConfirmer._id)].filter(Boolean);
  if (!allowed.includes(req.user.sub) && !['ADMIN', 'STAFF'].includes(req.user.role)) return res.status(403).json({ message: 'Mã QR này không dành cho tài khoản của bạn' });
  res.json(transfer);
});

/* POST /transfers/:token/confirm: Xử lý yêu cầu tạo/gửi mã bàn giao. Middleware auth xác thực người gọi trước handler. */
router.post('/transfers/:token/confirm', auth, async (req, res) => {
  const transfer = await TransferVerification.findOne({ token: req.params.token }).populate('post');
  if (!transfer) return res.status(400).json({ message: 'Mã QR không hợp lệ hoặc đã hết hạn' });
  if (String(transfer.expectedConfirmer) !== req.user.sub) return res.status(403).json({ message: 'Chỉ đúng người nhận hoặc Admin mới được xác nhận mã này' });
  if (transfer.status === 'COMPLETED') return res.json({ message: 'Thủ tục bàn giao đã hoàn tất trước đó', status: transfer.targetStatus, confirmedAt: transfer.confirmedAt, alreadyCompleted: true });
  if (transfer.status !== 'PENDING' || !transfer.expiresAt || transfer.expiresAt <= new Date()) return res.status(400).json({ message: 'Mã QR đã bị hủy hoặc hết hạn' });
  transfer.status = 'COMPLETED'; transfer.confirmedBy = req.user.sub; transfer.confirmedAt = new Date(); transfer.expiresAt = null;
  transfer.post.status = transfer.targetStatus;
  transfer.post.statusProofImages = [];
  transfer.post.statusChangedBy = req.user.sub;
  transfer.post.statusChangedAt = transfer.confirmedAt;
  await Promise.all([transfer.save(), transfer.post.save()]);
  if (transfer.claim) await Handover.findOneAndUpdate({ claim: transfer.claim }, { status: 'COMPLETED', completionImages: [], finderConfirmed: true, receiverConfirmed: true });
  await Notification.deleteMany({ type: 'TRANSFER_PENDING', link: `/transfers/confirm/${transfer.token}` });
  const completedMessage = `Đã hoàn tất ${transfer.targetStatus === 'HANDED_TO_CTSV' ? 'bàn giao cho phòng CTSV' : 'bàn giao cho chủ sở hữu'}`;
  const recipients=[transfer.initiator&&String(transfer.initiator),transfer.expectedConfirmer&&String(transfer.expectedConfirmer)].filter(Boolean);
  await Promise.all([...new Set(recipients)].map((recipient) => notify(recipient, 'TRANSFER_COMPLETED', completedMessage, `/posts/${transfer.post.id}`)));
  res.json({ message: 'Xác nhận bàn giao thành công', status: transfer.targetStatus, confirmedAt: transfer.confirmedAt });
});

/* POST /transfers/:token/cancel: Xử lý yêu cầu tạo/gửi mã bàn giao. Middleware auth xác thực người gọi trước handler. */
router.post('/transfers/:token/cancel', auth, async (req, res) => {
  const transfer = await TransferVerification.findOne({ token: req.params.token, status: 'PENDING' });
  if (!transfer) return res.status(400).json({ message: 'Mã không còn hoạt động' });
  if (String(transfer.initiator) !== req.user.sub) return res.status(403).json({ message: 'Chỉ người tạo mã được hủy phiên bàn giao' });
  transfer.status = 'CANCELLED'; transfer.expiresAt = null; await transfer.save();
  await Notification.deleteMany({ type: 'TRANSFER_PENDING', link: `/transfers/confirm/${transfer.token}` });
  res.json({ message: 'Đã hủy mã bàn giao' });
});

/* GET /posts/:id/transfers: Đọc mã bàn giao. Middleware auth xác thực người gọi trước handler. */
router.get('/posts/:id/transfers', auth, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'ID không hợp lệ' });
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Không tìm thấy bài đăng' });
  const claimIds = await Claim.find({ post: post.id, claimant: req.user.sub }).distinct('_id');
  if (String(post.owner) !== req.user.sub && !['ADMIN', 'STAFF'].includes(req.user.role) && !claimIds.length) return res.status(403).json({ message: 'Bạn không có quyền xem lịch sử bàn giao' });
  res.json(await TransferVerification.find({ post: post.id, status: 'COMPLETED' }).populate('initiator', 'name email').populate('confirmedBy', 'name email').sort({ confirmedAt: -1 }));
});

export default router;
