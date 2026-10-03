import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'

import { api } from '../api/client'
import type { Calculation, Portfolio, PriceSeries } from '../api/types'

/**
 * Сводные показатели по доступным портфелям.
 *
 * Все величины собираются из данных, которые программный интерфейс
 * уже отдаёт. Серверная часть настоящей задачей не изменяется, поэтому
 * показатель, который нельзя получить из имеющихся ответов, не
 * вычисляется и не подменяется правдоподобным значением: вместо него
 * возвращается признак отсутствия данных.
 */

export interface PortfolioTotals {
  /** Совокупная текущая стоимость доступных портфелей. */
  currentValue: number
  /** Совокупная стоимость приобретения. */
  purchaseValue: number
  /** Финансовый результат в денежном выражении. */
  profitLoss: number
  /** Финансовый результат в долях вложенных средств. */
  profitLossPercent: number
  /** Число портфелей. */
  count: number
  /** Число портфелей, содержащих хотя бы одну позицию. */
  withPositions: number
  /** Наибольшая доля одной позиции среди всех портфелей. */
  maxConcentration: { share: number; ticker: string; portfolio: string } | null
  /** Портфель с наилучшим относительным результатом. */
  best: { name: string; percent: number } | null
}

/** Считает сводку по перечню портфелей. */
export function summarize(portfolios: Portfolio[]): PortfolioTotals {
  const currentValue = portfolios.reduce((sum, p) => sum + p.currentValue, 0)
  const purchaseValue = portfolios.reduce((sum, p) => sum + p.purchaseValue, 0)
  const profitLoss = currentValue - purchaseValue

  let maxConcentration: PortfolioTotals['maxConcentration'] = null
  let best: PortfolioTotals['best'] = null

  for (const portfolio of portfolios) {
    for (const position of portfolio.positions) {
      if (maxConcentration === null || position.weight > maxConcentration.share) {
        maxConcentration = {
          share: position.weight,
          ticker: position.ticker,
          portfolio: portfolio.name,
        }
      }
    }

    // Портфель без вложений исключается: относительный результат
    // для него не определён.
    if (portfolio.purchaseValue > 0) {
      if (best === null || portfolio.profitLossPercent > best.percent) {
        best = { name: portfolio.name, percent: portfolio.profitLossPercent }
      }
    }
  }

  return {
    currentValue,
    purchaseValue,
    profitLoss,
    profitLossPercent: purchaseValue > 0 ? profitLoss / purchaseValue : 0,
    count: portfolios.length,
    withPositions: portfolios.filter((p) => p.positions.length > 0).length,
    maxConcentration,
    best,
  }
}

/**
 * Последние завершённые расчёты риска по каждому портфелю.
 *
 * Расчёт выполняется по запросу и сохраняется в истории, поэтому сводная
 * оценка риска строится по уже выполненным расчётам. Запускать расчёт
 * при открытии обзора недопустимо: моделирование методом Монте-Карло
 * на ста тысячах сценариев — операция не мгновенная, и обзорная
 * страница не должна её инициировать.
 */
export function useLatestCalculations(portfolios: Portfolio[] | undefined) {
  const ids = (portfolios ?? []).map((p) => p.id)

  // Первый этап: перечни расчётов по каждому портфелю.
  const lists = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['calculations', id],
      queryFn: () => api.portfolios.calculations(id),
      staleTime: 60_000,
    })),
  })

  // Отбор последнего успешного расчёта по каждому портфелю.
  //
  // Запоминание здесь не применяется намеренно: число портфелей
  // измеряется единицами, и перебор дешевле, чем поддержание
  // устойчивого списка зависимостей.
  const latest: { portfolioId: number; calculationId: string }[] = []

  lists.forEach((query, index) => {
    const succeeded = (query.data ?? [])
      .filter((c) => c.status === 'Succeeded')
      .sort(
        (a, b) =>
          new Date(b.finishedAt ?? b.createdAt).getTime() -
          new Date(a.finishedAt ?? a.createdAt).getTime(),
      )

    if (succeeded.length > 0) {
      latest.push({ portfolioId: ids[index], calculationId: succeeded[0].id })
    }
  })

  // Второй этап: полные результаты.
  //
  // Перечень расчётов намеренно не содержит результата: он объёмен, и
  // передавать его для каждой записи истории было бы расточительно.
  // Результат запрашивается отдельно, по идентификатору расчёта.
  const details = useQueries({
    queries: latest.map(({ calculationId }) => ({
      queryKey: ['calculation', calculationId],
      queryFn: () => api.calculations.get(calculationId),
      staleTime: 5 * 60_000,
    })),
  })

  const isLoading = lists.some((q) => q.isLoading) || details.some((q) => q.isLoading)

  const byPortfolio = new Map<number, Calculation>()

  details.forEach((query, index) => {
    const calculation = query.data

    if (calculation && calculation.result !== null) {
      byPortfolio.set(latest[index].portfolioId, calculation)
    }
  })

  const withResult = [...byPortfolio.values()]

  // Совокупный VaR складывается из мер риска отдельных портфелей.
  // Это оценка сверху: сложение пренебрегает корреляцией между
  // портфелями, то есть не учитывает эффект диверсификации между ними.
  const totalVar = withResult.reduce(
    (sum, c) => sum + (c.result?.estimates?.[0]?.valueAtRiskAbsolute ?? 0),
    0,
  )

  const averageRelativeVar =
    withResult.length > 0
      ? withResult.reduce(
          (sum, c) => sum + (c.result?.estimates?.[0]?.valueAtRiskRelative ?? 0),
          0,
        ) / withResult.length
      : null

  const recent = [...withResult].sort(
    (a, b) =>
      new Date(b.finishedAt ?? b.createdAt).getTime() -
      new Date(a.finishedAt ?? a.createdAt).getTime(),
  )

  return {
    isLoading,
    /** Расчёты по идентификатору портфеля. */
    byPortfolio,
    /** Число портфелей, для которых расчёт сохранён. */
    covered: withResult.length,
    /** Сумма мер риска портфелей; null, если сохранённых расчётов нет. */
    totalVar: withResult.length > 0 ? totalVar : null,
    /** Средняя относительная мера риска. */
    averageRelativeVar,
    /** Время последнего сохранённого расчёта. */
    lastFinishedAt: recent[0]?.finishedAt ?? recent[0]?.createdAt ?? null,
    /** Сохранённые расчёты, от новых к старым. */
    recent,
  }
}

export interface ValuePoint {
  date: string
  value: number
}

/**
 * Восстанавливает ряд стоимости портфелей по историческим котировкам.
 *
 * Программный интерфейс не отдаёт ряда стоимости портфеля: он хранит
 * состав и котировки, но не историю переоценки. Ряд строится здесь —
 * текущий состав оценивается ценами закрытия за каждый торговый день:
 *
 *     V(t) = Σ  q_i · P_i(t),
 *
 * где q_i — текущее количество единиц инструмента.
 *
 * Существенная оговорка, которая обязана быть видна пользователю:
 * состав принимается неизменным, тогда как в действительности позиции
 * приобретались в разное время. Поэтому ряд является **оценкой
 * стоимости нынешнего состава в прошлом**, а не историей портфеля.
 * Подпись к диаграмме говорит именно это.
 *
 * Котировки берутся скорректированными: без поправки на дробление
 * акций ряд содержал бы разрывы, не связанные с движением рынка.
 */
export function usePortfolioValueSeries(
  portfolios: Portfolio[] | undefined,
  months: number,
) {
  const holdings = useMemo(() => {
    const map = new Map<number, number>()

    for (const portfolio of portfolios ?? []) {
      for (const position of portfolio.positions) {
        map.set(position.instrumentId, (map.get(position.instrumentId) ?? 0) + position.quantity)
      }
    }

    return map
  }, [portfolios])

  const from = useMemo(() => {
    const date = new Date()
    date.setMonth(date.getMonth() - months)

    return date.toISOString().slice(0, 10)
  }, [months])

  const ids = [...holdings.keys()]

  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['series', id, from],
      queryFn: () => api.instruments.series(id, from),
      staleTime: 5 * 60_000,
    })),
  })

  return useMemo(() => {
    const isLoading = queries.some((q) => q.isLoading)
    const series = queries.map((q) => q.data).filter((s): s is PriceSeries => Boolean(s))

    if (series.length === 0) {
      return { isLoading, points: [] as ValuePoint[], changePercent: null as number | null }
    }

    // Стоимость считается по датам, в которые есть котировка каждого
    // инструмента. Иначе в дни частичных данных стоимость проседала бы
    // на величину отсутствующих позиций, создавая ложные провалы.
    const byDate = new Map<string, number[]>()

    for (const item of series) {
      const quantity = holdings.get(item.instrumentId) ?? 0

      for (const point of item.points) {
        const bucket = byDate.get(point.date) ?? []
        bucket.push(quantity * point.adjustedClose)
        byDate.set(point.date, bucket)
      }
    }

    const points: ValuePoint[] = [...byDate.entries()]
      .filter(([, values]) => values.length === series.length)
      .map(([date, values]) => ({ date, value: values.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const changePercent =
      points.length > 1 && points[0].value > 0
        ? (points[points.length - 1].value - points[0].value) / points[0].value
        : null

    return { isLoading, points, changePercent }
  }, [queries, holdings])
}

/**
 * Актуальность рыночных данных: наибольшая дата котировки в справочнике.
 */
export function useDataFreshness() {
  const instruments = useQuery({
    queryKey: ['instruments'],
    queryFn: api.instruments.list,
  })

  return useMemo(() => {
    const items = instruments.data ?? []

    const dates = items
      .map((instrument) => instrument.historyTo)
      .filter((date): date is string => Boolean(date))
      .sort()

    const withoutQuotes = items.filter((instrument) => instrument.quoteCount === 0)

    return {
      isLoading: instruments.isLoading,
      /** Наибольшая дата котировки среди всех инструментов. */
      latestQuoteDate: dates.at(-1) ?? null,
      /** Инструменты без загруженной истории. */
      withoutQuotes,
      total: items.length,
    }
  }, [instruments.data, instruments.isLoading])
}
