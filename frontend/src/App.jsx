/* Khai báo các trang và tuyến điều hướng; ProtectedRoute giới hạn trang theo phiên đăng nhập hoặc vai trò. */
import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Home from './pages/Home.jsx';
import AuthPage from './pages/AuthPage.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import PostForm from './pages/PostForm.jsx';
import PostDetail from './pages/PostDetail.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Claims from './pages/Claims.jsx';
import Handovers from './pages/Handovers.jsx';
import Notifications from './pages/Notifications.jsx';
import Messages from './pages/Messages.jsx';
import Profile from './pages/Profile.jsx';
import PublicProfile from './pages/PublicProfile.jsx';
import TransferConfirm from './pages/TransferConfirm.jsx';
import TransferScan from './pages/TransferScan.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import GuestManage from './pages/GuestManage.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
  return <Routes><Route element={<Layout />}>
    <Route index element={<Home />} />
    <Route path="login" element={<AuthPage mode="login" />} />
    <Route path="register" element={<AuthPage mode="register" />} />
    <Route path="forgot-password" element={<ForgotPassword />} />
    <Route path="posts/new" element={<PostForm />} />
    <Route path="posts/:id" element={<PostDetail />} />
    <Route path="guest/manage/:token" element={<GuestManage />} />
    <Route path="users/:id" element={<PublicProfile />} />
    <Route element={<ProtectedRoute />}>
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="claims" element={<Claims />} />
      <Route path="handovers" element={<Handovers />} />
      <Route path="notifications" element={<Notifications />} />
      <Route path="messages" element={<Messages />} />
      <Route path="messages/:id" element={<Messages />} />
      <Route path="profile" element={<Profile />} />
      <Route path="change-password" element={<ChangePassword />} />
      <Route path="transfers/scan" element={<TransferScan />} />
      <Route path="transfers/confirm/:token" element={<TransferConfirm />} />
    </Route>
    <Route element={<ProtectedRoute roles={['ADMIN', 'STAFF']} />}><Route path="admin" element={<Admin />} /><Route path="posts/:id/edit" element={<PostForm />} /></Route>
    <Route path="*" element={<Navigate to="/" />} />
  </Route></Routes>;
}
