/* Gửi email qua SMTP khi đã cấu hình. Cấu hình được lấy từ biến môi trường, không ghi thông tin đăng nhập SMTP vào mã nguồn. */
import nodemailer from 'nodemailer';

/* Chỉ coi SMTP đã sẵn sàng khi có máy chủ, tên đăng nhập và mật khẩu. */
export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/* Khởi tạo SMTP transport từ môi trường và gửi thư; trả false nếu thiếu cấu hình hoặc người nhận. */
export async function sendMail({ to, subject, text, html }) {
  if (!mailConfigured() || !to) return false;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
  return true;
}
