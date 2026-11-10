# UniLost 2.9.4

- L5: API hồ sơ từ chối số điện thoại sai độ dài thay vì tự cắt số.
- L8: Tên ca kiểm thử ghi đúng đầu số 085.

## Thay đổi v2.9.4

Phát triển từ v2.9.3 hotfix thuộc bộ 27 phiên bản, giữ các sửa lỗi L5 và L8.

- Hồ sơ và bài đăng khách giữ nguyên số điện thoại người dùng nhập; bỏ cắt 10 ký tự và bỏ tự xóa ký tự không phải số. Trình duyệt kiểm tra đúng 10 chữ số và đầu số được hỗ trợ trước khi gửi.
- Xóa thông báo thành công cũ khi bắt đầu lưu lại hồ sơ.
- Footer dùng cùng hai màu với header, gradient đảo chiều: trái nhạt (#0758a8), phải đậm (#09345e); chữ trắng.

Website hỗ trợ tìm và trao trả đồ thất lạc tại DNTU. Đây là bản mã nguồn đã sắp xếp lại để chạy trên **chính máy đang sử dụng**, với hướng dẫn và chú thích tiếng Việt. Chức năng và giới hạn của phiên bản gốc được giữ nguyên.

## 1. Phạm vi phiên bản

- Đọc danh sách và tìm kiếm bài đăng mất/nhặt đồ.
- Giao diện tài khoản, tạo bài, xem chi tiết và yêu cầu nhận/trả đồ.
- Các trang cụ thể được liệt kê ở phần bản đồ mã nguồn bên dưới; quyền thao tác do backend quyết định.
- Tương tác qua hồ sơ, bình luận và tin nhắn theo API của bản này.
- Luồng bàn giao sử dụng mã xác nhận/QR.
- API quản lý bài đăng khách qua token.
- Chính sách sửa tin trong 15 phút và xử lý tin đã thu hồi tập trung ở `backend/src/messagePolicy.js`.
- Footer thông tin nhóm/học phần/liên hệ có bố cục responsive và dòng copyright.

## 2. Cấu trúc thư mục

| Đường dẫn | Vai trò |
| --- | --- |
| `frontend/` | Giao diện React, tài nguyên CSS và cấu hình Vite |
| `frontend/src/` | Mã nguồn các trang và thành phần giao diện |
| `frontend/vite.config.js` | Chạy loopback cổng 5173; chuyển `/api` và `/uploads` tới backend cổng 5000 |
| `backend/` | API Node.js/Express và kết nối MongoDB |
| `backend/src/` | Xử lý nghiệp vụ, mô hình dữ liệu và xác thực |
| `backend/tests/` | Các kiểm thử đi kèm mã nguồn |
| `backend/.env.example` | Mẫu cấu hình môi trường cục bộ |
| `README.md` | Hướng dẫn cho đúng phiên bản 2.9.3 |

## 3. Chuẩn bị

- Cài Node.js **22.12.0 trở lên** (kèm npm); kiểm tra bằng `node -v` và `npm -v`.
- Cài MongoDB Community và bật dịch vụ MongoDB trên máy, cổng mặc định `27017`.
- Cần kết nối mạng khi cài các gói npm lần đầu. Dự án không tự cài hoặc tự khởi động MongoDB.
- Chạy từng phiên bản một vì các bản cùng sử dụng cổng 5000 và 5173.
- Mỗi bản có database mặc định riêng: `mongodb://127.0.0.1:27017/unilost_v2_9_3`. Vì vậy các phiên bản không tự dùng chung dữ liệu.

## 4. Chạy lần đầu trên Windows CMD

Giải nén, mở CMD tại thư mục `UniLost_Nhom04_v2.9.3` (nơi chứa `frontend` và `backend`).

### CMD thứ nhất: backend

```cmd
cd backend
copy .env.example .env
npm install
```

Lệnh `copy` chỉ cần thực hiện khi **chưa có `.env`**. Nếu đã cấu hình, giữ lại tệp hiện tại. Trong `.env`, đặt `JWT_SECRET` thành chuỗi riêng, đủ dài và khó đoán. Giữ `PORT=5000` nếu không thay cấu hình proxy của frontend.

Khởi động API:

```cmd
npm start
```

Khi khởi động, bản này có bước chuẩn bị dữ liệu bắt buộc và quản trị viên trong `src/server.js`; không bắt buộc chạy seed. `npm run seed` chỉ dành cho việc chủ động tạo lại dữ liệu mẫu và **sẽ xóa dữ liệu ở các collection được script liệt kê**.

### CMD thứ hai: frontend

Mở CMD mới tại thư mục phiên bản:

```cmd
cd frontend
npm install
npm start
```

Truy cập **http://localhost:5173** (hoặc http://127.0.0.1:5173).

- Kiểm tra API: http://localhost:5000/api/health.
- `frontend/.env.example` là cấu hình tùy chọn; mặc định mã nguồn đã gọi API qua `/api`, không cần sao chép tệp này để chạy.
- Giữ cả hai CMD đang mở. Nhấn `Ctrl+C` trong từng CMD để dừng.

### Những lần chạy tiếp theo

Bật MongoDB, rồi chạy `npm start` trong `backend` và `frontend` ở hai CMD riêng. Không cần cài lại dependency hoặc chạy seed nếu không có thay đổi.

## 5. Tài khoản chạy thử

- Sau khi seed: quản trị `admin@dntu.edu.vn` / `Admin@123`; người dùng mẫu `1822030487@dntu.edu.vn` / `User@123`.
- Tài khoản mẫu chỉ xuất hiện sau bước khởi tạo tương ứng; không phải mọi tài khoản đều tự có khi database rỗng.
- Nếu không seed: bước khởi động tạo quản trị mặc định `admin@dntu.edu.vn` / `Admin@123` khi chưa có; có thể đặt `ADMIN_EMAIL` và `ADMIN_PASSWORD` trong `.env` trước lần khởi tạo. Tài khoản đã tồn tại không tự đổi mật khẩu theo biến này.

## 6. Cấu hình và luồng hoạt động

- `MONGO_URI`: địa chỉ MongoDB và tên database; mẫu mặc định của bản này là `mongodb://127.0.0.1:27017/unilost_v2_9_3`.
- `JWT_SECRET`: khóa ký/kiểm tra token. Khi đổi khóa, các token cũ không còn hợp lệ.
- `PORT`: cổng backend, mặc định `5000`. Nếu đổi, cập nhật cả `target` trong cấu hình Vite.
- Vite nhận yêu cầu từ trình duyệt; `/api` và `/uploads` được chuyển tới `127.0.0.1:5000`. Không cần Docker, Nginx hoặc script LAN.
- Backend kiểm tra token/quyền, xử lý nghiệp vụ rồi đọc/ghi MongoDB; frontend nhận kết quả và cập nhật React state.
- Các server được cấu hình nghe trên loopback, không phục vụ máy khác qua mạng LAN.

### Email

Các biến `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` dùng cho gửi email. Khi cần thử chức năng gửi thư thật, điền thông tin SMTP hợp lệ trong `backend/.env`. Không đưa mật khẩu SMTP vào source. Nếu không cấu hình, thư thật không được gửi; xem phản hồi API/log backend của luồng tương ứng để biết chế độ thử nghiệm.

## 7. Bản đồ đọc mã nguồn

Nên đọc theo thứ tự:

1. [`frontend/src/main.jsx`](frontend/src/main.jsx): nơi gắn React vào trang.
2. [`frontend/src/App.jsx`](frontend/src/App.jsx): cấu hình tuyến và các trang.
3. [`backend/src/server.js`](backend/src/server.js): điểm khởi động API.
4. [`backend/src/app.js`](backend/src/app.js): middleware và các API/nhóm tuyến.
5. [`backend/src/models.js`](backend/src/models.js): cấu trúc dữ liệu.
6. [`backend/src/auth.js`](backend/src/auth.js): JWT và phân quyền.
7. [`backend/src/matching.js`](backend/src/matching.js): cách tính điểm bài tương đồng.

Các trang có trong thư mục mã nguồn của phiên bản:

| Tệp | Nội dung |
| --- | --- |
| [`Admin.jsx`](frontend/src/pages/Admin.jsx) | Quản trị hệ thống |
| [`AuthPage.jsx`](frontend/src/pages/AuthPage.jsx) | Đăng nhập và đăng ký |
| [`ChangePassword.jsx`](frontend/src/pages/ChangePassword.jsx) | Đổi mật khẩu |
| [`Claims.jsx`](frontend/src/pages/Claims.jsx) | Yêu cầu nhận/trả đồ |
| [`Dashboard.jsx`](frontend/src/pages/Dashboard.jsx) | Bài đăng của người dùng |
| [`ForgotPassword.jsx`](frontend/src/pages/ForgotPassword.jsx) | Khôi phục mật khẩu |
| [`GuestManage.jsx`](frontend/src/pages/GuestManage.jsx) | Quản lý bài khách bằng token |
| [`Handovers.jsx`](frontend/src/pages/Handovers.jsx) | Theo dõi bàn giao |
| [`Home.jsx`](frontend/src/pages/Home.jsx) | Khám phá, tìm kiếm và lọc bài đăng |
| [`Messages.jsx`](frontend/src/pages/Messages.jsx) | Hội thoại và tin nhắn |
| [`Notifications.jsx`](frontend/src/pages/Notifications.jsx) | Thông báo |
| [`PostDetail.jsx`](frontend/src/pages/PostDetail.jsx) | Chi tiết bài và các thao tác liên quan |
| [`PostForm.jsx`](frontend/src/pages/PostForm.jsx) | Tạo/cập nhật bài đăng |
| [`Profile.jsx`](frontend/src/pages/Profile.jsx) | Hồ sơ cá nhân |
| [`PublicProfile.jsx`](frontend/src/pages/PublicProfile.jsx) | Hồ sơ công khai |
| [`TransferConfirm.jsx`](frontend/src/pages/TransferConfirm.jsx) | Xác nhận bàn giao bằng mã |
| [`TransferScan.jsx`](frontend/src/pages/TransferScan.jsx) | Quét/nhập mã bàn giao |

Chú thích tiếng Việt giải thích trách nhiệm của tệp, hàm và các khối xử lý chính. Chú thích không thay thế việc đọc điều kiện kiểm tra trong hàm; quyền và trạng thái thực tế luôn do mã đang chạy quyết định.

## 8. Build và kiểm thử

Trong `frontend`:

```cmd
npm run build
```

Trong `backend`:

```cmd
npm test
```

Các kiểm thử có sẵn không thay thế việc thử toàn bộ nghiệp vụ với MongoDB thật. Sau khi build, có thể chạy `npm run preview` trong frontend; cần dừng frontend đang chiếm cổng trước và vẫn giữ backend đang chạy.

## 9. Lỗi thường gặp

| Hiện tượng | Cách xử lý |
| --- | --- |
| `'npm' is not recognized` | Cài Node.js và mở lại CMD để nhận PATH mới. |
| Lỗi phiên bản Node/engine khi cài hoặc build | Kiểm tra `node -v`, dùng Node từ 22.12.0 trở lên. |
| Không kết nối được MongoDB | Kiểm tra dịch vụ MongoDB đã chạy và `MONGO_URI` trong `backend/.env`. |
| URI chưa được khai báo / lỗi JWT secret | Kiểm tra đã sao chép `.env.example` thành `.env` tại backend và chạy lệnh từ đúng thư mục. |
| `EADDRINUSE` hoặc cổng đã được dùng | Dừng phiên bản/tiến trình cũ; mỗi lần chỉ chạy một phiên bản. |
| Trang mở nhưng API lỗi hoặc ảnh không tải | Kiểm tra backend cổng 5000 và `/api/health`; xem lỗi trong CMD backend. |
| Chưa có bài đăng/tài khoản mẫu | Kiểm tra đúng database của phiên bản; đọc phần khởi tạo trước khi cân nhắc chạy seed. |
| Token cũ / bị chuyển về đăng nhập | Đăng xuất rồi đăng nhập lại khi đổi phiên bản hoặc đổi `JWT_SECRET`; các bản cùng origin trình duyệt nên có thể dùng chung vùng lưu token. |
| Không có email xác minh/khôi phục | Kiểm tra cấu hình SMTP, phản hồi API và log backend. |

Đây là bản chạy trên máy cá nhân. Liên kết QR chứa `localhost` chỉ trỏ tới máy đang mở liên kết; không dùng điện thoại khác để truy cập máy chủ bằng liên kết đó.

## Kiểm tra bản v2.9.4

- Backend: 4 bộ kiểm thử, 19/19 test đạt.
- Frontend: `npm run build` thành công; Vite có cảnh báo bundle lớn hơn 500 kB.
- Đã rà soát mã xử lý số điện thoại, thông báo hồ sơ và gradient footer.
- Chưa hoàn tất kiểm thử giao diện trên trình duyệt hoặc kiểm thử toàn bộ luồng với MongoDB thật trong lần đóng gói này.
