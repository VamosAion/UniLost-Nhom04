/* Mô hình MongoDB/Mongoose: định nghĩa trường dữ liệu, giá trị mặc định, quan hệ tham chiếu và chỉ mục. */
import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const opts = { timestamps: true };

/* Mô hình User: lưu tài khoản và phân quyền. Các ref nối tới tài liệu liên quan, không nhúng toàn bộ dữ liệu. */
export const User = model('User', new Schema({
  studentId: { type: String, unique: true, sparse: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true, select: false },
  phone: { type: String, default: '' },
  avatar: { type: String, default: '' },
  role: { type: String, enum: ['USER', 'STAFF', 'ADMIN'], default: 'USER' },
  status: { type: String, enum: ['ACTIVE', 'LOCKED'], default: 'ACTIVE' },
  warningPoints: { type: Number, default: 0, min: 0 },
  warningPointsUpdatedAt: { type: Date, default: Date.now },
  warningTenSentAt: { type: Date, default: null },
  lockedUntil: { type: Date, default: null },
  anonymousAlias: { type: String, trim: true, maxlength: 40, default: '' },
}, opts));

/* Mô hình Category: lưu danh mục đồ vật. Các ref nối tới tài liệu liên quan, không nhúng toàn bộ dữ liệu. */
export const Category = model('Category', new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: '' },
  active: { type: Boolean, default: true },
}, opts));

/* Mô hình Location: lưu địa điểm. Các ref nối tới tài liệu liên quan, không nhúng toàn bộ dữ liệu. */
export const Location = model('Location', new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  building: { type: String, default: '' },
  description: { type: String, default: '' },
  active: { type: Boolean, default: true },
}, opts));

const postSchema = new Schema({
  type: { type: String, enum: ['LOST', 'FOUND'], required: true },
  title: { type: String, required: true, maxlength: 150, trim: true },
  description: { type: String, required: true, maxlength: 2000, trim: true },
  category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  location: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
  customLocation: { type: String, maxlength: 200, default: '' },
  isOtherLocation: { type: Boolean, default: false },
  eventDate: { type: Date, required: true },
  colors: [String],
  images: [String],
  secretDetail: { type: String, select: false, maxlength: 500 },
  contactNote: { type: String, maxlength: 300, default: '' },
  status: { type: String, enum: ['WAITING_HANDOVER', 'HANDED_TO_CTSV', 'HANDED_TO_LOSER', 'CLOSED', 'HIDDEN'], default: 'WAITING_HANDOVER' },
  statusProofImages: [String],
  statusChangedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  statusChangedAt: { type: Date, default: null },
  commentsEnabled: { type: Boolean, default: true },
  commentsHidden: { type: Boolean, default: false },
  commentNotificationsEnabled: { type: Boolean, default: true },
  guestCompletionRequestedAt: { type: Date, default: null },
  resolutionType: { type: String, enum: ['', 'RECEIVED_BACK', 'RETURNED_TO_OWNER', 'SUPPORT_OFFICE'], default: '' },
  owner: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  isGuest: { type: Boolean, default: false },
  guestName: { type: String, maxlength: 100, default: '' },
  guestPhone: { type: String, maxlength: 20, default: '' },
  guestEmail: { type: String, maxlength: 160, lowercase: true, default: '' },
  guestHandling: { type: String, enum: ['', 'KEEP', 'CTSV'], default: '' },
  guestCtsvMethod: { type: String, enum: ['', 'SELF_DROP', 'ADMIN_PICKUP'], default: '' },
  guestManagementTokenHash: { type: String, select: false, default: '', index: true },
  guestManagementCodeHash: { type: String, select: false, default: '' },
  guestIpHash: { type: String, select: false, default: '' },
  approvalStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'APPROVED', index: true },
  approvalNote: { type: String, maxlength: 300, default: '' },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
}, opts);
postSchema.index({ title: 'text', description: 'text', customLocation: 'text' });
postSchema.index({ type: 1, status: 1, category: 1, createdAt: -1 });
postSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
/* Mô hình Post: lưu bài đăng mất/nhặt đồ. Các ref nối tới tài liệu liên quan, không nhúng toàn bộ dữ liệu. */
export const Post = model('Post', postSchema);

/* Mô hình Claim: lưu yêu cầu nhận/trả đồ. Các ref nối tới tài liệu liên quan, không nhúng toàn bộ dữ liệu. */
export const Claim = model('Claim', new Schema({
  post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
  claimant: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  assignedToGuest: { type: Boolean, default: false },
  proof: { type: String, required: true, maxlength: 1000 },
  proofImages: [String],
  status: { type: String, enum: ['PENDING', 'VERIFIED', 'REJECTED', 'CANCELLED'], default: 'PENDING' },
  reviewNote: { type: String, maxlength: 500, default: '' },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, opts));

/* Mô hình Handover: lưu lịch và xác nhận bàn giao. Các ref nối tới tài liệu liên quan, không nhúng toàn bộ dữ liệu. */
export const Handover = model('Handover', new Schema({
  claim: { type: Schema.Types.ObjectId, ref: 'Claim', required: true, unique: true },
  method: { type: String, enum: ['DIRECT', 'SUPPORT_OFFICE'], required: true },
  finderLocation: { type: String, required: true, maxlength: 200 },
  finderScheduledAt: { type: Date, required: true },
  receiverLocation: { type: String, maxlength: 200, default: '' },
  receiverScheduledAt: { type: Date, default: null },
  note: { type: String, maxlength: 500, default: '' },
  completionImages: [String],
  finderConfirmed: { type: Boolean, default: false },
  receiverConfirmed: { type: Boolean, default: false },
  status: { type: String, enum: ['FINDER_SCHEDULED', 'RECEIVER_SCHEDULED', 'COMPLETED', 'CANCELLED'], default: 'FINDER_SCHEDULED' },
}, opts));

const transferVerificationSchema = new Schema({
  post: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  claim: { type: Schema.Types.ObjectId, ref: 'Claim', default: null },
  initiator: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  guestInitiator: { type: Boolean, default: false },
  expectedConfirmer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  confirmedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  targetStatus: { type: String, enum: ['HANDED_TO_CTSV', 'HANDED_TO_LOSER'], required: true },
  method: { type: String, enum: ['SUPPORT_OFFICE', 'DIRECT'], required: true },
  token: { type: String, required: true, unique: true, index: true },
  proofImages: { type: [String], default: [] },
  status: { type: String, enum: ['PENDING', 'COMPLETED', 'CANCELLED'], default: 'PENDING' },
  confirmedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
}, opts);
transferVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
/* Mô hình TransferVerification: lưu mã xác nhận bàn giao. Các ref nối tới tài liệu liên quan, không nhúng toàn bộ dữ liệu. */
export const TransferVerification = model('TransferVerification', transferVerificationSchema);

/* Mô hình Comment: lưu bình luận. Các ref nối tới tài liệu liên quan, không nhúng toàn bộ dữ liệu. */
export const Comment = model('Comment', new Schema({
  post: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  parent: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
  content: { type: String, maxlength: 1000, default: '' },
  images: { type: [String], default: [] },
  anonymousAlias: { type: String, maxlength: 40, default: '' },
  isAnonymous: { type: Boolean, default: false },
  hidden: { type: Boolean, default: false },
  editedAt: { type: Date, default: null },
}, opts));

/* Mô hình Conversation: lưu hội thoại. Các ref nối tới tài liệu liên quan, không nhúng toàn bộ dữ liệu. */
export const Conversation = model('Conversation', new Schema({
  participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  pendingPost: { type: Schema.Types.ObjectId, ref: 'Post', default: null },
  hiddenFor: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  clearedFor: [{ user: { type: Schema.Types.ObjectId, ref: 'User' }, at: { type: Date, required: true } }],
  lastMessageAt: { type: Date, default: Date.now },
}, opts));

/* Mô hình Message: lưu tin nhắn. Các ref nối tới tài liệu liên quan, không nhúng toàn bộ dữ liệu. */
export const Message = model('Message', new Schema({
  conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  post: { type: Schema.Types.ObjectId, ref: 'Post', default: null },
  content: { type: String, maxlength: 2000, default: '' },
  images: { type: [String], default: [] },
  readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  hiddenFor: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  editedAt: { type: Date, default: null },
  recalledAt: { type: Date, default: null },
  // Giữ trường cũ để đọc dữ liệu v2.8.0; v2.9.0 không dùng deletedAt cho thao tác xóa mới.
  deletedAt: { type: Date, default: null },
}, opts));

export const PasswordReset = model('PasswordReset', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
}, opts));
PasswordReset.schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RegistrationVerification = model('RegistrationVerification', new Schema({
  email: { type: String, required: true, lowercase: true, index: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
}, opts));
RegistrationVerification.schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/* Mô hình Notification: lưu thông báo. Các ref nối tới tài liệu liên quan, không nhúng toàn bộ dữ liệu. */
export const Notification = model('Notification', new Schema({
  recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true },
  message: { type: String, required: true, maxlength: 300 },
  link: { type: String, default: '' },
  read: { type: Boolean, default: false },
}, opts));

/* Mô hình Report: lưu báo cáo vi phạm. Các ref nối tới tài liệu liên quan, không nhúng toàn bộ dữ liệu. */
export const Report = model('Report', new Schema({
  targetType: { type: String, enum: ['POST', 'USER', 'COMMENT'], default: 'POST', index: true },
  post: { type: Schema.Types.ObjectId, ref: 'Post', default: null },
  user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  comment: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
  reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reasonCode: { type: String, maxlength: 60, default: 'OTHER' },
  reason: { type: String, required: true, maxlength: 500 },
  evidenceImages: { type: [String], default: [] },
  status: { type: String, enum: ['PENDING', 'RESOLVED', 'REJECTED'], default: 'PENDING' },
  action: { type: String, enum: ['', 'WARN', 'DELETE_CONTENT', 'DISMISS'], default: '' },
  warningPointsApplied: { type: Number, default: 0 },
  resolution: { type: String, maxlength: 500, default: '' },
  resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, opts));

/* Mô hình AuditLog: lưu lịch sử thao tác. Các ref nối tới tài liệu liên quan, không nhúng toàn bộ dữ liệu. */
export const AuditLog = model('AuditLog', new Schema({
  actor: { type: Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: Schema.Types.ObjectId,
  metadata: Schema.Types.Mixed,
}, opts));
