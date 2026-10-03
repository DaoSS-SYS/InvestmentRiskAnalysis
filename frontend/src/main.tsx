import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntApp, ConfigProvider } from 'antd'
import ruRU from 'antd/locale/ru_RU'
import 'dayjs/locale/ru'

import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { antdTheme } from './theme/antdTheme'
import './index.css'

/**
 * Клиент управления серверным состоянием.
 *
 * Данные считаются актуальными в течение минуты: справочник инструментов
 * и котировки изменяются редко, и повторные запросы при переключении
 * разделов избыточны. Повторные попытки при ошибке отключены: сообщение
 * об отказе должно доходить до пользователя без задержки.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={ruRU} theme={antdTheme}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
)
