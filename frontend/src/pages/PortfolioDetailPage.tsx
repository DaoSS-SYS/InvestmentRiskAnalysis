import { useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  DatePicker,
  Form,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  PlusOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'

import { api, describeError } from '../api/client'
import OptimizationPanel from '../components/OptimizationPanel'
import StressTestPanel from '../components/StressTestPanel'
import { useAuth } from '../auth/AuthContext'
import type { Position, PositionRiskContribution, VarResult } from '../api/types'
import { Card, EmptyBlock, SectionHead, Signed, StatCard } from '../components/ui/primitives'
import { baseOption, donutSeries } from '../components/charts/chartTheme'
import { colors, seriesPalette } from '../theme/tokens'
import {
  formatCount,
  formatDate,
  formatDuration,
  formatMoney,
  formatPercent,
} from '../lib/format'

interface PositionFormValues {
  instrumentId: number
  quantity: number
  purchasePrice: number
  purchaseDate: dayjs.Dayjs
}

/** Доля, начиная с которой концентрация считается чрезмерной. */
const ConcentrationThreshold = 0.4

/**
 * Карточка портфеля: состав позиций, текущая оценка, расчёт риска
 * с разложением по позициям, стресс-тестирование и оптимизация.
 *
 * Содержимое разделено на вкладки: прежде страница представляла собой
 * единый свиток, в котором разделы, относящиеся к разным задачам,
 * следовали друг за другом и вынуждали прокручивать мимо ненужного.
 */
export default function PortfolioDetailPage() {
  const { id } = useParams<{ id: string }>()
  const portfolioId = Number(id)

  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const { canManagePortfolios } = useAuth()

  const [tab, setTab] = useState('overview')
  const [positionOpen, setPositionOpen] = useState(false)
  const [form] = Form.useForm<PositionFormValues>()

  const [confidence, setConfidence] = useState(0.99)
  const [horizon, setHorizon] = useState(1)
  const [scenarios, setScenarios] = useState(100_000)
  const [riskRequested, setRiskRequested] = useState(false)
  const [downloading, setDownloading] = useState<'pdf' | 'xlsx' | null>(null)

  const portfolio = useQuery({
    queryKey: ['portfolio', portfolioId],
    queryFn: () => api.portfolios.get(portfolioId),
    enabled: Number.isFinite(portfolioId),
  })

  const instruments = useQuery({ queryKey: ['instruments'], queryFn: api.instruments.list })

  const risk = useQuery({
    queryKey: ['portfolio-risk', portfolioId, confidence, horizon, scenarios],
    queryFn: () => api.portfolios.risk(portfolioId, { confidence, horizon, scenarios }),
    enabled: riskRequested && Number.isFinite(portfolioId),
  })

  const addPosition = useMutation({
    mutationFn: (values: PositionFormValues) =>
      api.portfolios.addPosition(portfolioId, {
        instrumentId: values.instrumentId,
        quantity: values.quantity,
        purchasePrice: values.purchasePrice,
        purchaseDate: values.purchaseDate.format('YYYY-MM-DD'),
      }),
    onSuccess: () => {
      message.success('Позиция добавлена')
      setPositionOpen(false)
      form.resetFields()
      void queryClient.invalidateQueries({ queryKey: ['portfolio', portfolioId] })
      void queryClient.invalidateQueries({ queryKey: ['portfolio-risk', portfolioId] })
    },
    onError: (error) => message.error(describeError(error)),
  })

  const removePosition = useMutation({
    mutationFn: (positionId: number) => api.portfolios.removePosition(portfolioId, positionId),
    onSuccess: () => {
      message.success('Позиция удалена')
      void queryClient.invalidateQueries({ queryKey: ['portfolio', portfolioId] })
      void queryClient.invalidateQueries({ queryKey: ['portfolio-risk', portfolioId] })
    },
    onError: (error) => message.error(describeError(error)),
  })

  /**
   * Постановка расчёта в очередь.
   *
   * Расчёт, выполняемый кнопкой «Рассчитать», возвращает результат
   * немедленно, но в истории не сохраняется. Постановка в очередь
   * сохраняет результат: именно сохранённые расчёты попадают в сводку
   * на обзорной странице и доступны другим пользователям.
   */
  const enqueue = useMutation({
    mutationFn: () =>
      api.portfolios.enqueueCalculation(portfolioId, {
        confidenceLevel: confidence,
        horizonDays: horizon,
        scenarioCount: scenarios,
      }),
    onSuccess: () => {
      message.success('Расчёт поставлен в очередь: результат сохранится в истории')
      void queryClient.invalidateQueries({ queryKey: ['calculations', portfolioId] })
    },
    onError: (error) => message.error(describeError(error)),
  })

  /**
   * Выгрузка отчёта. Выполняется запросом через клиент, поскольку
   * переход по ссылке не передаёт маркера доступа и отклоняется
   * сервером.
   */
  const downloadReport = async (format: 'pdf' | 'xlsx') => {
    setDownloading(format)

    try {
      await api.portfolios.downloadReport(portfolioId, format, { confidence, horizon })
    } catch (error) {
      message.error(describeError(error))
    } finally {
      setDownloading(null)
    }
  }

  const data = portfolio.data
  const positions = useMemo(() => data?.positions ?? [], [data?.positions])
  const hasPositions = positions.length > 0

  const sorted = useMemo(
    () => [...positions].sort((a, b) => b.weight - a.weight),
    [positions],
  )

  const heaviest = sorted[0] ?? null
  const concentrated = heaviest !== null && heaviest.weight > ConcentrationThreshold

  const positionColumns: ColumnsType<Position> = [
    { title: 'Тикер', dataIndex: 'ticker', width: 88, render: (v: string) => <b>{v}</b> },
    { title: 'Инструмент', dataIndex: 'shortName', ellipsis: true, responsive: ['md'] },
    {
      title: 'Количество',
      dataIndex: 'quantity',
      align: 'right',
      width: 108,
      responsive: ['lg'],
      render: (value: number) => <span className="rl-num">{formatCount(value)}</span>,
    },
    {
      title: 'Цена покупки',
      dataIndex: 'purchasePrice',
      align: 'right',
      width: 118,
      responsive: ['xl'],
      render: (value: number) => <span className="rl-num">{formatMoney(value)}</span>,
    },
    {
      title: 'Текущая цена',
      dataIndex: 'lastPrice',
      align: 'right',
      width: 118,
      responsive: ['lg'],
      render: (value: number | null) => <span className="rl-num">{formatMoney(value)}</span>,
    },
    {
      title: 'Стоимость',
      dataIndex: 'currentValue',
      align: 'right',
      width: 128,
      render: (value: number) => <span className="rl-num">{formatMoney(value)}</span>,
    },
    {
      title: 'Результат',
      dataIndex: 'profitLossPercent',
      align: 'right',
      width: 108,
      render: (value: number) => (
        <Signed value={value}>{formatPercent(value, 1, true)}</Signed>
      ),
    },
    {
      title: 'Доля',
      dataIndex: 'weight',
      align: 'right',
      width: 88,
      render: (value: number) => (
        <span className="rl-num" style={{ fontWeight: value > ConcentrationThreshold ? 600 : 400 }}>
          {formatPercent(value, 1)}
        </span>
      ),
    },
    {
      title: '',
      width: 48,
      align: 'right',
      hidden: !canManagePortfolios,
      render: (_, record) => (
        <Popconfirm
          title="Удалить позицию?"
          okText="Удалить"
          cancelText="Отмена"
          okButtonProps={{ danger: true }}
          onConfirm={() => removePosition.mutate(record.id)}
        >
          <Button size="small" danger type="text" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  const varColumns: ColumnsType<VarResult> = [
    { title: 'Метод', dataIndex: 'title' },
    {
      title: 'VaR',
      dataIndex: 'valueAtRiskAbsolute',
      align: 'right',
      width: 136,
      render: (value: number) => <span className="rl-num">{formatMoney(value)}</span>,
    },
    {
      title: 'VaR, % стоимости',
      dataIndex: 'valueAtRiskRelative',
      align: 'right',
      width: 136,
      render: (value: number) => <span className="rl-num">{formatPercent(value, 2)}</span>,
    },
    {
      title: 'CVaR',
      dataIndex: 'expectedShortfallAbsolute',
      align: 'right',
      width: 136,
      render: (value: number) => (
        <Typography.Text strong className="rl-num">
          {formatMoney(value)}
        </Typography.Text>
      ),
    },
  ]

  const contributionColumns: ColumnsType<PositionRiskContribution> = [
    { title: 'Тикер', dataIndex: 'ticker', width: 88, render: (v: string) => <b>{v}</b> },
    {
      title: 'Доля в портфеле',
      dataIndex: 'weight',
      align: 'right',
      width: 128,
      render: (value: number) => <span className="rl-num">{formatPercent(value, 1)}</span>,
    },
    {
      title: 'Вклад в риск',
      dataIndex: 'contributionShare',
      align: 'right',
      width: 128,
      render: (value: number, record) => (
        <Typography.Text
          strong
          className="rl-num"
          style={{ color: value > record.weight ? colors.danger : colors.primary }}
        >
          {formatPercent(value, 1)}
          {/* Знак наряду с цветом: смысл не передаётся одним лишь цветом */}
          {value > record.weight ? ' ↑' : ' ↓'}
        </Typography.Text>
      ),
    },
    {
      title: 'Компонентная VaR',
      dataIndex: 'componentVar',
      align: 'right',
      width: 148,
      responsive: ['lg'],
      render: (value: number) => <span className="rl-num">{formatMoney(value)}</span>,
    },
    {
      title: 'Обособленная VaR',
      dataIndex: 'standaloneVar',
      align: 'right',
      width: 148,
      responsive: ['xl'],
      render: (value: number) => <span className="rl-num">{formatMoney(value)}</span>,
    },
    {
      title: 'Выигрыш от диверсификации',
      dataIndex: 'diversificationBenefit',
      align: 'right',
      width: 176,
      responsive: ['xl'],
      render: (value: number) => (
        <span className="rl-num" style={{ color: colors.primary }}>
          {formatMoney(value)}
        </span>
      ),
    },
  ]

  const contributions = useMemo(
    () => risk.data?.contributions ?? [],
    [risk.data?.contributions],
  )

  // Сопоставление доли позиции и её вклада в риск: расхождение столбцов
  // показывает влияние корреляции инструмента с остальным портфелем.
  const contributionChart = useMemo(
    () => ({
      ...baseOption(),
      tooltip: {
        ...baseOption().tooltip,
        axisPointer: { type: 'shadow' as const },
        valueFormatter: (value: number) => formatPercent(value, 1),
      },
      legend: {
        data: ['Доля в портфеле', 'Вклад в риск'],
        top: 0,
        icon: 'circle',
        itemWidth: 8,
        textStyle: { color: colors.muted, fontSize: 12 },
      },
      grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: contributions.map((item) => item.ticker),
        axisLine: { lineStyle: { color: colors.line } },
        axisTick: { show: false },
        axisLabel: { color: colors.muted, fontSize: 11 },
      },
      yAxis: {
        type: 'value' as const,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: colors.line, type: 'dashed' as const } },
        axisLabel: {
          color: colors.muted,
          fontSize: 11,
          formatter: (value: number) => `${(value * 100).toFixed(0)} %`,
        },
      },
      series: [
        {
          name: 'Доля в портфеле',
          type: 'bar' as const,
          itemStyle: { color: '#9CC5B6', borderRadius: [3, 3, 0, 0] },
          data: contributions.map((item) => item.weight),
        },
        {
          name: 'Вклад в риск',
          type: 'bar' as const,
          itemStyle: { color: colors.primary, borderRadius: [3, 3, 0, 0] },
          data: contributions.map((item) => item.contributionShare),
        },
      ],
    }),
    [contributions],
  )

  const structureChart = useMemo(
    () => ({
      ...baseOption(),
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: 'rgba(8, 31, 26, 0.92)',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 },
        valueFormatter: (value: number) => formatMoney(value),
      },
      series: [
        donutSeries(
          'Состав',
          sorted.map((position) => ({ name: position.ticker, value: position.currentValue })),
        ),
      ],
    }),
    [sorted],
  )

  const instrumentOptions = (instruments.data ?? []).map((instrument) => ({
    value: instrument.id,
    label: `${instrument.ticker} — ${instrument.shortName}`,
  }))

  const primaryVar = risk.data?.estimates?.[0] ?? null

  /** Параметры расчёта — общий элемент для обзора и вкладки риска. */
  const riskControls = (
    <Space size={10} wrap>
      <Segmented
        size="small"
        value={confidence}
        onChange={(value) => setConfidence(Number(value))}
        options={[
          { label: '95 %', value: 0.95 },
          { label: '99 %', value: 0.99 },
        ]}
      />
      <Segmented
        size="small"
        value={horizon}
        onChange={(value) => setHorizon(Number(value))}
        options={[
          { label: '1 день', value: 1 },
          { label: '10 дней', value: 10 },
        ]}
      />
      <Select
        size="small"
        style={{ width: 150 }}
        value={scenarios}
        onChange={setScenarios}
        options={[
          { value: 10_000, label: '10 тыс. сценариев' },
          { value: 100_000, label: '100 тыс. сценариев' },
          { value: 500_000, label: '500 тыс. сценариев' },
        ]}
      />
      <Button
        type="primary"
        size="small"
        icon={<ThunderboltOutlined />}
        loading={risk.isFetching}
        disabled={!hasPositions}
        onClick={() => {
          setRiskRequested(true)
          void risk.refetch()
        }}
      >
        Рассчитать
      </Button>

      {canManagePortfolios && (
        <Button
          size="small"
          icon={<SaveOutlined />}
          loading={enqueue.isPending}
          disabled={!hasPositions}
          onClick={() => enqueue.mutate()}
          title="Выполнить расчёт в фоновой очереди и сохранить результат в истории"
        >
          Сохранить в историю
        </Button>
      )}
    </Space>
  )

  const overview = (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <div
        className="rl-grid-split"
        style={{ gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)' }}
      >
        <Card>
          <SectionHead
            title="Структура портфеля"
            subtitle="Доли по текущей стоимости"
            extra={<Tag style={{ margin: 0, borderRadius: 999 }}>{positions.length} поз.</Tag>}
          />

          {!hasPositions ? (
            <EmptyBlock
              height={240}
              title="Позиции не добавлены"
              hint="Добавьте инструменты в портфель, чтобы увидеть его структуру и оценить риск."
              action={
                canManagePortfolios && (
                  <Button size="small" type="primary" onClick={() => setPositionOpen(true)}>
                    Добавить позицию
                  </Button>
                )
              }
            />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(150px, 190px) minmax(0, 1fr)',
                gap: 20,
                alignItems: 'center',
              }}
            >
              <div style={{ position: 'relative' }}>
                <ReactECharts option={structureChart} style={{ height: 190 }} notMerge />
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    placeItems: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <div className="rl-num" style={{ fontSize: 17, fontWeight: 700 }}>
                      {formatMoney(data?.currentValue)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>стоимость</div>
                  </div>
                </div>
              </div>

              <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                {sorted.slice(0, 5).map((position, index) => (
                  <div key={position.id}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12.5,
                        marginBottom: 4,
                      }}
                    >
                      <span>
                        <b>{position.ticker}</b>
                        <span style={{ color: 'var(--muted)' }}> · {position.shortName}</span>
                      </span>
                      <span className="rl-num" style={{ fontWeight: 600 }}>
                        {formatPercent(position.weight, 1)}
                      </span>
                    </div>

                    <div
                      style={{
                        height: 6,
                        borderRadius: 3,
                        background: 'var(--canvas)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, position.weight * 100)}%`,
                          height: '100%',
                          borderRadius: 3,
                          background: seriesPalette[index % seriesPalette.length],
                        }}
                      />
                    </div>
                  </div>
                ))}

                {concentrated && heaviest && (
                  <Tag
                    icon={<WarningOutlined />}
                    color="warning"
                    style={{ margin: 0, borderRadius: 999, whiteSpace: 'normal' }}
                  >
                    Высокая концентрация {heaviest.ticker}
                  </Tag>
                )}
              </Space>
            </div>
          )}
        </Card>

        <Card>
          <SectionHead
            title="Риск и устойчивость"
            subtitle={
              risk.data
                ? `Расчёт от ${formatDate(risk.data.to)} · ${formatDuration(risk.data.durationMs)}`
                : 'Расчёт не выполнялся'
            }
            extra={
              <Button
                type="primary"
                size="small"
                icon={<ThunderboltOutlined />}
                loading={risk.isFetching}
                disabled={!hasPositions}
                onClick={() => {
                  setRiskRequested(true)
                  void risk.refetch()
                }}
              >
                Рассчитать
              </Button>
            }
          />

          {risk.isFetching ? (
            <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
              <Spin />
            </div>
          ) : !risk.data ? (
            <EmptyBlock
              height={200}
              title="Мера риска не рассчитана"
              hint={
                hasPositions
                  ? 'Нажмите «Рассчитать»: оценка выполняется по истории котировок всеми реализованными методами.'
                  : 'Сначала добавьте в портфель хотя бы одну позицию.'
              }
            />
          ) : (
            <Space orientation="vertical" size={14} style={{ width: '100%' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  {
                    label: `VaR ${formatPercent(confidence, 0)}`,
                    value: formatMoney(primaryVar?.valueAtRiskAbsolute),
                    hint: `${horizon} дн.`,
                  },
                  {
                    label: `CVaR ${formatPercent(confidence, 0)}`,
                    value: formatMoney(primaryVar?.expectedShortfallAbsolute),
                    hint: `${horizon} дн.`,
                  },
                  {
                    label: 'Волатильность',
                    value: formatPercent(risk.data.portfolioVolatilityAnnualized, 1),
                    hint: 'годовых',
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      padding: '12px 14px',
                      border: '1px solid var(--line)',
                      borderRadius: 12,
                    }}
                  >
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{item.label}</div>
                    <div className="rl-num" style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>
                      {item.value}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{item.hint}</div>
                  </div>
                ))}
              </div>

              {concentrated && heaviest && (
                <Alert
                  type="warning"
                  showIcon
                  message="Концентрационный риск"
                  description={
                    <span style={{ fontSize: 12 }}>
                      {formatPercent(heaviest.weight, 1)} стоимости сосредоточено в позиции{' '}
                      {heaviest.ticker}. Оптимизация структуры способна снизить ожидаемый риск
                      за счёт перераспределения долей.
                    </span>
                  }
                />
              )}

              <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
                {risk.data.conclusion}
              </Typography.Paragraph>

              <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setTab('risk')}>
                Открыть подробную интерпретацию →
              </Button>
            </Space>
          )}
        </Card>
      </div>

      <Card>
        <SectionHead
          title="Крупнейшие позиции"
          subtitle="Текущая стоимость и вклад в результат"
          extra={
            hasPositions && (
              <Button size="small" onClick={() => setTab('positions')}>
                Полный состав
              </Button>
            )
          }
        />

        <Table
          className="rl-table"
          rowKey="id"
          size="small"
          pagination={false}
          columns={positionColumns.filter((column) => column.title !== '')}
          dataSource={sorted.slice(0, 5)}
          loading={portfolio.isLoading}
          locale={{ emptyText: 'Позиции не добавлены' }}
        />
      </Card>
    </Space>
  )

  const riskTab = (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <SectionHead
          title="Сопоставление методов"
          subtitle={
            risk.data
              ? `${formatDate(risk.data.from)} — ${formatDate(risk.data.to)} · ${formatCount(
                  risk.data.observationCount,
                )} наблюдений`
              : 'Задайте параметры и выполните расчёт'
          }
          extra={riskControls}
        />

        {risk.isError && (
          <Alert type="error" showIcon message={describeError(risk.error)} />
        )}

        {risk.isFetching && (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 180 }}>
            <Spin tip="Выполняется моделирование" />
          </div>
        )}

        {!riskRequested && !risk.isFetching && (
          <EmptyBlock
            height={180}
            title="Расчёт не выполнялся"
            hint="Оценка строится по истории котировок за десять лет всеми реализованными методами: параметрическим, историческим и методом Монте-Карло."
          />
        )}

        {risk.data && !risk.isFetching && (
          <Table
            className="rl-table"
            rowKey={(record) => record.description}
            size="small"
            pagination={false}
            columns={varColumns}
            dataSource={risk.data.estimates}
          />
        )}
      </Card>

      {risk.data && !risk.isFetching && (
        <>
          <div
            className="rl-grid-split"
            style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}
          >
            <Card>
              <SectionHead
                title="Доля в портфеле и вклад в риск"
                subtitle="Расхождение столбцов отражает корреляцию с остальным портфелем"
              />
              <ReactECharts option={contributionChart} style={{ height: 280 }} notMerge />
            </Card>

            <Card>
              <SectionHead title="Эффект диверсификации" subtitle="Сопоставление мер риска" />

              <Space orientation="vertical" size={14} style={{ width: '100%' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Сумма обособленных мер
                    </div>
                    <div className="rl-num" style={{ fontSize: 19, fontWeight: 700 }}>
                      {formatMoney(risk.data.sumOfStandaloneVar)}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Риск портфеля</div>
                    <div
                      className="rl-num"
                      style={{ fontSize: 19, fontWeight: 700, color: colors.primary }}
                    >
                      {formatMoney(primaryVar?.valueAtRiskAbsolute)}
                    </div>
                  </div>
                </div>

                <Alert
                  type="success"
                  showIcon
                  message={`Диверсификация снижает риск на ${formatPercent(
                    1 -
                      (primaryVar?.valueAtRiskAbsolute ?? 0) / risk.data.sumOfStandaloneVar,
                    1,
                  )}`}
                  description={
                    <span style={{ fontSize: 12 }}>{risk.data.conclusion}</span>
                  }
                />
              </Space>
            </Card>
          </div>

          <Card>
            <SectionHead
              title="Разложение риска по позициям"
              subtitle="Компонентная, обособленная и предельная меры"
            />

            <Table
              className="rl-table"
              rowKey="instrumentId"
              size="small"
              pagination={false}
              columns={contributionColumns}
              dataSource={contributions}
              summary={() => (
                <Table.Summary.Row style={{ fontWeight: 600, background: '#F7FAF9' }}>
                  <Table.Summary.Cell index={0}>Итого</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    100,0 %
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    100,0 %
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    {formatMoney(contributions.reduce((sum, i) => sum + i.componentVar, 0))}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    {formatMoney(risk.data!.sumOfStandaloneVar)}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    {formatMoney(
                      contributions.reduce((sum, i) => sum + i.diversificationBenefit, 0),
                    )}
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />

            <Typography.Paragraph
              type="secondary"
              style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}
            >
              Сумма компонентных мер риска в точности равна стоимостной мере риска портфеля
              (тождество Эйлера). Позиция, вклад которой в риск превышает её долю в портфеле,
              отмечена стрелкой вверх: её сокращение снижает риск сильнее прочих.
            </Typography.Paragraph>
          </Card>
        </>
      )}
    </Space>
  )

  return (
    <Space orientation="vertical" size={18} style={{ width: '100%' }}>
      {/* Закреплённая верхняя зона: наименование, бенчмарк, действия */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Space align="center" wrap size={12}>
            <Typography.Title level={2} style={{ margin: 0, fontSize: 27, letterSpacing: -0.5 }}>
              {data?.name ?? 'Портфель'}
            </Typography.Title>

            {data?.benchmarkTicker && (
              <Tag style={{ margin: 0, borderRadius: 999 }}>
                {data.benchmarkTicker} · бенчмарк
              </Tag>
            )}
          </Space>

          <Typography.Text type="secondary">
            {positions.length === 0
              ? 'Позиции не добавлены'
              : `${positions.length} поз. · вложено ${formatMoney(data?.purchaseValue)}`}
          </Typography.Text>
        </div>

        <Space wrap>
          <Button
            icon={<FilePdfOutlined />}
            disabled={!hasPositions}
            loading={downloading === 'pdf'}
            onClick={() => void downloadReport('pdf')}
          >
            PDF
          </Button>

          <Button
            icon={<FileExcelOutlined />}
            disabled={!hasPositions}
            loading={downloading === 'xlsx'}
            onClick={() => void downloadReport('xlsx')}
          >
            Excel
          </Button>

          {canManagePortfolios && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setPositionOpen(true)}>
              Добавить позицию
            </Button>
          )}
        </Space>
      </div>

      {portfolio.isError && (
        <Alert type="error" showIcon message={describeError(portfolio.error)} />
      )}

      <div className="rl-grid-kpi">
        <StatCard
          label="Вложено"
          value={formatMoney(data?.purchaseValue)}
          hint="стоимость приобретения"
          loading={portfolio.isLoading}
        />
        <StatCard
          label="Текущая стоимость"
          value={formatMoney(data?.currentValue)}
          hint={
            data ? `${formatPercent(data.profitLossPercent, 1, true)} к вложениям` : undefined
          }
          loading={portfolio.isLoading}
        />
        <StatCard
          label="Финансовый результат"
          value={formatPercent(data?.profitLossPercent, 1, true)}
          hint={formatMoney(data?.profitLoss)}
          tone={(data?.profitLoss ?? 0) >= 0 ? 'positive' : 'negative'}
          loading={portfolio.isLoading}
        />
        <StatCard
          label={`VaR ${formatPercent(confidence, 0)}, ${horizon} дн.`}
          value={primaryVar ? formatMoney(primaryVar.valueAtRiskAbsolute) : '—'}
          hint={
            primaryVar
              ? `${formatPercent(primaryVar.valueAtRiskRelative, 2)} стоимости`
              : 'расчёт не выполнялся'
          }
          loading={risk.isFetching}
        />
      </div>

      <div className="rl-sticky-tabs">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: 'overview', label: 'Обзор' },
            { key: 'positions', label: 'Состав' },
            { key: 'risk', label: 'Оценка риска' },
            { key: 'stress', label: 'Стресс-тест' },
            { key: 'optimization', label: 'Оптимизация Марковица' },
          ]}
        />
      </div>

      {tab === 'overview' && overview}

      {tab === 'positions' && (
        <Card>
          <SectionHead
            title="Состав портфеля"
            subtitle="Позиции с переоценкой по последним котировкам"
            extra={
              canManagePortfolios && (
                <Button size="small" icon={<PlusOutlined />} onClick={() => setPositionOpen(true)}>
                  Добавить
                </Button>
              )
            }
          />

          <Table
            className="rl-table"
            rowKey="id"
            size="small"
            pagination={false}
            columns={positionColumns}
            dataSource={positions}
            loading={portfolio.isLoading}
            locale={{ emptyText: 'Позиции не добавлены' }}
          />
        </Card>
      )}

      {tab === 'risk' && riskTab}

      {tab === 'stress' && (
        <StressTestPanel portfolioId={portfolioId} disabled={!hasPositions} />
      )}

      {tab === 'optimization' && (
        <OptimizationPanel portfolioId={portfolioId} disabled={positions.length < 2} />
      )}

      <Modal
        title="Добавление позиции"
        open={positionOpen}
        onCancel={() => setPositionOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={addPosition.isPending}
        okText="Добавить"
        cancelText="Отмена"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => addPosition.mutate(values)}
          initialValues={{ purchaseDate: dayjs() }}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="instrumentId"
            label="Инструмент"
            rules={[{ required: true, message: 'Выберите инструмент' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Выберите инструмент из справочника"
              options={instrumentOptions}
            />
          </Form.Item>

          <Form.Item
            name="quantity"
            label="Количество"
            rules={[{ required: true, message: 'Укажите количество' }]}
          >
            <InputNumber style={{ width: '100%' }} min={0.000001} step={1} />
          </Form.Item>

          <Form.Item
            name="purchasePrice"
            label="Цена приобретения, ₽"
            rules={[{ required: true, message: 'Укажите цену' }]}
          >
            <InputNumber style={{ width: '100%' }} min={0.000001} step={1} />
          </Form.Item>

          <Form.Item
            name="purchaseDate"
            label="Дата приобретения"
            rules={[{ required: true, message: 'Укажите дату' }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
