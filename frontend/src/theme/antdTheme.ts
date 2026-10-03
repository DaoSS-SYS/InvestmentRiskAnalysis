import type { ThemeConfig } from 'antd'

import { colors, fontFamily, radii } from './tokens'

/**
 * Настройка Ant Design под оформление RiskLab.
 *
 * Задавать оформление здесь, а не в стилях отдельных компонентов,
 * существенно: стандартные элементы библиотеки — поля ввода, таблицы,
 * вкладки, всплывающие окна — должны выглядеть так же, как собственные
 * элементы приложения. Иначе интерфейс распадается на две системы
 * оформления, и это заметно с первого взгляда.
 */
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: colors.primary,
    colorInfo: colors.cyan,
    colorSuccess: colors.primary,
    colorError: colors.danger,
    colorWarning: colors.warning,

    colorText: colors.text,
    colorTextSecondary: colors.muted,
    colorTextTertiary: colors.muted,
    colorBorder: colors.line,
    colorBorderSecondary: colors.line,
    colorBgLayout: colors.canvas,
    colorBgContainer: colors.surface,

    borderRadius: radii.control,
    borderRadiusLG: radii.card,
    borderRadiusSM: 8,

    fontFamily,
    fontSize: 14,

    controlHeight: 38,
    controlHeightLG: 46,

    // Тени задаются переменной CSS для карточек; у всплывающих
    // элементов библиотеки оставлена собственная, более выраженная.
    boxShadowTertiary: '0 1px 2px rgba(8, 31, 26, 0.04), 0 8px 24px rgba(8, 31, 26, 0.04)',
  },

  components: {
    Layout: {
      bodyBg: colors.canvas,
      headerBg: colors.surface,
    },

    Card: {
      borderRadiusLG: radii.card,
      paddingLG: 20,
    },

    Button: {
      fontWeight: 600,
      primaryShadow: 'none',
      defaultShadow: 'none',
    },

    Table: {
      headerBg: '#F7FAF9',
      headerColor: colors.muted,
      headerSplitColor: 'transparent',
      rowHoverBg: '#F7FAF9',
      cellPaddingBlock: 12,
      borderColor: colors.line,
    },

    Tabs: {
      itemColor: colors.muted,
      itemSelectedColor: colors.primary,
      itemHoverColor: colors.text,
      inkBarColor: colors.primary,
      titleFontSize: 14,
      horizontalItemGutter: 28,
    },

    Input: {
      activeShadow: '0 0 0 3px rgba(22, 133, 107, 0.10)',
      paddingBlock: 9,
    },

    Select: {
      optionSelectedBg: 'rgba(22, 133, 107, 0.08)',
    },

    Tag: {
      defaultBg: '#F2F7F5',
      defaultColor: colors.muted,
    },

    Statistic: {
      titleFontSize: 13,
      contentFontSize: 24,
    },

    Modal: {
      borderRadiusLG: 18,
    },

    Segmented: {
      itemSelectedBg: colors.surface,
      itemSelectedColor: colors.primary,
      trackBg: '#EDF4F1',
    },
  },
}
