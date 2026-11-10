/* Các hàm cấp/kiểm tra JWT và phân quyền. Kiểm tra ở backend bảo vệ API ngay cả khi người gọi bỏ qua giao diện. */
import jwt from 'jsonwebtoken';
import { User } from './models.js';
import { applyWarningDecay } from './moderation.js';
/* Tạo JWT từ định danh và vai trò; thời hạn lấy theo chính sách đăng nhập của phiên bản. */
export function sign(user,remember=false){return jwt.sign({sub:user.id,role:user.role},process.env.JWT_SECRET,{expiresIn:remember?'30d':'12h'});}
/* Kiểm tra chữ ký token rồi đọc lại tài khoản để áp dụng trạng thái/quyền hiện tại trong database. */
async function activePayload(token){const payload=jwt.verify(token,process.env.JWT_SECRET);const user=await User.findById(payload.sub).select('role status lockedUntil email warningPoints warningPointsUpdatedAt warningTenSentAt');if(!user)throw new Error('missing');await applyWarningDecay(user);if(user.status!=='ACTIVE')throw Object.assign(new Error('locked'),{locked:true,lockedUntil:user.lockedUntil});return{sub:String(user.id),role:user.role,email:user.email};}
/* Yêu cầu token hợp lệ; gắn người dùng vào req.user để các middleware tiếp theo sử dụng. */
export async function auth(req,res,next){const token=req.headers.authorization?.replace('Bearer ','');if(!token)return res.status(401).json({message:'Bạn chưa đăng nhập'});try{req.user=await activePayload(token);next();}catch(error){return res.status(401).json({message:error.locked?'Tài khoản đang bị khóa tạm thời':'Phiên đăng nhập không hợp lệ',lockedUntil:error.lockedUntil||null});}}
/* Sinh middleware chỉ cho phép những vai trò được truyền vào. */
export const allow=(...roles)=>(req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({message:'Bạn không có quyền thực hiện'});
/* Bổ sung người dùng nếu token hợp lệ; yêu cầu không có phiên hợp lệ vẫn được chuyển tiếp như khách. */
export async function optionalAuth(req,res,next){const token=req.headers.authorization?.replace('Bearer ','');if(token){try{req.user=await activePayload(token);}catch{}}next();}
