import { canEditMessage, MESSAGE_EDIT_WINDOW_MS, messageIsRecalled, serializeMessage } from '../src/messagePolicy.js';

describe('chính sách tin nhắn v2.9', () => {
  const now = new Date('2026-09-21T03:00:00.000Z').getTime();

  test('người gửi được sửa trong 15 phút', () => {
    const message = { sender: 'A', createdAt: new Date(now - MESSAGE_EDIT_WINDOW_MS) };
    expect(canEditMessage(message, 'A', now)).toBe(true);
    expect(canEditMessage(message, 'B', now)).toBe(false);
  });

  test('không được sửa sau 15 phút hoặc sau khi thu hồi', () => {
    expect(canEditMessage({ sender: 'A', createdAt: new Date(now - MESSAGE_EDIT_WINDOW_MS - 1) }, 'A', now)).toBe(false);
    expect(canEditMessage({ sender: 'A', createdAt: new Date(now - 1), recalledAt: new Date(now) }, 'A', now)).toBe(false);
  });

  test('nhận diện cả tin thu hồi mới và tin xóa chung từ v2.8', () => {
    expect(messageIsRecalled({ recalledAt: new Date() })).toBe(true);
    expect(messageIsRecalled({ deletedAt: new Date() })).toBe(true);
  });

  test('tin thu hồi không trả nội dung, hình ảnh hoặc bài viết', () => {
    const result = serializeMessage({ content: 'bí mật', images: ['/a.jpg'], post: 'post-id', deletedAt: new Date(now) });
    expect(result.content).toBe('');
    expect(result.images).toEqual([]);
    expect(result.post).toBeNull();
    expect(result.recalledAt).toBeTruthy();
  });
});
