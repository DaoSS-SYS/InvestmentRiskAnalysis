import { useMemo, useState } from 'react'
import { Button, Segmented, Space, Tag, Typography } from 'antd'
import {
  ArrowRightOutlined,
  FileTextOutlined,
  FundOutlined,
  LineChartOutlined,
  PlusOutlined,
  SafetyOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'

import { api } from '../../api/client'
import {
  summarize,
  useLatestCalculations,
  usePortfolioValueSeries,
} from '../../hooks/usePortfolioAggregates'
import { Card, ChartSkeleton, EmptyBlock, SectionHead, StatCard } from '../../components/ui/primitives'
import { areaSeries, baseOption, categoryAxis, donutSeries, valueAxis } from '../../components/charts/chartTheme'
import { colors, seriesPalette } from '../../theme/tokens'
import { formatDate, formatDateTime, formatMoney, formatPercent } from '../../lib/format'

/** Приветствие по времени суток. */
function greeting(): string {
  const hour = new Date().getHours()

  if (hour < 5) return 'Доброй ночи'
  if (hour < 12) return 'Доброе утро'
  if (hour < 18) return 'Добрый день'

  return 'Добрый вечер'
}

/** Краткое имя: имя без фамилии и отчества. */
function firstName(fullName: string | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/)

  return parts.length > 1 ? parts[1] : parts[0] || ''
}

/**
 * Главная страница аналитика.
 *
 * Отвечает на вопрос «каково текущее состояние риска моих портфелей».
 * Все показатели вычисляются из данных, уже отдаваемых программным
 * интерфейсом; показатель, требующий отсутствующего серверного метода,
 * заменён состоянием отсутствия данных, а не правдоподобным числом.
 */
export default function AnalystDashboard({ userName }: { userName?: string }) {
  const navigate = useNavigate()
  const [months, setMonths] = useState(6)

  const portfolios = useQuery({ queryKey: ['portfolios'], queryFn: api.portfolios.list })
  const totals = useMemo(() => summarize(portfolios.data ?? []), [portfolios.data])

  const calculations = useLatestCalculations(portfolios.data)
  const history = usePortfolioValueSeries(portfolios.data, months)

  const riskShare =
    calculations.totalVar !== null && totals.currentValue > 0
      ? calculations.totalVar / totals.currentValue
      : null

  // Объекты, требующие внимания, определяются по имеющимся данным:
  // чрезмерная концентрация позиции, портфель без позиций и портфель,
  // по которому риск ни разу не рассчитывался.
  const attention = useMemo(() => {
    const items: { text: string; to: string }[] = []

    for (const portfolio of portfolios.data ?? []) {
      const heaviest = [...portfolio.positions].sort((a, b) => b.weight - a.weight)[0]

      if (heaviest && heaviest.weight > 0.4) {
        items.push({
          text: `«${portfolio.name}»: доля ${heaviest.ticker} составляет ${formatPercent(heaviest.weight, 1)}`,
          to: `/portfolios/${portfolio.id}`,
        })
      }

      if (portfolio.positions.length === 0) {
        items.push({
          text: `«${portfolio.name}» не содержит позиций`,
          to: `/portfolios/${portfolio.id}`,
        })
      } else if (!calculations.byPortfolio.has(portfolio.id)) {
        items.push({
          text: `«${portfolio.name}»: нет сохранённых расчётов риска`,
          to: `/portfolios/${portfolio.id}`,
        })
      }
    }

    return items
  }, [portfolios.data, calculations.byPortfolio])

  // Структура риска строится по компонентному разложению последнего
  // расчёта. Если расчётов несколько, вклады складываются по тикерам.
  const riskStructure = useMemo(() => {
    const byTicker = new Map<string, number>()

    for (const calculation of calculations.byPortfolio.values()) {
      for (const contribution of calculation.result?.contributions ?? []) {
        byTicker.set(
          contribution.ticker,
          (byTicker.get(contribution.ticker) ?? 0) + contribution.componentVar,
        )
      }
    }

    return [...byTicker.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [calculations.byPortfolio])

  const valueChart = useMemo(() => {
    const points = history.points

    return {
      ...baseOption(),
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
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
      series: [areaSeries('Стоимость', points.map((p) => p.value))],
    }
  }, [history.points])

  const donutChart = useMemo(
    () => ({
      ...baseOption(),
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: 'rgba(8, 31, 26, 0.92)',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 },
        valueFormatter: (value: number) => formatMoney(value),
      },
      series: [donutSeries('Вклад в риск', riskStructure.slice(0, 6))],
    }),
    [riskStructure],
  )

  const totalRisk = riskStructure.reduce((sum, item) => sum + item.value, 0)

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
            {greeting()}
            {firstName(userName) ? `, ${firstName(userName)}` : ''}
          </Typography.Title>
          <Typography.Text type="secondary">
            Сводка инвестиционных портфелей и актуальных показателей риска
          </Typography.Text>
        </div>

        <Space>
          <Button icon={<FileTextOutlined />} onClick={() => navigate('/portfolios')}>
            Сформировать отчёт
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/portfolios')}>
            Новый портфель
          </Button>
        </Space>
      </div>

      {/* Главный вывод: одна тёмная панель на страницу */}
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
              <LineChartOutlined />
              Центр управления риском
            </div>

            <h2 className="rl-hero__title">
              {totals.count === 0
                ? 'Портфели ещё не созданы'
                : calculations.totalVar === null
                  ? 'Сохранённых расчётов риска нет'
                  : 'Портфели под наблюдением'}
            </h2>

            <p className="rl-hero__text">
              {totals.count === 0
                ? 'Создайте портфель и добавьте позиции — после этого станут доступны оценка риска, стресс-тестирование и оптимизация структуры.'
                : calculations.totalVar === null
                  ? 'Совокупная стоимость портфелей известна. В сводку попадают расчёты, сохранённые в истории: откройте портфель, выполните оценку риска и нажмите «Сохранить в историю».'
                  : `Оценка выполнена по ${calculations.covered} из ${totals.count} портфелей. ` +
                    (attention.length > 0
                      ? `Требуют внимания: ${attention.length}.`
                      : 'Объектов, требующих внимания, не обнаружено.')}
            </p>
          </div>

          <Space>
            <Button
              ghost
              style={{ borderColor: 'rgba(255,255,255,0.35)', color: '#fff' }}
              onClick={() => navigate('/instruments')}
            >
              Инструменты
            </Button>
            <Button
              style={{ background: '#fff', border: 'none', color: 'var(--sidebar)' }}
              onClick={() => navigate('/portfolios')}
            >
              Открыть портфели
            </Button>
          </Space>
        </div>

        <div className="rl-hero__metrics">
          <div>
            <div className="rl-hero__metric-label">Совокупная стоимость</div>
            <div className="rl-hero__metric-value rl-num">{formatMoney(totals.currentValue)}</div>
          </div>

          <div>
            <div className="rl-hero__metric-label">
              Сумма VaR по сохранённым расчётам
            </div>
            <div className="rl-hero__metric-value rl-num">
              {calculations.totalVar === null ? '—' : formatMoney(calculations.totalVar)}
            </div>
          </div>

          <div>
            <div className="rl-hero__metric-label">Риск / стоимость</div>
            <div className="rl-hero__metric-value rl-num">
              {riskShare === null ? '—' : formatPercent(riskShare, 2)}
            </div>
          </div>
        </div>

        {calculations.totalVar !== null && (
          <div style={{ marginTop: 14, fontSize: 11.5, color: 'rgba(255,255,255,0.5)' }}>
            Сумма мер риска отдельных портфелей; взаимная диверсификация между портфелями
            не учитывается, поэтому величина является оценкой сверху.
          </div>
        )}
      </div>

      <div className="rl-grid-kpi">
        <StatCard
          label="Портфелей"
          value={totals.count}
          hint={
            totals.count > 0
              ? `${totals.withPositions} с позициями`
              : 'создайте первый портфель'
          }
          icon={<FundOutlined />}
          loading={portfolios.isLoading}
        />

        <StatCard
          label="Финансовый результат"
          value={
            totals.purchaseValue > 0 ? formatPercent(totals.profitLossPercent, 1, true) : '—'
          }
          hint={totals.purchaseValue > 0 ? formatMoney(totals.profitLoss) : 'нет вложений'}
          tone={
            totals.purchaseValue === 0
              ? 'neutral'
              : totals.profitLoss >= 0
                ? 'positive'
                : 'negative'
          }
          icon={<LineChartOutlined />}
          loading={portfolios.isLoading}
        />

        <StatCard
          label="Наибольшая концентрация"
          value={
            totals.maxConcentration ? formatPercent(totals.maxConcentration.share, 1) : '—'
          }
          hint={
            totals.maxConcentration
              ? `${totals.maxConcentration.ticker} · ${totals.maxConcentration.portfolio}`
              : 'позиций нет'
          }
          tone={
            totals.maxConcentration && totals.maxConcentration.share > 0.4
              ? 'warning'
              : 'neutral'
          }
          icon={<SafetyOutlined />}
          loading={portfolios.isLoading}
        />

        <StatCard
          label="Требуют внимания"
          value={attention.length}
          hint={attention.length > 0 ? attention[0].text : 'замечаний нет'}
          tone={attention.length > 0 ? 'warning' : 'neutral'}
          icon={<WarningOutlined />}
          loading={portfolios.isLoading || calculations.isLoading}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.85fr) minmax(0, 1fr)',
          gap: 16,
        }}
        className="rl-grid-split"
      >
        <Card>
          <SectionHead
            title="Динамика стоимости портфелей"
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
              hint="Добавьте позиции в портфель и загрузите историю котировок по их инструментам."
              action={
                <Link to="/instruments">
                  <Button size="small">Перейти к инструментам</Button>
                </Link>
              }
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
            title="Структура риска"
            subtitle="Компонентный вклад позиций"
            extra={
              riskStructure.length > 0 && (
                <Tag style={{ margin: 0, borderRadius: 999 }}>по расчётам</Tag>
              )
            }
          />

          {calculations.isLoading ? (
            <ChartSkeleton height={280} />
          ) : riskStructure.length === 0 ? (
            <EmptyBlock
              height={280}
              title="Разложение риска недоступно"
              hint="Сохраните расчёт риска хотя бы по одному портфелю — вклад позиций появится здесь."
            />
          ) : (
            <>
              <div style={{ position: 'relative' }}>
                <ReactECharts option={donutChart} style={{ height: 190 }} notMerge />
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
                    <div className="rl-num" style={{ fontSize: 19, fontWeight: 700 }}>
                      {formatMoney(totalRisk)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>вклад в риск</div>
                  </div>
                </div>
              </div>

              <Space orientation="vertical" size={8} style={{ width: '100%', marginTop: 10 }}>
                {riskStructure.slice(0, 5).map((item, index) => (
                  <div
                    key={item.name}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: seriesPalette[index % seriesPalette.length],
                        flex: 'none',
                      }}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>{item.name}</span>
                    <span className="rl-num" style={{ fontWeight: 600 }}>
                      {totalRisk > 0 ? formatPercent(item.value / totalRisk, 1) : '—'}
                    </span>
                  </div>
                ))}
              </Space>
            </>
          )}
        </Card>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 16,
        }}
        className="rl-grid-split"
      >
        <Card>
          <SectionHead title="Требуют внимания" subtitle="Замечания по составу и расчётам" />

          {attention.length === 0 ? (
            <EmptyBlock
              height={140}
              title="Замечаний нет"
              hint="Концентрация позиций в пределах нормы, расчёты выполнены."
            />
          ) : (
            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
              {attention.slice(0, 5).map((item) => (
                <Link
                  key={item.text}
                  to={item.to}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(214, 149, 45, 0.07)',
                    color: 'var(--text)',
                    fontSize: 13,
                  }}
                >
                  <WarningOutlined style={{ color: 'var(--warning)', flex: 'none' }} />
                  <span style={{ flex: 1, minWidth: 0 }}>{item.text}</span>
                  <ArrowRightOutlined style={{ color: 'var(--muted)', fontSize: 11 }} />
                </Link>
              ))}
            </Space>
          )}
        </Card>

        <Card>
          <SectionHead title="Последние расчёты" subtitle="Завершённые оценки риска" />

          {calculations.recent.length === 0 ? (
            <EmptyBlock
              height={140}
              title="Расчётов пока нет"
              hint="Сохранённые расчёты появятся здесь и будут доступны другим пользователям."
            />
          ) : (
            <Space orientation="vertical" size={2} style={{ width: '100%' }}>
              {calculations.recent.slice(0, 5).map((calculation) => (
                <Link
                  key={calculation.id}
                  to={`/portfolios/${calculation.portfolioId}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 4px',
                    borderBottom: '1px solid var(--line)',
                    color: 'var(--text)',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {calculation.result?.portfolioName ?? 'Портфель'}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      {formatDateTime(calculation.finishedAt ?? calculation.createdAt)}
                    </div>
                  </span>

                  <span className="rl-num" style={{ fontWeight: 600, fontSize: 13 }}>
                    {formatMoney(calculation.result?.estimates?.[0]?.valueAtRiskAbsolute ?? 0)}
                  </span>
                </Link>
              ))}
            </Space>
          )}
        </Card>
      </div>
    </Space>
  )
}
