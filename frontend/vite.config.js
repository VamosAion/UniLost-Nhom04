import { defineConfig } from 'vite';

// Local development: forward API calls and uploaded images to the backend.
const proxy = {
  '/api': { target: 'http://127.0.0.1:5000' },
  '/uploads': { target: 'http://127.0.0.1:5000' },
};
export default defineConfig({
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
});
