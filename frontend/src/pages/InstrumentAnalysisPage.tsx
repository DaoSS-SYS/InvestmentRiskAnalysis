import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  InputNumber,
  Segmented,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { DownOutlined, UpOutlined, WarningOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'

import { api, describeError } from '../api/client'
import BacktestPanel from '../components/BacktestPanel'
import type { VarEstimate } from '../api/types'
import { Card, ChartSkeleton, EmptyBlock, SectionHead, Signed, StatCard } from '../components/ui/primitives'
import { areaSeries, baseOption, categoryAxis, valueAxis } from '../components/charts/chartTheme'
import { colors } from '../theme/tokens'
import {
  formatCount,
  formatDate,
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
} from '../lib/format'

/**
 * Раскрываемое методологическое пояснение.
 *
 * Краткий вывод виден сразу, развёрнутое обоснование раскрывается
 * по требованию. Порядок существен: методология, занимающая основной
 * экран постоянно, вытесняет с него сами результаты.
 */
function Interpretation({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <Button
        type="link"
        size="small"
        style={{ padding: 0, height: 'auto' }}
        onClick={() => setOpen((value) => !value)}
        icon={open ? <UpOutlined /> : <DownOutlined />}
        iconPlacement="end"
      >
        {open ? 'Свернуть пояснение' : 'Как интерпретировать результат'}
      </Button>

      {open && (
        <Typography.Paragraph
          type="secondary"
          style={{ fontSize: 12.5, marginTop: 10, marginBottom: 0, lineHeight: 1.6 }}
        >
          {children}
        </Typography.Paragraph>
      )}
    </div>
  )
}

/**
 * Анализ отдельного финансового инструмента.
 *
 * Содержимое разделено на вкладки: динамика и сводные показатели,
 * распределение доходностей с проверкой нормальности, сопоставление
 * методов оценки риска, модель CAPM и бэктестирование.
 */
export default function InstrumentAnalysisPage() {
  const { id } = useParams<{ id: string }>()
  const instrumentId = Number(id)

  const [tab, setTab] = useState('overview')
  const [confidence, setConfidence] = useState(0.99)
  const [horizon, setHorizon] = useState(1)
  const [positionValue, setPositionValue] = useState(1_000_000)

  const instruments = useQuery({ queryKey: ['instruments'], queryFn: api.instruments.list })
  const instrument = instruments.data?.find((item) => item.id === instrumentId)

  // Эталонным портфелем для оценки параметров модели CAPM служит биржевой
  // индекс из справочника. Для самого индекса оценка не выполняется:
  // коэффициент бета относительно самого себя тождественно равен единице.
  const benchmark = instruments.data?.find(
    (item) => item.securityType === 'Index' && item.id !== instrumentId,
  )

  const series = useQuery({
    queryKey: ['series', instrumentId],
    queryFn: () => api.instruments.series(instrumentId),
    enabled: Number.isFinite(instrumentId),
  })

  const returns = useQuery({
    queryKey: ['returns', instrumentId],
    queryFn: () => api.analysis.returns(instrumentId),
    enabled: Number.isFinite(instrumentId),
  })

  const varAnalysis = useQuery({
    queryKey: ['var', instrumentId, confidence, horizon, positionValue],
    queryFn: () =>
      api.analysis.valueAtRisk(instrumentId, { confidence, horizon, value: positionValue }),
    enabled: Number.isFinite(instrumentId),
  })

  const performance = useQuery({
    queryKey: ['performance', instrumentId, benchmark?.id],
    queryFn: () => api.analysis.performance(instrumentId, benchmark?.id),
    enabled: Number.isFinite(instrumentId) && instruments.isSuccess,
  })

  const statistics = returns.data?.statistics
  const normality = returns.data?.normality
  const metrics = performance.data?.performance
  const capm = performance.data?.capm

  const points = useMemo(() => series.data?.points ?? [], [series.data?.points])
  const lastPoint = points.at(-1)
  const previousPoint = points.at(-2)

  const dailyChange =
    lastPoint && previousPoint && previousPoint.adjustedClose > 0
      ? (lastPoint.adjustedClose - previousPoint.adjustedClose) / previousPoint.adjustedClose
      : null

  const priceChart = useMemo(
    () => ({
      ...baseOption(),
      grid: { left: 8, right: 16, top: 16, bottom: 56, containLabel: true },
      xAxis: categoryAxis({
        data: points.map((point) => point.date),
        axisLabel: {
          color: colors.muted,
          fontSize: 11,
          hideOverlap: true,
          formatter: (value: string) => formatDate(value),
        },
      }),
      yAxis: valueAxis({ scale: true }),
      dataZoom: [
        { type: 'inside' as const },
        { type: 'slider' as const, height: 22, bottom: 10, borderColor: colors.line },
      ],
      tooltip: {
        ...baseOption().tooltip,
        valueFormatter: (value: number) => formatMoney(value),
      },
      series: [
        areaSeries('Цена закрытия', points.map((point) => point.adjustedClose)),
      ],
    }),
    [points],
  )

  const histogram = useMemo(() => returns.data?.histogram ?? [], [returns.data?.histogram])

  const histogramChart = useMemo(
    () => ({
      ...baseOption(),
      grid: { left: 8, right: 16, top: 36, bottom: 42, containLabel: true },
      legend: {
        data: ['Наблюдаемая частота', 'Нормальное распределение'],
        top: 0,
        icon: 'circle',
        itemWidth: 8,
        textStyle: { color: colors.muted, fontSize: 12 },
      },
      tooltip: { ...baseOption().tooltip, axisPointer: { type: 'shadow' as const } },
      xAxis: {
        type: 'category' as const,
        data: histogram.map((bin) => (bin.lowerBound * 100).toFixed(1)),
        name: 'доходность, %',
        nameLocation: 'middle' as const,
        nameGap: 28,
        nameTextStyle: { color: colors.muted, fontSize: 11 },
        axisLine: { lineStyle: { color: colors.line } },
        axisTick: { show: false },
        axisLabel: {
          color: colors.muted,
          fontSize: 11,
          interval: Math.max(0, Math.floor(histogram.length / 12)),
        },
      },
      yAxis: valueAxis(),
      series: [
        {
          name: 'Наблюдаемая частота',
          type: 'bar' as const,
          itemStyle: { color: colors.primary, borderRadius: [2, 2, 0, 0] },
          data: histogram.map((bin) => bin.observedFrequency),
        },
        {
          name: 'Нормальное распределение',
          type: 'line' as const,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2.2, color: colors.warning },
          data: histogram.map((bin) => bin.normalFrequency),
        },
      ],
    }),
    [histogram],
  )

  /**
   * Признак соответствия метода предпосылкам.
   *
   * Вывод делается из результата проверки гипотезы о нормальности,
   * а не назначается произвольно: параметрический метод исходит
   * из нормальности распределения доходностей, и при отвержении
   * гипотезы его предпосылка нарушена. Историческое моделирование
   * и метод Монте-Карло с эмпирическим распределением такой
   * предпосылки не вводят.
   */
  const methodStatus = (name: string): { text: string; color: string } | null => {
    if (!normality) {
      return null
    }

    const isParametric = name.toLowerCase().includes('параметрическ')
    const isHistorical = name.toLowerCase().includes('историческ')

    if (normality.isNormalityRejected) {
      if (isParametric) return { text: 'предпосылка нарушена', color: 'warning' }
      if (isHistorical) return { text: 'рекомендуется', color: 'success' }

      return { text: 'устойчивый', color: 'default' }
    }

    return isParametric ? { text: 'рекомендуется', color: 'success' } : null
  }

  const varColumns = [
    {
      title: 'Метод',
      dataIndex: 'name',
      key: 'name',
      render: (value: string) => {
        const status = methodStatus(value)

        return (
          <Space size={8} wrap>
            <span style={{ fontWeight: status?.color === 'success' ? 600 : 400 }}>{value}</span>
            {status && (
              <Tag color={status.color} style={{ margin: 0, borderRadius: 999 }}>
                {status.text}
              </Tag>
            )}
          </Space>
        )
      },
    },
    {
      title: 'VaR, %',
      key: 'varRelative',
      align: 'right' as const,
      width: 110,
      render: (_: unknown, record: VarEstimate) => (
        <span className="rl-num">{formatPercent(record.result.valueAtRiskRelative, 3)}</span>
      ),
    },
    {
      title: 'VaR, ₽',
      key: 'varAbsolute',
      align: 'right' as const,
      width: 130,
      render: (_: unknown, record: VarEstimate) => (
        <span className="rl-num">{formatMoney(record.result.valueAtRiskAbsolute)}</span>
      ),
    },
    {
      title: 'CVaR, %',
      key: 'cvarRelative',
      align: 'right' as const,
      width: 110,
      responsive: ['lg' as const],
      render: (_: unknown, record: VarEstimate) => (
        <span className="rl-num">
          {formatPercent(record.result.expectedShortfallRelative, 3)}
        </span>
      ),
    },
    {
      title: 'CVaR, ₽',
      key: 'cvarAbsolute',
      align: 'right' as const,
      width: 130,
      render: (_: unknown, record: VarEstimate) => (
        <Typography.Text strong className="rl-num">
          {formatMoney(record.result.expectedShortfallAbsolute)}
        </Typography.Text>
      ),
    },
    {
      title: 'Время',
      dataIndex: 'durationMs',
      key: 'durationMs',
      align: 'right' as const,
      width: 86,
      responsive: ['xl' as const],
      render: (value: number) => (
        <span className="rl-num" style={{ color: colors.muted }}>
          {formatDuration(value)}
        </span>
      ),
    },
  ]

  if (!Number.isFinite(instrumentId)) {
    return <Alert type="error" showIcon message="Инструмент не указан" />
  }

  const varControls = (
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
      <InputNumber
        size="small"
        style={{ width: 148 }}
        value={positionValue}
        min={1000}
        step={100_000}
        formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
        parser={(value) => Number((value ?? '').replace(/\s/g, ''))}
        onChange={(value) => setPositionValue(value ?? 1_000_000)}
        addonAfter="₽"
      />
    </Space>
  )

  return (
    <Space orientation="vertical" size={18} style={{ width: '100%' }}>
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
            <Typography.Title level={2} style={{ margin: 0, fontSize: 29, letterSpacing: -0.6 }}>
              {instrument?.ticker ?? '—'}
            </Typography.Title>

            {instrument && (
              <Tag style={{ margin: 0, borderRadius: 999 }}>
                {instrument.securityType === 'Index' ? 'Индекс' : 'Акция'} · {instrument.board}
              </Tag>
            )}
          </Space>

          <Typography.Text type="secondary">
            {instrument?.shortName}
            {returns.data &&
              ` · данные за ${formatDate(returns.data.from)}—${formatDate(returns.data.to)}`}
          </Typography.Text>
        </div>
      </div>

      {returns.isError && <Alert type="error" showIcon message={describeError(returns.error)} />}

      <div className="rl-sticky-tabs">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: 'overview', label: 'Обзор' },
            { key: 'returns', label: 'Доходности' },
            { key: 'var', label: 'Стоимостная мера риска' },
            { key: 'capm', label: 'CAPM' },
            { key: 'backtest', label: 'Бэктестирование' },
          ]}
        />
      </div>

      {tab === 'overview' && (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <div className="rl-grid-kpi">
            <StatCard
              label="Текущая цена"
              value={formatMoney(lastPoint?.adjustedClose)}
              hint={
                dailyChange === null
                  ? formatDate(lastPoint?.date)
                  : `${formatPercent(dailyChange, 2, true)} за день`
              }
              loading={series.isLoading}
            />

            <StatCard
              label="Доходность, годовых"
              value={formatPercent(metrics?.annualizedReturn, 2, true)}
              hint="за весь период наблюдений"
              tone={(metrics?.annualizedReturn ?? 0) >= 0 ? 'positive' : 'negative'}
              loading={performance.isLoading}
            />

            <StatCard
              label="Волатильность"
              value={formatPercent(statistics?.annualizedVolatility)}
              hint="годовых"
              loading={returns.isLoading}
            />

            <StatCard
              label="Максимальная просадка"
              value={formatPercent(performance.data?.drawdown.maxDrawdown)}
              hint="исторический максимум"
              tone="negative"
              loading={performance.isLoading}
            />
          </div>

          <div
            className="rl-grid-split"
            style={{ gridTemplateColumns: 'minmax(0, 1.75fr) minmax(0, 1fr)' }}
          >
            <Card>
              <SectionHead
                title="Динамика цены"
                subtitle={
                  returns.data
                    ? `${formatCount(returns.data.returnCount)} торговых наблюдений`
                    : 'скорректированная цена закрытия'
                }
              />

              {series.isLoading ? (
                <ChartSkeleton height={330} />
              ) : points.length === 0 ? (
                <EmptyBlock
                  height={330}
                  title="История котировок не загружена"
                  hint="Загрузите историю по этому инструменту в справочнике."
                />
              ) : (
                <ReactECharts option={priceChart} style={{ height: 330 }} notMerge />
              )}
            </Card>

            <Card>
              <SectionHead title="Краткий вывод" subtitle="Свойства распределения доходностей" />

              {returns.isLoading ? (
                <ChartSkeleton height={240} />
              ) : !normality ? (
                <EmptyBlock height={240} title="Данные для анализа отсутствуют" />
              ) : (
                <Space orientation="vertical" size={14} style={{ width: '100%' }}>
                  {normality.isNormalityRejected && (
                    <Tag
                      icon={<WarningOutlined />}
                      color="warning"
                      style={{ margin: 0, borderRadius: 999 }}
                    >
                      Требует внимания
                    </Tag>
                  )}

                  <Typography.Title level={5} style={{ margin: 0, fontSize: 16 }}>
                    {normality.isNormalityRejected
                      ? 'Распределение доходностей отличается от нормального'
                      : 'Распределение близко к нормальному'}
                  </Typography.Title>

                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {normality.isNormalityRejected
                      ? 'Параметрический метод исходит из нормальности и здесь неприменим без оговорок. Для выводов используйте историческое моделирование либо метод Монте-Карло.'
                      : 'Предпосылки параметрического метода выполняются.'}
                  </Typography.Text>

                  <Interpretation>{normality.conclusion}</Interpretation>

                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                    {[
                      { label: 'Коэффициент Шарпа', value: formatNumber(metrics?.sharpeRatio, 2) },
                      { label: 'Асимметрия', value: formatNumber(statistics?.skewness, 3) },
                      { label: 'Эксцесс', value: formatNumber(statistics?.excessKurtosis, 2) },
                    ].map((row) => (
                      <div
                        key={row.label}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '6px 0',
                          fontSize: 12.5,
                        }}
                      >
                        <span style={{ color: 'var(--muted)' }}>{row.label}</span>
                        <span className="rl-num" style={{ fontWeight: 600 }}>
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </Space>
              )}
            </Card>
          </div>
        </Space>
      )}

      {tab === 'returns' && (
        <div
          className="rl-grid-split"
          style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}
        >
          <Card>
            <SectionHead
              title="Распределение доходностей"
              subtitle="Наблюдаемые частоты и нормальное распределение тех же параметров"
            />

            {returns.isLoading ? (
              <ChartSkeleton height={320} />
            ) : histogram.length === 0 ? (
              <EmptyBlock height={320} title="Недостаточно наблюдений" />
            ) : (
              <ReactECharts option={histogramChart} style={{ height: 320 }} notMerge />
            )}
          </Card>

          <Card>
            <SectionHead
              title="Проверка гипотезы о нормальности"
              subtitle="Критерий Жарка — Бера"
            />

            {returns.isLoading ? (
              <ChartSkeleton height={280} />
            ) : !normality ? (
              <EmptyBlock height={280} title="Данные отсутствуют" />
            ) : (
              <Space orientation="vertical" size={14} style={{ width: '100%' }}>
                <Alert
                  type={normality.isNormalityRejected ? 'warning' : 'success'}
                  showIcon
                  message={
                    normality.isNormalityRejected
                      ? 'Гипотеза о нормальности отвергается'
                      : 'Гипотеза о нормальности не отвергается'
                  }
                />

                {[
                  { label: 'Статистика критерия', value: formatNumber(normality.statistic, 1) },
                  { label: 'Критическое значение', value: formatNumber(normality.criticalValue, 2) },
                  { label: 'Коэффициент асимметрии', value: formatNumber(statistics?.skewness, 3) },
                  { label: 'Коэффициент эксцесса', value: formatNumber(statistics?.excessKurtosis, 2) },
                  {
                    label: 'Среднее, годовых',
                    value: formatPercent(statistics?.annualizedMean, 2, true),
                  },
                  {
                    label: 'Волатильность, годовых',
                    value: formatPercent(statistics?.annualizedVolatility, 2),
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      paddingBottom: 10,
                      borderBottom: '1px solid var(--line)',
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: 'var(--muted)' }}>{row.label}</span>
                    <span className="rl-num" style={{ fontWeight: 600 }}>
                      {row.value}
                    </span>
                  </div>
                ))}

                <Interpretation>{normality.conclusion}</Interpretation>
              </Space>
            )}
          </Card>
        </div>
      )}

      {tab === 'var' && (
        <Card>
          <SectionHead
            title="Сопоставление методов"
            subtitle={`Уровень доверия ${formatPercent(confidence, 0)} · горизонт ${horizon} дн. · позиция ${formatMoney(positionValue)}`}
            extra={varControls}
          />

          {varAnalysis.isLoading ? (
            <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
              <Spin />
            </div>
          ) : (
            <Space orientation="vertical" size={14} style={{ width: '100%' }}>
              <Table
                className="rl-table"
                rowKey="name"
                size="small"
                pagination={false}
                columns={varColumns}
                dataSource={varAnalysis.data?.estimates ?? []}
              />

              {varAnalysis.data && <Interpretation>{varAnalysis.data.conclusion}</Interpretation>}
            </Space>
          )}
        </Card>
      )}

      {tab === 'capm' && (
        <Card>
          <SectionHead
            title="Модель оценки капитальных активов"
            subtitle={
              performance.data?.benchmarkTicker
                ? `Эталонный портфель: ${performance.data.benchmarkTicker}`
                : 'Эталонный портфель не определён'
            }
          />

          {performance.isLoading ? (
            <ChartSkeleton height={200} />
          ) : !capm ? (
            <EmptyBlock
              height={200}
              title="Оценка CAPM недоступна"
              hint="Для оценки требуется биржевой индекс в справочнике инструментов. Для самого индекса коэффициент бета тождественно равен единице."
            />
          ) : (
            <Space orientation="vertical" size={16} style={{ width: '100%' }}>
              <div className="rl-grid-kpi">
                <StatCard label="Коэффициент бета" value={formatNumber(capm.beta, 3)} hint="чувствительность к рынку" />

                <StatCard
                  label="Альфа Йенсена, годовых"
                  value={
                    <Signed value={capm.alphaAnnualized}>
                      {formatPercent(capm.alphaAnnualized, 2, true)}
                    </Signed>
                  }
                  hint={capm.alphaIsSignificant ? 'статистически значима' : 'статистически не значима'}
                />

                <StatCard
                  label="Систематический риск"
                  value={formatPercent(capm.systematicRiskShare, 1)}
                  hint="доля общей дисперсии"
                />

                <StatCard
                  label="Коэффициент детерминации"
                  value={formatNumber(capm.rSquared, 3)}
                  hint="качество подгонки"
                />
              </div>

              <Interpretation>{capm.conclusion}</Interpretation>
            </Space>
          )}
        </Card>
      )}

      {tab === 'backtest' && <BacktestPanel instrumentId={instrumentId} />}
    </Space>
  )
}
