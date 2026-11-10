/* Cung cấp danh mục và địa điểm để giao diện xây dựng danh sách lựa chọn. */
import {Router} from 'express';
import {Category,Location} from '../models.js';
const router=Router();
/* GET /categories: Đọc danh mục. */
router.get('/categories',async(req,res)=>res.json(await Category.find({active:true}).sort({name:1})));
/* GET /locations: Đọc địa điểm. */
router.get('/locations',async(req,res)=>res.json(await Location.find({active:true}).sort({name:1})));
export default router;
