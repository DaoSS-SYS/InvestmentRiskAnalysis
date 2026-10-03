import type { ReactNode } from 'react'
import { Button, Empty, Result, Skeleton, Space, Typography } from 'antd'

import { signColor } from '../../theme/tokens'

/**
 * Небольшие повторно применяемые элементы оформления.
 *
 * Собраны в одном месте намеренно: каждый из них — несколько строк
 * разметки, и отдельный файл на каждый затруднил бы чтение больше,
 * чем помог бы.
 */

/** Карточка с мягкой тенью — основная поверхность приложения. */
export function Card({
  children,
  padding = 20,
  className = '',
  style,
}: {
  children: ReactNode
  padding?: number
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div className={`rl-card ${className}`} style={{ padding, ...style }}>
      {children}
    </div>
  )
}

/** Заголовок смыслового блока внутри карточки. */
export function SectionHead({
  title,
  subtitle,
  extra,
}: {
  title: ReactNode
  subtitle?: ReactNode
  extra?: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 16,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="rl-section__title">{title}</div>
        {subtitle && <div className="rl-section__subtitle">{subtitle}</div>}
      </div>

      {extra && <div style={{ flex: 'none' }}>{extra}</div>}
    </div>
  )
}

/**
 * Показательная карточка.
 *
 * Значение со знаком выводится и цветом, и знаком: цвет остаётся
 * вспомогательным признаком.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  loading = false,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'neutral' | 'positive' | 'negative' | 'warning' | 'signed'
  /** Числовая величина; требуется только при tone = 'signed'. */
  loading?: boolean
}) {
  const color =
    tone === 'positive'
      ? 'var(--primary)'
      : tone === 'negative'
        ? 'var(--danger)'
        : tone === 'warning'
          ? 'var(--warning)'
          : 'var(--text)'

  return (
    <Card>
      <div className="rl-stat__head">
        <span className="rl-stat__label">{label}</span>
        {icon && <span className="rl-stat__icon">{icon}</span>}
      </div>

      {loading ? (
        <Skeleton active paragraph={false} title={{ width: '62%' }} style={{ marginTop: 12 }} />
      ) : (
        <>
          <div className="rl-stat__value rl-num" style={{ color }}>
            {value}
          </div>
          {hint && <div className="rl-stat__hint">{hint}</div>}
        </>
      )}
    </Card>
  )
}

/** Числовая величина, знак которой несёт смысл. */
export function Signed({
  value,
  children,
}: {
  value: number
  children: ReactNode
}) {
  return (
    <span className="rl-num" style={{ color: signColor(value) }}>
      {children}
    </span>
  )
}

/**
 * Состояние отсутствия данных.
 *
 * Пустое состояние обязано объяснять следующий возможный шаг: перечень
 * без пояснения оставляет пользователя в недоумении, всё ли исправно.
 */
export function EmptyBlock({
  title,
  hint,
  action,
  height,
}: {
  title: string
  hint?: string
  action?: ReactNode
  height?: number
}) {
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: height ?? 160,
        textAlign: 'center',
      }}
    >
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <Space orientation="vertical" size={4}>
            <Typography.Text strong style={{ fontSize: 13 }}>
              {title}
            </Typography.Text>
            {hint && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {hint}
              </Typography.Text>
            )}
          </Space>
        }
      >
        {action}
      </Empty>
    </div>
  )
}

/**
 * Состояние отказа.
 *
 * Сообщение об ошибке сопровождается действием: без него пользователю
 * остаётся лишь обновить страницу наугад.
 */
export function ErrorBlock({
  message,
  onRetry,
  height,
}: {
  message: string
  onRetry?: () => void
  height?: number
}) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: height ?? 160 }}>
      <Result
        status="warning"
        style={{ padding: 12 }}
        title={<span style={{ fontSize: 15 }}>Не удалось получить данные</span>}
        subTitle={<span style={{ fontSize: 12.5 }}>{message}</span>}
        extra={
          onRetry && (
            <Button size="small" onClick={onRetry}>
              Повторить
            </Button>
          )
        }
      />
    </div>
  )
}

/** Скелетон, повторяющий форму будущего блока. */
export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div style={{ height, display: 'grid', placeItems: 'center' }}>
      <Skeleton active paragraph={{ rows: 4 }} style={{ width: '100%' }} />
    </div>
  )
}
