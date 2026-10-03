import { useState } from 'react'
import { App, Button, Form, Input, Modal, Select, Space, Tag, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { api, describeError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card, EmptyBlock, Signed } from '../components/ui/primitives'
import { seriesPalette } from '../theme/tokens'
import { formatMoney, formatPercent } from '../lib/format'

interface FormValues {
  name: string
  description?: string
  benchmarkInstrumentId?: number
}

/**
 * Перечень инвестиционных портфелей с текущей оценкой.
 *
 * Каждая карточка показывает стоимость, результат и состав в виде
 * полосы долей: перечень тикеров с числами читается медленнее, чем
 * соотношение, видимое сразу.
 */
export default function PortfoliosPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const { canManagePortfolios } = useAuth()
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm<FormValues>()

  const portfolios = useQuery({ queryKey: ['portfolios'], queryFn: api.portfolios.list })
  const instruments = useQuery({ queryKey: ['instruments'], queryFn: api.instruments.list })

  const createPortfolio = useMutation({
    mutationFn: (values: FormValues) =>
      api.portfolios.create({
        name: values.name,
        description: values.description,
        baseCurrency: 'RUB',
        benchmarkInstrumentId: values.benchmarkInstrumentId ?? null,
      }),
    onSuccess: () => {
      message.success('Портфель создан')
      setOpen(false)
      form.resetFields()
      void queryClient.invalidateQueries({ queryKey: ['portfolios'] })
      void queryClient.invalidateQueries({ queryKey: ['system-info'] })
    },
    onError: (error) => message.error(describeError(error)),
  })

  // В качестве эталонного портфеля предлагаются только биржевые индексы.
  const benchmarkOptions = (instruments.data ?? [])
    .filter((instrument) => instrument.securityType === 'Index')
    .map((instrument) => ({
      value: instrument.id,
      label: `${instrument.ticker} — ${instrument.shortName}`,
    }))

  const items = portfolios.data ?? []

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
        <div>
          <Typography.Title level={2} style={{ margin: 0, fontSize: 27, letterSpacing: -0.5 }}>
            Инвестиционные портфели
          </Typography.Title>
          <Typography.Text type="secondary">
            Состав, текущая оценка и результаты расчётов
          </Typography.Text>
        </div>

        {canManagePortfolios && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            Создать портфель
          </Button>
        )}
      </div>

      {!portfolios.isLoading && items.length === 0 && (
        <Card>
          <EmptyBlock
            height={220}
            title="Портфели не созданы"
            hint="Создайте портфель и добавьте в него позиции — после этого станут доступны оценка риска, стресс-тестирование и оптимизация структуры."
            action={
              canManagePortfolios && (
                <Button type="primary" size="small" onClick={() => setOpen(true)}>
                  Создать портфель
                </Button>
              )
            }
          />
        </Card>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 16,
        }}
      >
        {items.map((portfolio) => {
          const sorted = [...portfolio.positions].sort((a, b) => b.weight - a.weight)

          return (
            <Card key={portfolio.id}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <Link
                  to={`/portfolios/${portfolio.id}`}
                  style={{ fontSize: 16, fontWeight: 650, color: 'var(--text)' }}
                >
                  {portfolio.name}
                </Link>

                {portfolio.benchmarkTicker && (
                  <Tag style={{ margin: 0, borderRadius: 999, flex: 'none' }}>
                    {portfolio.benchmarkTicker}
                  </Tag>
                )}
              </div>

              {portfolio.description && (
                <Typography.Paragraph
                  type="secondary"
                  ellipsis={{ rows: 2 }}
                  style={{ marginTop: 6, marginBottom: 0, fontSize: 12.5 }}
                >
                  {portfolio.description}
                </Typography.Paragraph>
              )}

              <div style={{ display: 'flex', gap: 24, marginTop: 18 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Текущая стоимость</div>
                  <div className="rl-num" style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
                    {formatMoney(portfolio.currentValue)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Результат</div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
                    <Signed value={portfolio.profitLoss}>
                      {formatPercent(portfolio.profitLossPercent, 1, true)}
                    </Signed>
                  </div>
                </div>
              </div>

              {/* Полоса долей: соотношение состава видно без чтения чисел */}
              {sorted.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    height: 6,
                    marginTop: 16,
                    borderRadius: 3,
                    overflow: 'hidden',
                    background: 'var(--canvas)',
                  }}
                  role="img"
                  aria-label={`Состав: ${sorted
                    .map((p) => `${p.ticker} ${formatPercent(p.weight, 0)}`)
                    .join(', ')}`}
                >
                  {sorted.map((position, index) => (
                    <div
                      key={position.id}
                      style={{
                        width: `${Math.max(1, position.weight * 100)}%`,
                        background: seriesPalette[index % seriesPalette.length],
                      }}
                    />
                  ))}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 12,
                  fontSize: 12,
                  color: 'var(--muted)',
                }}
              >
                <span>
                  {portfolio.positions.length === 0
                    ? 'Позиций нет'
                    : `Позиций: ${portfolio.positions.length}`}
                </span>
                <span>вложено {formatMoney(portfolio.purchaseValue)}</span>
              </div>
            </Card>
          )
        })}
      </div>

      <Modal
        title="Создание портфеля"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createPortfolio.isPending}
        okText="Создать"
        cancelText="Отмена"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => createPortfolio.mutate(values)}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="name"
            label="Наименование"
            rules={[{ required: true, message: 'Укажите наименование портфеля' }]}
          >
            <Input placeholder="Например: Портфель голубых фишек" />
          </Form.Item>

          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={3} placeholder="Инвестиционная стратегия, назначение портфеля" />
          </Form.Item>

          <Form.Item
            name="benchmarkInstrumentId"
            label="Эталонный портфель"
            tooltip="Используется при расчёте коэффициента бета и альфы Йенсена"
          >
            <Select
              allowClear
              placeholder="Индекс для сопоставления, например IMOEX"
              options={benchmarkOptions}
              notFoundContent="Добавьте индекс в справочник инструментов"
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
