/* Tập trung quy tắc sửa và thu hồi tin nhắn để API dùng cùng một cách kiểm tra và biểu diễn dữ liệu. */
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

/* Nhận diện tin đã thu hồi, bao gồm dấu xóa chung từ dữ liệu phiên bản cũ. */
export function messageIsRecalled(message) {
  return Boolean(message?.recalledAt || message?.deletedAt);
}

/* Chỉ cho người gửi sửa tin chưa thu hồi trong khoảng thời gian cho phép tính từ createdAt. */
export function canEditMessage(message, userId, now = Date.now()) {
  if (!message || String(message.sender) !== String(userId) || messageIsRecalled(message)) return false;
  return now - new Date(message.createdAt).getTime() <= MESSAGE_EDIT_WINDOW_MS;
}

/* Tạo dữ liệu trả về giao diện; che nội dung, ảnh và bài liên kết khi tin đã thu hồi. */
export function serializeMessage(message) {
  const result = message?.toObject ? message.toObject() : { ...message };
  // Tin từng bị xóa chung ở v2.8 được hiển thị như tin đã thu hồi trong v2.9.
  if (result.recalledAt || result.deletedAt) {
    result.content = '';
    result.images = [];
    result.post = null;
    result.recalledAt = result.recalledAt || result.deletedAt;
  }
  return result;
}
