import { Spin } from 'antd'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'

import AppShell from './components/layout/AppShell'
import DashboardPage from './pages/DashboardPage'
import InstrumentsPage from './pages/InstrumentsPage'
import InstrumentAnalysisPage from './pages/InstrumentAnalysisPage'
import PortfoliosPage from './pages/PortfoliosPage'
import PortfolioDetailPage from './pages/PortfolioDetailPage'
import AdministrationPage from './pages/AdministrationPage'
import LoginPage from './pages/LoginPage'
import { useAuth } from './auth/AuthContext'

/**
 * Заголовок и хлебные крошки раздела.
 *
 * Вынесены из страниц в каркас, чтобы верхняя панель заполнялась
 * единообразно, а страница отвечала только за собственное содержимое.
 * Наименование объекта — тикер инструмента, название портфеля —
 * страница выводит в собственном заголовке: каркас получает его
 * до загрузки данных и показать не может.
 */
function useSectionCaption(): { breadcrumbs: string[]; title: string } {
  const location = useLocation()
  const params = useParams()
  const segments = location.pathname.split('/').filter(Boolean)
  const section = segments[0] ?? 'dashboard'
  const hasId = Boolean(params.id) || segments.length > 1

  switch (section) {
    case 'instruments':
      return hasId
        ? { breadcrumbs: ['Инструменты'], title: 'Анализ инструмента' }
        : { breadcrumbs: ['Инструменты'], title: 'Справочник инструментов' }

    case 'portfolios':
      return hasId
        ? { breadcrumbs: ['Портфели'], title: 'Карточка портфеля' }
        : { breadcrumbs: ['Портфели'], title: 'Инвестиционные портфели' }

    case 'administration':
      return { breadcrumbs: ['Управление'], title: 'Администрирование' }

    default:
      return { breadcrumbs: ['Обзор'], title: 'Рабочий обзор' }
  }
}

/** Содержимое приложения внутри каркаса. */
function Shell() {
  const { canManageUsers } = useAuth()
  const { breadcrumbs, title } = useSectionCaption()

  return (
    <AppShell breadcrumbs={breadcrumbs} title={title}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/instruments" element={<InstrumentsPage />} />
        <Route path="/instruments/:id" element={<InstrumentAnalysisPage />} />
        <Route path="/portfolios" element={<PortfoliosPage />} />
        <Route path="/portfolios/:id" element={<PortfolioDetailPage />} />
        {canManageUsers && <Route path="/administration" element={<AdministrationPage />} />}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  )
}

/**
 * Корневой компонент клиентского приложения.
 *
 * До завершения восстановления сеанса не отображается ни рабочая
 * область, ни страница входа: иначе пользователь с действующим сеансом
 * на мгновение увидел бы форму входа при каждом обновлении страницы.
 */
export default function App() {
  const { isAuthenticated, isRestoring } = useAuth()

  if (isRestoring) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  return isAuthenticated ? <Shell /> : <LoginPage />
}
