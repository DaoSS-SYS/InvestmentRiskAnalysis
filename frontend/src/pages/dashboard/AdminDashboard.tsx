import { Fragment, useMemo, useState } from 'react'
import { App, Button, Space, Tag, Typography } from 'antd'
import {
  ArrowRightOutlined,
  AuditOutlined,
  CheckCircleFilled,
  CloudDownloadOutlined,
  DatabaseOutlined,
  FundOutlined,
  LineChartOutlined,
  ReloadOutlined,
  SafetyOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { api, describeError } from '../../api/client'
import { useDataFreshness } from '../../hooks/usePortfolioAggregates'
import { Card, EmptyBlock, SectionHead, StatCard } from '../../components/ui/primitives'
import { formatCount, formatDate, formatDateTime, formatDuration } from '../../lib/format'

/**
 * Разница между датой и моментом получения данных словами.
 *
 * Точка отсчёта передаётся явно, а не берётся из системных часов при
 * отрисовке: обращение к часам делает результат отрисовки зависящим
 * от момента вызова, тогда как он должен определяться только данными.
 * Моментом отсчёта служит время последнего успешного запроса —
 * сведения обновляются каждые полминуты, и этой точности достаточно.
 */
function since(value: string | null, reference: number): string {
  if (!value || reference === 0) return 'нет сведений'

  const minutes = Math.round((reference - new Date(value).getTime()) / 60000)

  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} мин назад`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ч назад`

  return `${Math.round(hours / 24)} дн назад`
}

/**
 * Главная страница администратора.
 *
 * Отвечает на вопрос «система и данные работают штатно». Состояние
 * внешних источников определяется по времени последней успешной
 * загрузки, зафиксированной в журнале действий, и по наибольшей дате
 * котировки в справочнике: проверки доступности источников программный
 * интерфейс не предоставляет, и выдавать эти сведения за результат
 * опроса источника недопустимо.
 */
export default function AdminDashboard() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [lastOperation, setLastOperation] = useState<string | null>(null)

  const info = useQuery({
    queryKey: ['system-info'],
    queryFn: api.system.info,
    refetchInterval: 30_000,
  })

  const users = useQuery({ queryKey: ['users'], queryFn: api.auth.users })
  const audit = useQuery({ queryKey: ['audit'], queryFn: () => api.auth.audit(40) })
  const freshness = useDataFreshness()

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['system-info'] })
    void queryClient.invalidateQueries({ queryKey: ['instruments'] })
    void queryClient.invalidateQueries({ queryKey: ['audit'] })
  }

  const importKeyRate = useMutation({
    mutationFn: () => api.importData.keyRate(),
    onSuccess: (result) => {
      setLastOperation(
        `Ключевая ставка Банка России: получено ${formatCount(result.rowsReceived)} значений, ` +
          `добавлено ${formatCount(result.rowsInserted)}, ${formatDuration(result.durationMs)}.`,
      )
      message.success('Ключевая ставка загружена')
      invalidate()
    },
    onError: (error) => message.error(describeError(error)),
  })

  const importQuotes = useMutation({
    mutationFn: () => api.importData.allQuotes(),
    onSuccess: (results) => {
      const inserted = results.reduce((sum, item) => sum + item.rowsInserted, 0)
      const updated = results.reduce((sum, item) => sum + item.rowsUpdated, 0)

      setLastOperation(
        `Котировки: обработано инструментов ${results.length}, ` +
          `добавлено ${formatCount(inserted)} записей, обновлено ${formatCount(updated)}.`,
      )
      message.success('Котировки догружены')
      invalidate()
    },
    onError: (error) => message.error(describeError(error)),
  })

  const detectActions = useMutation({
    mutationFn: () => api.corporateActions.detectAll(),
    onSuccess: () => {
      setLastOperation('Предобработка выполнена: ценовые ряды проверены на аномалии.')
      message.success('Предобработка выполнена')
      invalidate()
    },
    onError: (error) => message.error(describeError(error)),
  })

  const data = info.data
  const records = useMemo(() => audit.data ?? [], [audit.data])

  // Момент последнего успешного запроса сведений о системе.
  const referenceTime = info.dataUpdatedAt

  // Время последней успешной загрузки — из журнала действий.
  const lastImport = useMemo(
    () => records.find((record) => record.action === 'Import')?.timestamp ?? null,
    [records],
  )

  const activeUsers = (users.data ?? []).filter((user) => user.isActive).length

  // Замечания собираются только из проверяемых признаков.
  const warnings = useMemo(() => {
    const items: string[] = []

    if (data && !data.databaseAvailable) {
      items.push('База данных недоступна')
    }

    if (freshness.withoutQuotes.length > 0) {
      items.push(
        `Без истории котировок: ${freshness.withoutQuotes.map((i) => i.ticker).join(', ')}`,
      )
    }

    if (freshness.latestQuoteDate) {
      const days = Math.round(
        (referenceTime - new Date(freshness.latestQuoteDate).getTime()) / 86_400_000,
      )

      if (referenceTime > 0 && days > 7) {
        items.push(`Котировки не обновлялись ${days} дн.`)
      }
    }

    return items
  }, [data, freshness.withoutQuotes, freshness.latestQuoteDate, referenceTime])

  const healthy = Boolean(data?.databaseAvailable) && warnings.length === 0

  const sources = [
    {
      name: 'Московская Биржа',
      state: freshness.latestQuoteDate ? 'Загрузка выполнялась' : 'Загрузок не было',
      detail: freshness.latestQuoteDate
        ? `котировки по ${formatDate(freshness.latestQuoteDate)}`
        : 'история не загружена',
      ok: Boolean(freshness.latestQuoteDate),
    },
    {
      name: 'Банк России',
      state: lastImport ? 'Загрузка выполнялась' : 'Загрузок не было',
      detail: lastImport ? since(lastImport, referenceTime) : 'ключевая ставка не загружалась',
      ok: Boolean(lastImport),
    },
    {
      name: 'PostgreSQL',
      state: data?.databaseAvailable ? 'Доступна' : 'Недоступна',
      detail: data?.appliedMigrations?.length
        ? `миграций применено: ${data.appliedMigrations.length}`
        : 'сведений нет',
      ok: Boolean(data?.databaseAvailable),
    },
  ]

  return (
    <Space orientation="vertical" size={20} style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <Typography.Title level={2} style={{ margin: 0, fontSize: 27, letterSpacing: -0.5 }}>
            Состояние системы
          </Typography.Title>
          <Typography.Text type="secondary">
            Контроль данных, пользователей и операций загрузки
          </Typography.Text>
        </div>

        <Space>
          <Link to="/administration?tab=audit">
            <Button icon={<AuditOutlined />}>Открыть журнал</Button>
          </Link>
          <Button
            type="primary"
            icon={<CloudDownloadOutlined />}
            loading={importQuotes.isPending}
            onClick={() => importQuotes.mutate()}
          >
            Обновить данные
          </Button>
        </Space>
      </div>

      <div className="rl-hero">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="rl-hero__eyebrow">
              <SafetyOutlined />
              {healthy ? 'Система работает штатно' : 'Требуется внимание'}
            </div>

            <h2 className="rl-hero__title">
              {data?.databaseAvailable === false
                ? 'База данных недоступна'
                : warnings.length > 0
                  ? 'Обнаружены неблокирующие замечания'
                  : 'Все критические службы доступны'}
            </h2>

            <p className="rl-hero__text">
              {data?.databaseAvailable === false
                ? 'Хранилище данных не отвечает. Работа с портфелями и расчёты невозможны до восстановления подключения.'
                : warnings.length > 0
                  ? warnings.join('. ') + '.'
                  : 'Подключение к хранилищу установлено, справочник заполнен, история котировок загружена.'}
            </p>
          </div>

          <Space>
            <Button
              ghost
              style={{ borderColor: 'rgba(255,255,255,0.35)', color: '#fff' }}
              loading={detectActions.isPending}
              onClick={() => detectActions.mutate()}
            >
              Предобработка
            </Button>
            <Button
              style={{ background: '#fff', border: 'none', color: 'var(--sidebar)' }}
              loading={importKeyRate.isPending}
              onClick={() => importKeyRate.mutate()}
            >
              Ключевая ставка
            </Button>
          </Space>
        </div>

        <div className="rl-hero__metrics">
          <div>
            <div className="rl-hero__metric-label">Последняя загрузка</div>
            <div className="rl-hero__metric-value rl-num">
              {since(lastImport, referenceTime)}
            </div>
          </div>

          <div>
            <div className="rl-hero__metric-label">Котировки по</div>
            <div className="rl-hero__metric-value rl-num">
              {freshness.latestQuoteDate ? formatDate(freshness.latestQuoteDate) : '—'}
            </div>
          </div>

          <div>
            <div className="rl-hero__metric-label">Действующих учётных записей</div>
            <div className="rl-hero__metric-value rl-num">{activeUsers || '—'}</div>
          </div>
        </div>

        {lastOperation && (
          <div style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
            {lastOperation}
          </div>
        )}
      </div>

      <div className="rl-grid-kpi">
        <StatCard
          label="Инструментов"
          value={formatCount(data?.instrumentCount ?? 0)}
          hint={
            freshness.withoutQuotes.length > 0
              ? `${freshness.withoutQuotes.length} без истории`
              : 'история загружена по всем'
          }
          icon={<DatabaseOutlined />}
          tone={freshness.withoutQuotes.length > 0 ? 'warning' : 'neutral'}
          loading={info.isLoading}
        />

        <StatCard
          label="Котировок"
          value={formatCount(data?.quoteCount ?? 0)}
          hint="записей в базе данных"
          icon={<LineChartOutlined />}
          loading={info.isLoading}
        />

        <StatCard
          label="Портфелей"
          value={formatCount(data?.portfolioCount ?? 0)}
          hint={`учётных записей: ${users.data?.length ?? 0}`}
          icon={<FundOutlined />}
          loading={info.isLoading}
        />

        <StatCard
          label="Замечаний"
          value={warnings.length}
          hint={warnings.length > 0 ? 'неблокирующие' : 'замечаний нет'}
          tone={warnings.length > 0 ? 'warning' : 'neutral'}
          icon={<WarningOutlined />}
          loading={info.isLoading || freshness.isLoading}
        />
      </div>

      <div
        className="rl-grid-split"
        style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}
      >
        <Card>
          <SectionHead
            title="Источники и службы"
            subtitle="По последней успешной загрузке, не по опросу источника"
          />

          {/* Единая сетка, а не отдельная строка на каждый источник:
              столбцы общие для всех строк, поэтому метки состояния
              выстраиваются по одной вертикали независимо от длины
              наименования. */}
          <div className="rl-sources">
            {sources.map((source) => (
              <Fragment key={source.name}>
                <span className="rl-sources__cell rl-sources__name">{source.name}</span>

                <span className="rl-sources__cell rl-sources__state">
                  <Tag
                    icon={source.ok ? <CheckCircleFilled /> : <WarningOutlined />}
                    color={source.ok ? 'success' : 'warning'}
                    style={{ margin: 0, borderRadius: 999 }}
                  >
                    {source.state}
                  </Tag>
                </span>

                <span className="rl-sources__cell rl-sources__detail">{source.detail}</span>
              </Fragment>
            ))}
          </div>

          <Space wrap style={{ marginTop: 16 }}>
            <Button
              size="small"
              icon={<CloudDownloadOutlined />}
              loading={importQuotes.isPending}
              onClick={() => importQuotes.mutate()}
            >
              Догрузить котировки
            </Button>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={importKeyRate.isPending}
              onClick={() => importKeyRate.mutate()}
            >
              Ключевая ставка
            </Button>
            <Button
              size="small"
              icon={<SafetyOutlined />}
              loading={detectActions.isPending}
              onClick={() => detectActions.mutate()}
            >
              Предобработка
            </Button>
          </Space>
        </Card>

        <Card>
          <SectionHead
            title="Последние действия"
            subtitle="Журнал изменяющих операций"
            extra={
              <Link to="/administration?tab=audit" style={{ fontSize: 12.5 }}>
                Весь журнал <ArrowRightOutlined style={{ fontSize: 10 }} />
              </Link>
            }
          />

          {records.length === 0 ? (
            <EmptyBlock
              height={180}
              title="Записей нет"
              hint="Журнал пополняется при входе в систему и изменении данных."
            />
          ) : (
            <Space orientation="vertical" size={0} style={{ width: '100%' }}>
              {records.slice(0, 5).map((record) => (
                <div
                  key={record.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '11px 4px',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <span
                    style={{
                      flex: 'none',
                      display: 'grid',
                      placeItems: 'center',
                      width: 30,
                      height: 30,
                      borderRadius: 9,
                      background: 'var(--canvas)',
                      color: 'var(--primary)',
                      fontSize: 13,
                    }}
                  >
                    {record.action === 'Import' ? (
                      <CloudDownloadOutlined />
                    ) : record.action === 'Login' ? (
                      <TeamOutlined />
                    ) : (
                      <SafetyOutlined />
                    )}
                  </span>

                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{record.description}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      {record.userName}
                    </div>
                  </span>

                  <span style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {formatDateTime(record.timestamp)}
                  </span>
                </div>
              ))}
            </Space>
          )}
        </Card>
      </div>
    </Space>
  )
}
