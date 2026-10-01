import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ApplicationDetailPage } from "./pages/ApplicationDetailPage";
import { ApplicationNewPage } from "./pages/ApplicationNewPage";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import { BoardPage } from "./pages/BoardPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HomeRedirect } from "./pages/HomeRedirect";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/applications" element={<ApplicationsPage />} />
        <Route path="/applications/new" element={<ApplicationNewPage />} />
        <Route path="/applications/:id" element={<ApplicationDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
