/* Xử lý trạng thái kiểm duyệt và thông báo liên quan; dữ liệu được đồng bộ với MongoDB. */
import { Notification, Post, User } from './models.js';

/* Giảm điểm cảnh cáo theo số ngày đã qua và mở khóa nếu đã hết thời hạn. */
export async function applyWarningDecay(user) {
  if (!user) return user;
  const now = new Date();
  const base = user.warningPointsUpdatedAt || user.updatedAt || now;
  const elapsedDays = Math.floor((now.getTime() - new Date(base).getTime()) / 86400000);
  if (elapsedDays > 0) {
    user.warningPoints = Math.max(0, (user.warningPoints || 0) - elapsedDays);
    user.warningPointsUpdatedAt = new Date(new Date(base).getTime() + elapsedDays * 86400000);
    if (user.warningPoints < 10) user.warningTenSentAt = null;
  }
  if (user.status === 'LOCKED' && user.lockedUntil && user.lockedUntil <= now) {
    user.status = 'ACTIVE'; user.lockedUntil = null;
  }
  if (user.isModified()) await user.save();
  return user;
}

/* Đồng bộ thông báo bài khách chờ duyệt cho các tài khoản quản lý đang hoạt động. */
export async function syncGuestReviewNotifications() {
  const count = await Post.countDocuments({ isGuest: true, approvalStatus: 'PENDING' });
  const moderators = await User.find({ role: { $in: ['ADMIN', 'STAFF'] }, status: 'ACTIVE' }).select('_id');
  const recipientIds = moderators.map((item) => item._id);
  await Notification.deleteMany({ type: 'GUEST_POST_PENDING', recipient: { $nin: recipientIds } });
  if (!count) {
    await Notification.deleteMany({ type: 'GUEST_POST_PENDING', recipient: { $in: recipientIds } });
    return;
  }
  await Promise.all(recipientIds.map((recipient) => Notification.findOneAndUpdate(
    { recipient, type: 'GUEST_POST_PENDING' },
    { message: `Có ${count} bài đăng khách cần duyệt`, link: '/admin?tab=guest-posts', read: false },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )));
}
