import { useMemo, useState } from 'react'
import { App, Button, Segmented, Space, Tag, Typography } from 'antd'
import {
  DatabaseOutlined,
  EyeOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  FundOutlined,
  LineChartOutlined,
  SafetyOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'

import { api, describeError } from '../../api/client'
import {
  summarize,
  useDataFreshness,
  useLatestCalculations,
  usePortfolioValueSeries,
} from '../../hooks/usePortfolioAggregates'
import { Card, ChartSkeleton, EmptyBlock, SectionHead, StatCard } from '../../components/ui/primitives'
import { areaSeries, baseOption, categoryAxis, valueAxis } from '../../components/charts/chartTheme'
import { colors } from '../../theme/tokens'
import { formatDate, formatDateTime, formatMoney, formatPercent } from '../../lib/format'

/**
 * Главная страница наблюдателя.
 *
 * Отвечает на вопрос «каково общее состояние доступных портфелей».
 * Страница не содержит ни одного действия, изменяющего данные:
 * выгрузка отчёта таким действием не является, поскольку отчёт
 * формируется по имеющимся данным и ничего не записывает.
 */
export default function ViewerDashboard() {
  const { message } = App.useApp()
  const [months, setMonths] = useState(6)
  const [downloading, setDownloading] = useState<string | null>(null)

  /**
   * Выгрузка отчёта выполняется запросом через клиент, а не переходом
   * по ссылке: переход не передаёт маркера доступа и отклоняется
   * сервером. Ознакомление с отчётом состояния системы не изменяет
   * и потому доступно наблюдателю.
   */
  const download = async (portfolioId: number, format: 'pdf' | 'xlsx') => {
    const key = `${portfolioId}-${format}`
    setDownloading(key)

    try {
      await api.portfolios.downloadReport(portfolioId, format)
    } catch (error) {
      message.error(describeError(error))
    } finally {
      setDownloading(null)
    }
  }

  const portfolios = useQuery({ queryKey: ['portfolios'], queryFn: api.portfolios.list })
  const totals = useMemo(() => summarize(portfolios.data ?? []), [portfolios.data])

  const calculations = useLatestCalculations(portfolios.data)
  const history = usePortfolioValueSeries(portfolios.data, months)
  const freshness = useDataFreshness()

  const valueChart = useMemo(() => {
    const points = history.points

    return {
      ...baseOption(),
      xAxis: categoryAxis({ data: points.map((p) => formatDate(p.date)) }),
      yAxis: valueAxis({
        axisLabel: {
          color: colors.muted,
          fontSize: 11,
          formatter: (value: number) =>
            value >= 1e6
              ? `${(value / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`
              : `${Math.round(value / 1000)} тыс.`,
        },
      }),
      tooltip: {
        ...baseOption().tooltip,
        valueFormatter: (value: number) => formatMoney(value),
      },
      series: [areaSeries('Стоимость', points.map((p) => p.value), colors.cyan)],
    }
  }, [history.points])

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
            Обзор портфелей
          </Typography.Title>
          <Typography.Text type="secondary">
            Доступные показатели, результаты расчётов и отчёты
          </Typography.Text>
        </div>

        {/* Метка режима заметна, но спокойна: она сообщает о полномочиях,
            а не предупреждает об ошибке. */}
        <Tag
          icon={<EyeOutlined />}
          style={{
            margin: 0,
            borderRadius: 999,
            paddingInline: 14,
            paddingBlock: 5,
            fontSize: 13,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            color: 'var(--muted)',
          }}
        >
          Режим просмотра
        </Tag>
      </div>

      <div className="rl-hero">
        <div className="rl-hero__eyebrow">
          <EyeOutlined />
          Информационная сводка
        </div>

        <h2 className="rl-hero__title">
          {totals.count === 0
            ? 'Портфели недоступны'
            : calculations.covered === 0
              ? 'Сохранённых расчётов риска нет'
              : 'Сведения о портфелях доступны'}
        </h2>

        <p className="rl-hero__text">
          {totals.count === 0
            ? 'В системе пока нет портфелей. Они появятся здесь после того, как аналитик их создаст.'
            : calculations.covered === 0
              ? 'Состав и стоимость портфелей доступны для ознакомления. Мера риска появится после того, как аналитик сохранит расчёт в истории.'
              : `Данные доступны для ознакомления. Последний расчёт выполнен ${
                  calculations.lastFinishedAt
                    ? formatDateTime(calculations.lastFinishedAt).toLowerCase()
                    : 'ранее'
                }.`}
        </p>

        <div className="rl-hero__metrics">
          <div>
            <div className="rl-hero__metric-label">Общая стоимость</div>
            <div className="rl-hero__metric-value rl-num">{formatMoney(totals.currentValue)}</div>
          </div>

          <div>
            <div className="rl-hero__metric-label">Изменение за период</div>
            <div className="rl-hero__metric-value rl-num">
              {history.changePercent === null
                ? '—'
                : formatPercent(history.changePercent, 1, true)}
            </div>
          </div>

          <div>
            <div className="rl-hero__metric-label">Портфелей с расчётом</div>
            <div className="rl-hero__metric-value rl-num">
              {calculations.covered} / {totals.count}
            </div>
          </div>
        </div>
      </div>

      <div className="rl-grid-kpi">
        <StatCard
          label="Портфелей"
          value={totals.count}
          hint="в области доступа"
          icon={<FundOutlined />}
          loading={portfolios.isLoading}
        />

        <StatCard
          label="Средний VaR"
          value={
            calculations.averageRelativeVar === null
              ? '—'
              : formatPercent(calculations.averageRelativeVar, 2)
          }
          hint={
            calculations.averageRelativeVar === null
              ? 'сохранённых расчётов нет'
              : 'доля стоимости портфеля'
          }
          icon={<SafetyOutlined />}
          loading={calculations.isLoading}
        />

        <StatCard
          label="Лучший результат"
          value={totals.best ? formatPercent(totals.best.percent, 1, true) : '—'}
          hint={totals.best ? `«${totals.best.name}»` : 'нет вложений'}
          tone={totals.best && totals.best.percent >= 0 ? 'positive' : 'neutral'}
          icon={<LineChartOutlined />}
          loading={portfolios.isLoading}
        />

        <StatCard
          label="Обновление данных"
          value={
            freshness.latestQuoteDate ? formatDate(freshness.latestQuoteDate) : '—'
          }
          hint="последняя котировка в базе"
          icon={<DatabaseOutlined />}
          loading={freshness.isLoading}
        />
      </div>

      <div
        className="rl-grid-split"
        style={{ gridTemplateColumns: 'minmax(0, 1.85fr) minmax(0, 1fr)' }}
      >
        <Card>
          <SectionHead
            title="Динамика стоимости"
            subtitle="Оценка текущего состава по историческим котировкам"
            extra={
              <Segmented
                size="small"
                value={months}
                onChange={(value) => setMonths(Number(value))}
                options={[
                  { label: '1М', value: 1 },
                  { label: '6М', value: 6 },
                  { label: '1Г', value: 12 },
                ]}
              />
            }
          />

          {history.isLoading ? (
            <ChartSkeleton height={300} />
          ) : history.points.length < 2 ? (
            <EmptyBlock
              height={300}
              title="Недостаточно котировок для построения ряда"
              hint="Ряд появится, когда в портфелях будут позиции с загруженной историей котировок."
            />
          ) : (
            <>
              <ReactECharts option={valueChart} style={{ height: 300 }} notMerge />
              <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>
                Нынешний состав портфелей оценён ценами закрытия прошлых периодов.
                Ряд не является историей портфеля: изменения состава не учитываются.
              </Typography.Text>
            </>
          )}
        </Card>

        <Card>
          <SectionHead
            title="Результаты расчётов"
            subtitle="Доступны для ознакомления и выгрузки"
          />

          {calculations.recent.length === 0 ? (
            <EmptyBlock
              height={260}
              title="Расчётов пока нет"
              hint="Результаты появятся после того, как аналитик сохранит расчёт в истории."
            />
          ) : (
            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
              {calculations.recent.slice(0, 4).map((calculation) => (
                <div
                  key={calculation.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: '1px solid var(--line)',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    <Link to={`/portfolios/${calculation.portfolioId}`}>
                      {calculation.result?.portfolioName ?? 'Портфель'}
                    </Link>
                  </div>

                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8 }}>
                    {formatDateTime(calculation.finishedAt ?? calculation.createdAt)} ·{' '}
                    VaR {formatMoney(calculation.result?.estimates?.[0]?.valueAtRiskAbsolute ?? 0)}
                  </div>

                  <Space size={6}>
                    <Button
                      size="small"
                      icon={<FilePdfOutlined />}
                      loading={downloading === `${calculation.portfolioId}-pdf`}
                      onClick={() => void download(calculation.portfolioId, 'pdf')}
                    >
                      PDF
                    </Button>
                    <Button
                      size="small"
                      icon={<FileExcelOutlined />}
                      loading={downloading === `${calculation.portfolioId}-xlsx`}
                      onClick={() => void download(calculation.portfolioId, 'xlsx')}
                    >
                      Excel
                    </Button>
                  </Space>
                </div>
              ))}
            </Space>
          )}
        </Card>
      </div>
    </Space>
  )
}
