import type { EChartsOption } from 'echarts'

import { colors, fontFamily, seriesPalette } from '../../theme/tokens'

/**
 * Единое оформление диаграмм.
 *
 * Правила заимствованы из практики научной графики: сетка должна быть
 * настолько малоконтрастной, чтобы её было видно, но нельзя было
 * рассматривать; данные — единственное, что выделяется цветом.
 */

/** Основание любой диаграммы: шрифты, отступы, подсказка. */
export function baseOption(): EChartsOption {
  return {
    textStyle: { fontFamily, color: colors.text },
    color: [...seriesPalette],
    animationDuration: 420,
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(8, 31, 26, 0.92)',
      borderWidth: 0,
      padding: [8, 11],
      textStyle: { color: '#fff', fontSize: 12, fontFamily },
      axisPointer: {
        type: 'line',
        lineStyle: { color: colors.line, width: 1 },
      },
    },
  }
}

/** Ось категорий либо времени. */
export function categoryAxis(overrides: Record<string, unknown> = {}) {
  return {
    type: 'category' as const,
    boundaryGap: false,
    axisLine: { lineStyle: { color: colors.line } },
    axisTick: { show: false },
    axisLabel: { color: colors.muted, fontSize: 11, hideOverlap: true },
    ...overrides,
  }
}

/** Ось значений: линии сетки едва заметны, рамка отсутствует. */
export function valueAxis(overrides: Record<string, unknown> = {}) {
  return {
    type: 'value' as const,
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: colors.line, type: 'dashed' as const } },
    axisLabel: { color: colors.muted, fontSize: 11 },
    ...overrides,
  }
}

/**
 * Линия с лёгкой градиентной заливкой.
 *
 * Заливка вводится ради читаемости направления, а не ради вида, поэтому
 * её верхняя непрозрачность невелика и сходит к нулю у основания.
 */
export function areaSeries(
  name: string,
  data: (number | null)[],
  color: string = colors.primary,
) {
  return {
    name,
    type: 'line' as const,
    data,
    smooth: 0.2,
    showSymbol: false,
    symbol: 'circle',
    symbolSize: 7,
    lineStyle: { width: 2.4, color },
    itemStyle: { color },
    areaStyle: {
      color: {
        type: 'linear' as const,
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: `${color}2E` },
          { offset: 1, color: `${color}00` },
        ],
      },
    },
  }
}

/** Кольцевая диаграмма долей. */
export function donutSeries(
  name: string,
  data: { name: string; value: number }[],
  radius: [string, string] = ['62%', '86%'],
) {
  return {
    name,
    type: 'pie' as const,
    radius,
    center: ['50%', '50%'],
    avoidLabelOverlap: true,
    label: { show: false },
    labelLine: { show: false },
    itemStyle: { borderColor: colors.surface, borderWidth: 2, borderRadius: 4 },
    data,
  }
}
