/* API tài khoản: đăng ký/đăng nhập và các chức năng hồ sơ được triển khai trong phiên bản này. */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { PasswordReset, RegistrationVerification, User } from '../models.js';
import { sendMail } from '../mailer.js';
import { applyWarningDecay } from '../moderation.js';
import { auth, sign } from '../auth.js';
import { clean, publicUser, validDntuEmail, validPhone, normalizeDntuEmail } from '../utils.js';

const router = Router();
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: 'uploads',
    filename: (req, file, cb) => cb(null, `avatar-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

/* POST /register/send-code: Xử lý yêu cầu tạo/gửi mã xác minh đăng ký. */
router.post('/register/send-code', async (req, res) => {
  const email = normalizeDntuEmail(req.body.email);
  if (!validDntuEmail(email)) return res.status(400).json({ message: 'Email phải đúng định dạng: 10 chữ số mã sinh viên@dntu.edu.vn' });
  if (await User.exists({ email })) return res.status(409).json({ message: 'Email này đã được đăng ký' });
  const recent = await RegistrationVerification.findOne({ email, createdAt: { $gt: new Date(Date.now() - 60 * 1000) } });
  if (recent) return res.json({ message: 'Mã đã được gửi. Vui lòng chờ một phút trước khi gửi lại.' });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await RegistrationVerification.deleteMany({ email });
  const row = await RegistrationVerification.create({ email, codeHash: await bcrypt.hash(code, 10), expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
  try { const sent = await sendMail({ to: email, subject: 'Mã xác minh đăng ký UniLost', text: `Mã xác minh đăng ký của bạn là ${code}. Mã có hiệu lực trong 10 phút.` }); if (!sent) throw new Error('SMTP chưa được cấu hình'); }
  catch (error) { await RegistrationVerification.deleteOne({ _id: row.id }); return res.status(503).json({ message: 'Không thể gửi email xác minh. Vui lòng kiểm tra cấu hình Gmail.' }); }
  res.json({ message: 'Đã gửi mã xác minh đến email DNTU.' });
});

/* POST /register: Xử lý yêu cầu tạo/gửi tài khoản đăng ký. */
router.post('/register', async (req, res, next) => {
  try {
    const name = clean(req.body.name);
    const email = normalizeDntuEmail(req.body.email);
    const password = String(req.body.password || '');
    if (!validDntuEmail(email)) return res.status(400).json({ message: 'Email phải đúng định dạng: 10 chữ số mã sinh viên@dntu.edu.vn' });
    if (name.length < 2) return res.status(400).json({ message: 'Họ tên phải có ít nhất 2 ký tự' });
    if (password.length < 8) return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 8 ký tự' });
    const verification = await RegistrationVerification.findOne({ email, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
    if (!verification || verification.attempts >= 5 || !await bcrypt.compare(String(req.body.code || ''), verification.codeHash)) {
      if (verification) { verification.attempts += 1; await verification.save(); }
      return res.status(400).json({ message: 'Mã xác minh không đúng hoặc đã hết hạn' });
    }
    const user = await User.create({ name, email, studentId: email.split('@')[0], passwordHash: await bcrypt.hash(password, 10) });
    await RegistrationVerification.deleteMany({ email });
    res.status(201).json({ token: sign(user, Boolean(req.body.remember)), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

/* POST /login: Xử lý yêu cầu tạo/gửi phiên đăng nhập. */
router.post('/login', async (req, res) => {
  const email = normalizeDntuEmail(req.body.email);
  if (!/^[^\s@]+@dntu\.edu\.vn$/i.test(email)) return res.status(400).json({ message: 'Sai định dạng email. Vui lòng sử dụng email DNTU' });
  const user = await User.findOne({ email }).select('+passwordHash');
  if(user) await applyWarningDecay(user);
  if (!user || user.status !== 'ACTIVE' || !await bcrypt.compare(String(req.body.password || ''), user.passwordHash)) {
    return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
  }
  res.json({ token: sign(user, Boolean(req.body.remember)), user: publicUser(user) });
});

/* POST /forgot-password: Xử lý yêu cầu tạo/gửi mã khôi phục mật khẩu. */
router.post('/forgot-password', async (req, res) => {
  const email = normalizeDntuEmail(req.body.email);
  if (!validDntuEmail(email)) return res.status(400).json({ message: 'Vui lòng nhập đúng email sinh viên DNTU' });
  const user = await User.findOne({ email });
  if (user) {
    const recentReset = await PasswordReset.findOne({ user: user.id, createdAt: { $gt: new Date(Date.now() - 60 * 1000) } });
    if (recentReset) return res.json({ message: 'Mã xác nhận đã được gửi. Vui lòng kiểm tra hộp thư hoặc hòm thư rác nếu không thấy mã.' });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await PasswordReset.deleteMany({ user: user.id });
    const resetRequest = await PasswordReset.create({ user: user.id, codeHash: await bcrypt.hash(code, 10), expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      try {
        await transport.sendMail({
          from: process.env.MAIL_FROM || process.env.SMTP_USER,
          to: email,
          subject: 'Mã khôi phục mật khẩu UniLost',
          text: `Mã xác nhận của bạn là ${code}. Mã có hiệu lực trong 10 phút.`,
        });
      } catch (error) {
        await PasswordReset.deleteOne({ _id: resetRequest.id });
        throw error;
      }
    } else {
      console.log(`[DEV] Mã khôi phục cho ${email}: ${code}`);
    }
  }
  res.json({ message: 'Mã xác nhận đã được gửi. Vui lòng kiểm tra hộp thư hoặc hòm thư rác nếu không thấy mã.' });
});

/* POST /reset-password: Xử lý yêu cầu tạo/gửi mật khẩu mới sau xác minh. */
router.post('/reset-password', async (req, res) => {
  const email = normalizeDntuEmail(req.body.email);
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ message: 'Mã xác nhận không hợp lệ hoặc đã hết hạn' });
  const reset = await PasswordReset.findOne({ user: user.id, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!reset || reset.attempts >= 5 || !await bcrypt.compare(String(req.body.code || ''), reset.codeHash)) {
    if (reset) { reset.attempts += 1; await reset.save(); }
    return res.status(400).json({ message: 'Mã xác nhận không hợp lệ hoặc đã hết hạn' });
  }
  if (String(req.body.newPassword || '').length < 8) return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
  user.passwordHash = await bcrypt.hash(req.body.newPassword, 10);
  await user.save();
  await PasswordReset.deleteMany({ user: user.id });
  res.json({ message: 'Đặt lại mật khẩu thành công' });
});

/* GET /me: Đọc hồ sơ hiện tại. Middleware auth xác thực người gọi trước handler. */
router.get('/me', auth, async (req, res) => {
  const user = await User.findById(req.user.sub);
  if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
  res.json(publicUser(user));
});

/* PATCH /me: Cập nhật hồ sơ hiện tại. Middleware auth xác thực người gọi trước handler. */
router.patch('/me', auth, async (req, res) => {
  const update = {};
  if (req.body.name) update.name = clean(req.body.name).slice(0, 100);
  if (req.body.phone !== undefined) {
    update.phone = clean(req.body.phone);
    if (update.phone && !validPhone(update.phone)) return res.status(400).json({ message: 'Số điện thoại phải gồm 10 số và thuộc đầu số được hỗ trợ' });
  }
  if (req.body.anonymousAlias !== undefined) {
    update.anonymousAlias = clean(req.body.anonymousAlias).replace(/^@+/, '').slice(0, 40);
    if (update.anonymousAlias && !/^[\p{L}\p{N}_. -]{2,40}$/u.test(update.anonymousAlias)) return res.status(400).json({ message: 'Biệt danh ẩn danh phải có 2–40 ký tự và không chứa ký tự đặc biệt' });
  }
  const user = await User.findByIdAndUpdate(req.user.sub, update, { new: true, runValidators: true });
  res.json(publicUser(user));
});

/* POST /avatar: Xử lý yêu cầu tạo/gửi ảnh đại diện. Middleware auth xác thực người gọi trước handler. */
router.post('/avatar', auth, avatarUpload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Vui lòng chọn ảnh JPG, PNG hoặc WebP' });
  const user = await User.findByIdAndUpdate(req.user.sub, { avatar: `/uploads/${req.file.filename}` }, { new: true });
  res.json(publicUser(user));
});

/* PATCH /password: Cập nhật mật khẩu. Middleware auth xác thực người gọi trước handler. */
router.patch('/password', auth, async (req, res) => {
  const user = await User.findById(req.user.sub).select('+passwordHash');
  if (!await bcrypt.compare(String(req.body.currentPassword || ''), user.passwordHash)) return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
  if (String(req.body.newPassword || '').length < 8) return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
  user.passwordHash = await bcrypt.hash(req.body.newPassword, 10);
  await user.save();
  res.json({ message: 'Đổi mật khẩu thành công' });
});
export default router;
