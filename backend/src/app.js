/* Khởi tạo Express, middleware và các API. Thứ tự middleware quyết định bước kiểm tra nào chạy trước khi xử lý yêu cầu. */
import express from 'express';
import path from 'node:path';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import postRoutes from './routes/posts.js';
import workflowRoutes from './routes/workflow.js';
import metadataRoutes from './routes/metadata.js';
import adminRoutes from './routes/admin.js';
import socialRoutes from './routes/social.js';
import transferRoutes from './routes/transfers.js';
import guestRoutes from './routes/guest.js';

const app=express();
app.disable('x-powered-by');
app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'},contentSecurityPolicy:false}));
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.FRONTEND_URL || '').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean),
];
app.use(cors({origin(origin,callback){if(!origin||allowedOrigins.includes(origin))return callback(null,true);return callback(Object.assign(new Error('Nguồn truy cập không được phép'),{status:403}));}}));
app.use(express.json({limit:'1mb'}));
app.use(express.urlencoded({extended:false}));
app.use(rateLimit({windowMs:60_000,limit:1200,standardHeaders:true,legacyHeaders:false}));
app.use('/api/auth',rateLimit({windowMs:15*60_000,limit:80,standardHeaders:true,legacyHeaders:false}));
app.use('/api/guest',rateLimit({windowMs:60_000,limit:90,standardHeaders:true,legacyHeaders:false}));
app.use('/uploads',express.static(path.resolve('uploads')));
/* GET /api/health: Đọc dữ liệu của tuyến này. */
app.get('/api/health',(req,res)=>res.json({status:'ok',service:'UniLost API'}));
app.use('/api/auth',authRoutes);
app.use('/api/posts',postRoutes);
app.use('/api',workflowRoutes);
app.use('/api/metadata',metadataRoutes);
app.use('/api/admin',adminRoutes);
app.use('/api',socialRoutes);
app.use('/api',transferRoutes);
app.use('/api/guest',guestRoutes);
app.use((req,res)=>res.status(404).json({message:'Không tìm thấy endpoint'}));
app.use((err,req,res,next)=>{console.error(err);if(err.code==='LIMIT_FILE_SIZE')return res.status(400).json({message:'Ảnh vượt quá 5 MB'});const status=err.status||(err.code===11000?409:500);res.status(status).json({message:err.code===11000?'Dữ liệu đã tồn tại':err.status===403?err.message:'Lỗi máy chủ'});});
export default app;
