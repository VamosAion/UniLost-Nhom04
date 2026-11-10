/* Các tiện ích dùng chung: kiểm tra đầu vào, chuẩn hóa chuỗi và các thao tác hỗ trợ nghiệp vụ. */
import mongoose from 'mongoose';
import {Notification,AuditLog} from './models.js';
/* Kiểm tra định dạng email sinh viên theo biểu thức của dự án; không xác nhận hộp thư thực sự tồn tại. */
export const validDntuEmail=email=>/^\d{10}@dntu\.edu\.vn$/i.test(String(email||''));
/* Kiểm tra số điện thoại theo danh sách đầu số và độ dài mà phiên bản này chấp nhận. */
export const validPhone=phone=>/^(032|033|034|035|036|037|038|039|081|082|083|084|085|088|070|076|077|078|079|052|056|058|059|099|093)\d{7}$/.test(String(phone||''));
const blockedLanguage=[/\b(l[oồô]n|c[aặ]c|đ[iị]t)\b/i,/\b(m[eẹ]\s*(m[aà]y|ch[uú]ng\s*m[aà]y)|m[aả]\s*cha|đ[iị]t\s*(m[eẹ]|cha|ch[uú]ng\s*m[aà]y))\b/i,/\b(pussy|fuck(?:ing)?|fuck\s*you|son\s*of\s*(?:a|the)?\s*bitch)\b/i];
/* So khớp nội dung với danh sách biểu thức ngôn từ bị chặn. */
export const hasProhibitedLanguage=value=>blockedLanguage.some(pattern=>pattern.test(String(value||'').normalize('NFC')));
/* Chuẩn hóa email; bổ sung tên miền trường khi người dùng chỉ nhập mã sinh viên. */
export const normalizeDntuEmail=value=>{const email=clean(value).toLowerCase();return email.includes('@')?email:`${email}@dntu.edu.vn`;};
/* Loại bỏ chuỗi dạng thẻ HTML và khoảng trắng đầu/cuối; đây là bước chuẩn hóa văn bản. */
export const clean=value=>String(value??'').replace(/<[^>]*>/g,'').trim();
/* Kiểm tra chuỗi có thể dùng làm ObjectId trước khi truy vấn MongoDB. */
export const validId=id=>mongoose.isValidObjectId(id);
/* Chuẩn hóa số trang và giới hạn số bản ghi mỗi lần tải. */
export const pageOptions=query=>({page:Math.max(1,Number(query.page)||1),limit:Math.min(50,Math.max(1,Number(query.limit)||12))});
/* Lưu thông báo cho người nhận; đây là bản ghi trong hệ thống, không phải email. */
export const notify=(recipient,type,message,link='')=>Notification.create({recipient,type,message,link});
/* Lưu dấu vết thao tác để phục vụ kiểm tra lịch sử quản trị. */
export const audit=(actor,action,entityType,entityId,metadata={})=>AuditLog.create({actor,action,entityType,entityId,metadata});
/* Chọn rõ các trường hồ sơ trả về client, không trả toàn bộ tài liệu người dùng. */
export function publicUser(user){return{id:user.id,name:user.name,email:user.email,studentId:user.studentId,phone:user.phone,avatar:user.avatar,role:user.role,status:user.status,warningPoints:user.warningPoints||0,lockedUntil:user.lockedUntil||null,anonymousAlias:user.anonymousAlias||''};}
/* Xác định vai trò có quyền quản lý theo quy tắc của phiên bản. */
export const isModerator=role=>['ADMIN','STAFF'].includes(role);
