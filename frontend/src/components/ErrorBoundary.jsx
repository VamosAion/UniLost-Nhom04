/* Chặn lỗi render trong cây React và hiển thị phương án tải lại trang thay vì để màn hình trắng. */
import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('UniLost frontend error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <div className="container py-5 text-center">
        <div className="form-card mx-auto" style={{ maxWidth: 560 }}>
          <h1 className="h3">Không thể hiển thị trang</h1>
          <p className="text-muted">Giao diện vừa gặp lỗi ngoài ý muốn. Hãy tải lại trang để tiếp tục.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Tải lại trang</button>
        </div>
      </div>;
    }
    return this.props.children;
  }
}

