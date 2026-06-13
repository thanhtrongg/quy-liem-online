# Quỷ Liếm Online

Game suy luận xã hội chơi online theo phòng, hỗ trợ các vai:

- Quỷ Liếm, Quỷ Liếm Nhí
- Cô Bé Hay Đoán
- Cậu Bé Chơi Bùa
- Gã Béo Nóng Tính
- Anh Hàng Xóm
- Lọ Vương
- Người Yêu Cũ

## Chạy local

```bash
npm install
npm start
```

Mở `http://localhost:3030`. Để test, mở nhiều cửa sổ ẩn danh và vào cùng mã phòng.

## Deploy

App dùng WebSocket và lưu phòng trong bộ nhớ, vì vậy hãy deploy **một instance** Node.js.

### Render

1. Đẩy source lên GitHub.
2. Tạo **Web Service** mới trên Render.
3. Build command: `npm install`
4. Start command: `npm start`

### Railway

Tạo project từ GitHub repo. Railway tự nhận `npm start`; không cần cấu hình biến môi trường.

Lưu ý: phòng chơi sẽ mất khi server restart hoặc sleep.
