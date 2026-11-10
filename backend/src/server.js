/* Điểm khởi động backend: nạp môi trường, kết nối MongoDB rồi mở API trên địa chỉ loopback của máy. */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from './app.js';
import { Category, Claim, Location, Notification, Post, User } from './models.js';
import { syncGuestReviewNotifications } from './moderation.js';

const port = process.env.PORT || 5000;
const requiredLocations = [
  'Khu A', 'Khu B', 'Khu G', 'Khu F', 'Xưởng thực tập Cơ Khí', 'Nhà xe trên',
  'Nhà xe dưới', 'Căn tin', 'Sân bóng', 'Thư Viện', 'Khu công viên tự học',
  'Khu tự học cạnh thư viện', 'Bể bơi', 'Sân Pickle Ball', 'Ký túc xá', 'Địa điểm khác',
];
const requiredCategories = [
  'Ví và giấy tờ', 'Chìa khóa', 'Điện thoại và thiết bị', 'Balo và túi xách',
  'Sách và học cụ', 'Quần áo và phụ kiện', 'Thẻ sinh viên và thẻ xe', 'Khác',
];

/* Bổ sung danh mục, địa điểm và tài khoản quản trị cần thiết khi khởi động; khác với seed xóa rồi tạo lại dữ liệu mẫu. */
async function ensureRequiredData() {
  await Category.bulkWrite(requiredCategories.map((name) => ({
    updateOne: { filter: { name }, update: { $set: { active: true } }, upsert: true },
  })));

  await Location.updateMany({ name: { $nin: requiredLocations } }, { active: false });
  await Location.bulkWrite(requiredLocations.map((name) => ({
    updateOne: { filter: { name }, update: { $set: { active: true } }, upsert: true },
  })));

  const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@dntu.edu.vn').trim().toLowerCase();
  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({
      name: 'Quản trị UniLost',
      email: adminEmail,
      passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123', 10),
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    console.log(`Đã tạo tài khoản Admin mặc định: ${adminEmail}`);
  } else if (admin.role !== 'ADMIN' || admin.status !== 'ACTIVE') {
    admin.role = 'ADMIN';
    admin.status = 'ACTIVE';
    await admin.save();
  }
  return admin;
}

if (process.env.NODE_ENV === 'production') {
  for (const name of ['MONGO_URI', 'JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD']) {
    if (!process.env[name]) throw new Error(`Missing required production setting: ${name}`);
  }
  if (process.env.ADMIN_PASSWORD === 'Admin@123' || process.env.JWT_SECRET.length < 32) {
    throw new Error('Set a strong ADMIN_PASSWORD and a JWT_SECRET of at least 32 characters.');
  }
}
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000, heartbeatFrequencyMS: 5000 }).then(async () => {
  const admin = await ensureRequiredData();
  if (process.env.NODE_ENV !== 'production') {
  await User.updateMany({ _id: { $ne: admin.id }, role: 'ADMIN' }, { role: 'STAFF' });
  await Post.updateMany({ status: { $in: ['OPEN', 'MATCHED', 'HANDOVER_PENDING'] } }, { status: 'WAITING_HANDOVER' });
  await Post.updateMany({ status: 'RETURNED', resolutionType: 'SUPPORT_OFFICE' }, { status: 'HANDED_TO_CTSV' });
  await Post.updateMany({ status: 'RETURNED', resolutionType: { $ne: 'SUPPORT_OFFICE' } }, { status: 'HANDED_TO_LOSER' });
  await Post.updateMany({ approvalStatus: { $exists: false } }, { approvalStatus: 'APPROVED' });
  await Notification.updateMany({ type: 'NEW_CLAIM', link: '/claims' }, { link: '/claims?tab=received' });
  await Notification.updateMany({ type: 'CLAIM_STATUS', link: '/claims' }, { link: '/claims?tab=mine' });
  await Notification.deleteMany({ type: { $in: ['MESSAGE', 'CLAIM_STATUS', 'HANDOVER', 'TRANSFER_QR'] } });
  const unassignedClaims = await Claim.find({ assignedTo: null }).populate('post', 'owner status');
  for (const claim of unassignedClaims) {
    claim.assignedTo = claim.post?.status === 'HANDED_TO_CTSV' ? admin?.id : claim.post?.owner;
    if (claim.assignedTo) await claim.save();
  }
  await syncGuestReviewNotifications();
  }
  const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
  app.listen(port, host, () => console.log(`UniLost API running on ${host}:${port}`));
}).catch((error) => {
  console.error('Không thể kết nối MongoDB:', error.message);
  process.exit(1);
});
