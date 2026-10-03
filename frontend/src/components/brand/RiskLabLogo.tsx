/**
 * Знак RiskLab.
 *
 * Скруглённый квадрат с линией графика, столбцами и точкой-маркером,
 * обозначающей измеряемый риск. Лабораторная колба намеренно не
 * используется: исследовательский характер системы передаётся точностью
 * и сеткой, а не предметной метафорой.
 */
export function RiskLabMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      role="img"
      aria-label="RiskLab"
      style={{ flex: 'none' }}
    >
      <defs>
        <linearGradient id="rl-mark" x1="0" y1="0" x2="40" y2="40">
          <stop offset="0%" stopColor="#23BD96" />
          <stop offset="100%" stopColor="#16856B" />
        </linearGradient>
      </defs>

      <rect width="40" height="40" rx="11" fill="url(#rl-mark)" />

      {/* Столбцы — дискретные наблюдения */}
      <rect x="11" y="21" width="3" height="8" rx="1.5" fill="#fff" opacity="0.55" />
      <rect x="18.5" y="17" width="3" height="12" rx="1.5" fill="#fff" opacity="0.55" />
      <rect x="26" y="23" width="3" height="6" rx="1.5" fill="#fff" opacity="0.55" />

      {/* Линия — динамика показателя */}
      <path
        d="M10 18.5L16.5 13.5L23 17L30 10.5"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Маркер — измеренное значение риска */}
      <circle cx="30" cy="10.5" r="2.9" fill="#fff" />
    </svg>
  )
}

/**
 * Знак с наименованием и подписью.
 *
 * Наименование остаётся в разметке и при свёрнутой боковой панели:
 * скрывается оно стилями, плавным сжатием. Удаление из разметки
 * перестраивало бы панель мгновенно, тогда как её ширина ещё движется.
 */
export function RiskLabLogo({
  size = 40,
  subtitle = 'RISK ANALYTICS',
}: {
  size?: number
  subtitle?: string
}) {
  return (
    <>
      <RiskLabMark size={size} />

      <span className="rl-sidebar__brand-text">
        <span className="rl-sidebar__brand-name">RiskLab</span>
        <span className="rl-sidebar__brand-sub">{subtitle}</span>
      </span>
    </>
  )
}
