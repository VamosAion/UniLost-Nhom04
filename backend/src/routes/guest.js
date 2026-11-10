/* API cho bài đăng khách: tìm bài qua token quản lý trước khi xử lý yêu cầu hoặc bàn giao. */
import crypto from 'node:crypto';
import { Router } from 'express';
import { Claim, Notification, Post, TransferVerification } from '../models.js';
import { clean, notify, validId } from '../utils.js';

const router = Router();
const tokenHash = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const findPost = token => Post.findOne({ isGuest: true, guestManagementTokenHash: tokenHash(token) }).select('+guestManagementTokenHash +guestManagementCodeHash');
async function shortToken(){for(let i=0;i<10;i+=1){const value=String(crypto.randomInt(100000,1000000));if(!await TransferVerification.exists({token:value}))return value;}return crypto.randomBytes(12).toString('hex');}

/* GET /posts/:token: Đọc bài đăng. */
router.get('/posts/:token', async (req,res)=>{
  const post=await findPost(req.params.token);if(!post)return res.status(404).json({message:'Đường dẫn quản lý không hợp lệ hoặc đã hết hạn'});
  const result=post.toObject();delete result.guestManagementTokenHash;delete result.guestManagementCodeHash;delete result.guestIpHash;
  const claims=await Claim.find({post:post.id}).populate('claimant','name email avatar').sort({createdAt:-1});
  res.json({post:result,claims});
});

/* PATCH /posts/:token/claims/:claimId: Cập nhật yêu cầu nhận/trả đồ. */
router.patch('/posts/:token/claims/:claimId', async (req,res)=>{
  const post=await findPost(req.params.token);if(!post)return res.status(404).json({message:'Đường dẫn quản lý không hợp lệ'});
  const claim=await Claim.findOne({_id:req.params.claimId,post:post.id,assignedToGuest:true});if(!claim)return res.status(404).json({message:'Không tìm thấy yêu cầu'});
  if(!['VERIFIED','REJECTED'].includes(req.body.status))return res.status(400).json({message:'Trạng thái không hợp lệ'});
  claim.status=req.body.status;claim.reviewNote=clean(req.body.reviewNote).slice(0,500);await claim.save();
  await notify(claim.claimant,claim.status==='VERIFIED'?'CLAIM_ACCEPTED':'CLAIM_REJECTED',claim.status==='VERIFIED'?'Người giữ đồ đã chấp nhận yêu cầu của bạn':`Yêu cầu bị từ chối${claim.reviewNote?`: ${claim.reviewNote}`:''}`,`/claims?tab=mine&claim=${claim.id}`);
  res.json(claim);
});

/* POST /posts/:token/claims/:claimId/transfers: Xử lý yêu cầu tạo/gửi mã bàn giao. */
router.post('/posts/:token/claims/:claimId/transfers', async (req,res)=>{
  const post=await findPost(req.params.token);if(!post)return res.status(404).json({message:'Đường dẫn quản lý không hợp lệ'});
  const claim=await Claim.findOne({_id:req.params.claimId,post:post.id,assignedToGuest:true,status:'VERIFIED'});if(!claim)return res.status(400).json({message:'Yêu cầu chưa được chấp nhận'});
  await TransferVerification.updateMany({post:post.id,guestInitiator:true,status:'PENDING'},{status:'CANCELLED',expiresAt:null});
  const transfer=await TransferVerification.create({post:post.id,claim:claim.id,initiator:null,guestInitiator:true,expectedConfirmer:claim.claimant,targetStatus:'HANDED_TO_LOSER',method:'DIRECT',token:await shortToken(),expiresAt:new Date(Date.now()+10*60*1000)});
  await notify(claim.claimant,'TRANSFER_PENDING',`Hoàn tất thủ tục bàn giao: ${post.title}`,`/transfers/confirm/${transfer.token}`);
  res.status(201).json({token:transfer.token,expiresAt:transfer.expiresAt});
});

export default router;
