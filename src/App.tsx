import { useState, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import Login from './pages/Login'
import RedefinirSenha from './pages/RedefinirSenha'
import { ConsultaVencidaGate } from './components/ConsultaVencidaGate'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const CRM = lazy(() => import('./pages/CRM'))
const Leads = lazy(() => import('./pages/Leads'))
const LeadDetail = lazy(() => import('./pages/LeadDetail'))
const Configuracoes = lazy(() => import('./pages/Configuracoes'))
const AdminClinicas = lazy(() => import('./pages/AdminClinicas'))

function RouteFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <main className="relative flex-1 overflow-hidden">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/crm" element={<CRM />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/leads/:id" element={<LeadDetail />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/admin/clinicas" element={<AdminRoute><AdminClinicas /></AdminRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <ConsultaVencidaGate />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AuthProvider>
                  <AppLayout />
                </AuthProvider>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
