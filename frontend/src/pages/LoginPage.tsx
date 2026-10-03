import { useState } from 'react'
import { Alert, Button, Form, Input, Switch, Typography } from 'antd'
import { LockOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons'

import { useAuth } from '../auth/AuthContext'
import { describeError } from '../api/client'
import { RiskLabLogo } from '../components/brand/RiskLabLogo'

interface FormValues {
  userName: string
  password: string
  remember: boolean
}

/**
 * Декоративная кривая на тёмной половине экрана.
 *
 * Изображение намеренно не подписано конкретными величинами и не
 * выдаётся за показатель системы: это элемент оформления, и подстановка
 * в него правдоподобных чисел вводила бы в заблуждение.
 */
function DecorativeCurve() {
  return (
    <svg viewBox="0 0 520 120" width="100%" height="110" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="rl-curve" x1="0" y1="0" x2="0" y2="120">
          <stop offset="0%" stopColor="#23BD96" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#23BD96" stopOpacity="0" />
        </linearGradient>
      </defs>

      <path
        d="M0 96 C 40 92, 62 72, 96 76 S 150 58, 182 62 S 236 36, 268 44 S 322 26, 354 30 S 414 12, 446 18 S 496 8, 520 10"
        stroke="#23BD96"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M0 96 C 40 92, 62 72, 96 76 S 150 58, 182 62 S 236 36, 268 44 S 322 26, 354 30 S 414 12, 446 18 S 496 8, 520 10 L 520 120 L 0 120 Z"
        fill="url(#rl-curve)"
      />
    </svg>
  )
}

/**
 * Страница входа в систему.
 *
 * Отображается вместо рабочей области, пока пользователь не прошёл
 * проверку подлинности. Полное наименование системы приведено здесь
 * и в сведениях о системе; в рабочей области применяется короткое
 * продуктовое наименование.
 */
export default function LoginPage() {
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (values: FormValues) => {
    setError(null)
    setIsSubmitting(true)

    try {
      await login(values.userName.trim(), values.password, values.remember)
    } catch (exception) {
      setError(describeError(exception))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rl-login">
      <section className="rl-login__art">
        <div className="rl-login__grid" />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
          <RiskLabLogo size={44} subtitle="КОЛИЧЕСТВЕННЫЙ АНАЛИЗ РИСКОВ" />
        </div>

        <div className="rl-login__content">
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 9,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 1.3,
              textTransform: 'uppercase',
              color: 'rgba(255, 255, 255, 0.66)',
            }}
          >
            <SafetyCertificateOutlined />
            Научная точность · практические решения
          </div>

          <h1 className="rl-login__title">
            Управляйте риском,
            <br />
            опираясь на данные
          </h1>

          <p className="rl-login__lead">
            Анализ инструментов и портфелей, оценка VaR, стресс-тестирование и
            оптимизация — в единой аналитической среде.
          </p>
        </div>

        <div className="rl-login__panel">
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 12.5, color: 'rgba(255, 255, 255, 0.72)' }}>
              Методы количественной оценки риска
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)' }}>
              VaR · CVaR · GARCH · Марковиц
            </span>
          </div>

          <DecorativeCurve />
        </div>

        <div
          style={{
            position: 'relative',
            fontSize: 11.5,
            color: 'rgba(255, 255, 255, 0.45)',
          }}
        >
          Информационная система количественного анализа рисков инвестиционной
          деятельности · Московская Биржа · Банк России
        </div>
      </section>

      <section className="rl-login__form">
        <div className="rl-login__card">
          <Typography.Title level={3} style={{ margin: 0, fontSize: 25, letterSpacing: -0.4 }}>
            С возвращением
          </Typography.Title>

          <Typography.Paragraph type="secondary" style={{ marginTop: 6, marginBottom: 26 }}>
            Войдите в рабочее пространство RiskLab
          </Typography.Paragraph>

          <Form<FormValues>
            layout="vertical"
            onFinish={handleSubmit}
            requiredMark={false}
            initialValues={{ remember: true }}
          >
            <Form.Item
              name="userName"
              label="Имя пользователя"
              rules={[{ required: true, message: 'Укажите имя пользователя' }]}
            >
              <Input
                size="large"
                prefix={<UserOutlined style={{ color: 'var(--muted)' }} />}
                autoFocus
                autoComplete="username"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="Пароль"
              rules={[{ required: true, message: 'Укажите пароль' }]}
            >
              <Input.Password
                size="large"
                prefix={<LockOutlined style={{ color: 'var(--muted)' }} />}
                autoComplete="current-password"
              />
            </Form.Item>

            {/* Подпись вынесена в отдельный элемент и связана с
                переключателем: смысл не должен передаваться одним лишь
                положением ползунка. */}
            <Form.Item style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Form.Item name="remember" valuePropName="checked" noStyle>
                  <Switch size="small" id="rl-remember" />
                </Form.Item>

                <label
                  htmlFor="rl-remember"
                  style={{ fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}
                >
                  Не выходить на этом компьютере
                </label>
              </div>
            </Form.Item>

            {error && (
              <Form.Item>
                <Alert type="error" showIcon message={error} />
              </Form.Item>
            )}

            <Form.Item style={{ marginBottom: 18 }}>
              <Button
                type="primary"
                size="large"
                htmlType="submit"
                block
                loading={isSubmitting}
                style={{
                  height: 48,
                  background: 'linear-gradient(120deg, #16856B 0%, #12735C 100%)',
                  border: 'none',
                }}
              >
                Войти в RiskLab
              </Button>
            </Form.Item>
          </Form>

          <div
            style={{
              display: 'flex',
              gap: 10,
              paddingTop: 18,
              borderTop: '1px solid var(--line)',
              fontSize: 11.5,
              lineHeight: 1.55,
              color: 'var(--muted)',
            }}
          >
            <SafetyCertificateOutlined style={{ marginTop: 2, color: 'var(--primary)' }} />
            <span>
              Доступ предоставляется только пользователям системы. Все действия,
              изменяющие данные, фиксируются в журнале.
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
