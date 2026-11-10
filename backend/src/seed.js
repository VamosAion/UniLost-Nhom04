/* Khởi tạo dữ liệu mẫu để học và chạy thử. Script xóa dữ liệu trong các collection được liệt kê trước khi tạo lại; không chạy trên dữ liệu cần giữ. */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {
  AuditLog, Category, Claim, Comment, Conversation, Handover, Location,
  Message, Notification, PasswordReset, Post, Report, TransferVerification, User,
} from './models.js';

await mongoose.connect(process.env.MONGO_URI);
await Promise.all([
  AuditLog.deleteMany({}), Category.deleteMany({}), Claim.deleteMany({}), Comment.deleteMany({}),
  Conversation.deleteMany({}), Handover.deleteMany({}), Location.deleteMany({}), Message.deleteMany({}),
  Notification.deleteMany({}), PasswordReset.deleteMany({}), Post.deleteMany({}), Report.deleteMany({}), TransferVerification.deleteMany({}), User.deleteMany({}),
]);

const categories = await Category.insertMany(
  ['Ví và giấy tờ', 'Chìa khóa', 'Điện thoại và thiết bị', 'Balo và túi xách', 'Sách và học cụ', 'Khác'].map((name) => ({ name })),
);
const locationNames = [
  'Khu A', 'Khu B', 'Khu G', 'Khu F', 'Xưởng thực tập Cơ Khí', 'Nhà xe trên',
  'Nhà xe dưới', 'Căn tin', 'Sân bóng', 'Thư Viện', 'Khu công viên tự học',
  'Khu tự học cạnh thư viện', 'Bể bơi', 'Sân Pickle Ball', 'Ký túc xá', 'Địa điểm khác',
];
const locations = await Location.insertMany(locationNames.map((name) => ({ name })));

const userHash = await bcrypt.hash('User@123', 10);
const adminHash = await bcrypt.hash('Admin@123', 10);
const [user, other] = await User.create([
  { studentId: '1822030487', name: 'Ngô Trọng Nhân Nghĩa', email: '1822030487@dntu.edu.vn', passwordHash: userHash },
  { studentId: '1822041095', name: 'Trần Thị Hiền', email: '1822041095@dntu.edu.vn', passwordHash: userHash },
  { name: 'Quản trị UniLost', email: 'admin@dntu.edu.vn', passwordHash: adminHash, role: 'ADMIN' },
]);

await Post.create([
  { type: 'LOST', title: 'Mất ví màu đen tại thư viện', description: 'Ví da màu đen, bên trong có thẻ sinh viên.', category: categories[0].id, location: locations[9].id, eventDate: '2026-10-18', colors: ['đen'], secretDetail: 'Mặt trong có ký hiệu riêng', owner: user.id },
  { type: 'FOUND', title: 'Nhặt được chìa khóa gần căn tin', description: 'Một chùm chìa khóa có móc màu xanh.', category: categories[1].id, location: locations[7].id, eventDate: '2026-10-19', colors: ['xanh'], secretDetail: 'Có ba chìa khóa', owner: other.id },
  { type: 'FOUND', title: 'Điện thoại để quên tại Khu A', description: 'Điện thoại có ốp trong suốt.', category: categories[2].id, location: locations[0].id, eventDate: '2026-10-20', colors: ['đen'], owner: other.id },
]);
console.log('Đã tạo dữ liệu mẫu. User: 1822030487@dntu.edu.vn / User@123');
await mongoose.disconnect();
