import request from 'supertest';import app from '../src/app.js';
test('GET /api/health trả trạng thái hoạt động',async()=>{const response=await request(app).get('/api/health');expect(response.status).toBe(200);expect(response.body.status).toBe('ok');});
test('endpoint không tồn tại trả 404',async()=>{const response=await request(app).get('/api/not-found');expect(response.status).toBe(404);});
test('cho phép truy cập API từ localhost cổng 5173',async()=>{const response=await request(app).get('/api/health').set('Origin','http://localhost:5173');expect(response.status).toBe(200);expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');});
test('từ chối origin ngoài danh sách',async()=>{const response=await request(app).get('/api/health').set('Origin','http://example.com');expect(response.status).toBe(403);});
