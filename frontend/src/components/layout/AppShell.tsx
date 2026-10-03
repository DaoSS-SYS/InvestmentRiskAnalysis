import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Dropdown, Space, Tag, Typography } from 'antd'
import {
  AppstoreOutlined,
  AuditOutlined,
  DatabaseOutlined,
  FundOutlined,
  LeftOutlined,
  LogoutOutlined,
  MenuOutlined,
  RightOutlined,
  TeamOutlined,
} from '@ant-design/icons'

import { RiskLabLogo } from '../brand/RiskLabLogo'
import { describeRole, useAuth } from '../../auth/AuthContext'

interface NavItem {
  key: string
  to: string
  label: string
  icon: ReactNode
  group: 'workspace' | 'management'
}

/** Инициалы для аватара: две первые буквы фамилии и имени. */
function initials(fullName: string | undefined, userName: string | undefined): string {
  const source = (fullName ?? userName ?? '').trim()

  if (!source) {
    return '—'
  }

  const parts = source.split(/\s+/)

  return parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : source.slice(0, 2).toUpperCase()
}

const CollapseKey = 'risklab.sidebar.collapsed'

/**
 * Каркас приложения: боковая навигация, верхняя панель, рабочая область.
 *
 * Состав пунктов зависит от ролей пользователя. Сокрытие пунктов
 * является удобством представления, а не средством защиты: разграничение
 * доступа обеспечивается на стороне сервера, и обращение к скрытому
 * разделу по прямому адресу будет им отклонено.
 */
export default function AppShell({
  children,
  breadcrumbs,
  title,
}: {
  children: ReactNode
  breadcrumbs: string[]
  title: string
}) {
  const location = useLocation()
  const { user, logout, canManageUsers } = useAuth()

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(CollapseKey) === '1'
    } catch {
      return false
    }
  })

  // Выезжающая навигация на узком экране — состояние отдельно
  // от свёрнутого вида, поскольку это разные способы показа.
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(CollapseKey, collapsed ? '1' : '0')
    } catch {
      // Недоступность хранилища не должна мешать работе приложения:
      // панель просто не запомнит своё состояние.
    }
  }, [collapsed])

  const items: NavItem[] = [
    {
      key: '/dashboard',
      to: '/dashboard',
      label: 'Обзор',
      icon: <AppstoreOutlined />,
      group: 'workspace',
    },
    {
      key: '/instruments',
      to: '/instruments',
      label: 'Инструменты',
      icon: <DatabaseOutlined />,
      group: 'workspace',
    },
    {
      key: '/portfolios',
      to: '/portfolios',
      label: 'Портфели',
      icon: <FundOutlined />,
      group: 'workspace',
    },
    ...(canManageUsers
      ? ([
          {
            key: '/administration',
            to: '/administration',
            label: 'Администрирование',
            icon: <TeamOutlined />,
            group: 'management',
          },
          {
            key: '/administration/audit',
            to: '/administration?tab=audit',
            label: 'Журнал действий',
            icon: <AuditOutlined />,
            group: 'management',
          },
        ] satisfies NavItem[])
      : []),
  ]

  // Раздел определяется первым сегментом пути, чтобы выделение
  // сохранялось на подчинённых страницах.
  const section = `/${location.pathname.split('/')[1] || 'dashboard'}`
  const auditTab = new URLSearchParams(location.search).get('tab') === 'audit'

  const isActive = (item: NavItem) => {
    if (item.key === '/administration') {
      return section === '/administration' && !auditTab
    }

    if (item.key === '/administration/audit') {
      return section === '/administration' && auditTab
    }

    return section === item.key
  }

  const renderGroup = (group: NavItem['group'], caption: string) => {
    const groupItems = items.filter((item) => item.group === group)

    if (groupItems.length === 0) {
      return null
    }

    return (
      <>
        <div className="rl-sidebar__group">
          <span className="rl-collapsible">{caption}</span>
        </div>

        <ul className="rl-nav">
          {groupItems.map((item) => (
            <li key={item.key}>
              <Link
                to={item.to}
                className={`rl-nav__link ${isActive(item) ? 'rl-nav__link--active' : ''}`}
                // Переход закрывает выезжающую навигацию: на узком
                // экране она перекрывает рабочую область.
                onClick={() => setDrawerOpen(false)}
                title={collapsed ? item.label : undefined}
                aria-current={isActive(item) ? 'page' : undefined}
              >
                <span className="rl-nav__icon">{item.icon}</span>
                <span className="rl-collapsible">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </>
    )
  }

  const avatar = initials(user?.fullName, user?.userName)
  const role = user?.roles?.[0]

  const toggleCollapsed = useCallback(() => setCollapsed((value) => !value), [])

  return (
    <div className="rl-shell">
      <aside
        className={[
          'rl-sidebar',
          collapsed ? 'rl-sidebar--collapsed' : '',
          drawerOpen ? 'rl-sidebar--open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="rl-sidebar__brand">
          <RiskLabLogo />
        </div>

        <button
          type="button"
          className="rl-sidebar__toggle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
        >
          {collapsed ? <RightOutlined /> : <LeftOutlined />}
        </button>

        <nav style={{ flex: 1, overflowY: 'auto' }}>
          {renderGroup('workspace', 'Рабочая область')}
          {renderGroup('management', 'Управление')}
        </nav>

        <div className="rl-sidebar__user" title={user?.fullName}>
          <span
            style={{
              flex: 'none',
              display: 'grid',
              placeItems: 'center',
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'var(--primary)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {avatar}
          </span>

          <span className="rl-collapsible" style={{ minWidth: 0 }}>
            <span className="rl-sidebar__user-name">{user?.fullName ?? user?.userName}</span>
            <span className="rl-sidebar__user-role">{role ? describeRole(role) : ''}</span>
          </span>
        </div>
      </aside>

      {drawerOpen && (
        <button
          type="button"
          className="rl-scrim"
          aria-label="Закрыть навигацию"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <div className={`rl-main ${collapsed ? 'rl-main--wide' : ''}`}>
        <header className="rl-topbar">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Открыть навигацию"
            className="rl-burger"
          >
            <MenuOutlined />
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="rl-topbar__crumbs">{['RiskLab', ...breadcrumbs].join('  /  ')}</div>
            <div className="rl-topbar__title">{title}</div>
          </div>

          <Space size={10}>
            {role && (
              <Tag
                style={{
                  margin: 0,
                  borderRadius: 999,
                  paddingInline: 12,
                  paddingBlock: 3,
                  background: 'rgba(22, 133, 107, 0.10)',
                  border: 'none',
                  color: 'var(--primary)',
                  fontWeight: 600,
                }}
              >
                {describeRole(role)}
              </Tag>
            )}

            <Dropdown
              menu={{
                items: [
                  {
                    key: 'info',
                    disabled: true,
                    label: (
                      <Space orientation="vertical" size={0}>
                        <Typography.Text strong>{user?.fullName}</Typography.Text>
                        {user?.position && (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {user.position}
                          </Typography.Text>
                        )}
                      </Space>
                    ),
                  },
                  { type: 'divider' },
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: 'Выйти',
                    onClick: logout,
                  },
                ],
              }}
            >
              <button
                type="button"
                aria-label="Меню пользователя"
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 38,
                  height: 38,
                  border: 'none',
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  color: '#fff',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {avatar}
              </button>
            </Dropdown>
          </Space>
        </header>

        <main className="rl-content">{children}</main>

        <footer className="rl-footer">
          Выпускная квалификационная работа · Финансовый университет при Правительстве
          Российской Федерации · Источники данных: Московская Биржа, Банк России
        </footer>
      </div>
    </div>
  )
}
