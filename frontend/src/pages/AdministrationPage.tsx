import { useMemo, useState } from 'react'
import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { PlusOutlined, SafetyOutlined, SearchOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { ColumnsType } from 'antd/es/table'

import { api, describeError } from '../api/client'
import type { AuditRecordView, UserView } from '../api/types'
import { describeRole, useAuth } from '../auth/AuthContext'
import { Card, EmptyBlock, SectionHead } from '../components/ui/primitives'
import { formatDateTime } from '../lib/format'

interface UserFormValues {
  userName: string
  password: string
  fullName: string
  position?: string
  email?: string
  role: string
}

/** Наименование вида действия на русском языке. */
function describeAction(action: string): string {
  const names: Record<string, string> = {
    Login: 'вход',
    Create: 'создание',
    Update: 'изменение',
    Delete: 'удаление',
    Calculate: 'расчёт',
    Import: 'загрузка',
    Report: 'отчёт',
  }

  return names[action] ?? action
}

/** Цвет метки вида действия. */
function actionColor(action: string): string {
  const colors: Record<string, string> = {
    Login: 'blue',
    Create: 'success',
    Update: 'gold',
    Delete: 'error',
    Import: 'cyan',
  }

  return colors[action] ?? 'default'
}

/**
 * Администрирование: учётные записи, журнал действий, роли и полномочия.
 *
 * Раздел отображается только администратору. Сокрытие раздела является
 * удобством представления: обращение к его данным проверяется сервером
 * независимо от того, отображён ли пункт меню.
 */
export default function AdministrationPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuth()

  // Вкладка задаётся адресом, чтобы пункт «Журнал действий» в навигации
  // открывал нужную вкладку напрямую.
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') ?? 'users'

  const [open, setOpen] = useState(false)
  const [form] = Form.useForm<UserFormValues>()

  const [query, setQuery] = useState('')
  const [state, setState] = useState<'all' | 'active' | 'blocked'>('all')
  const [auditQuery, setAuditQuery] = useState('')

  const users = useQuery({ queryKey: ['users'], queryFn: api.auth.users })
  const roles = useQuery({ queryKey: ['roles'], queryFn: api.auth.roles })

  const audit = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.auth.audit(200),
    refetchInterval: 30_000,
  })

  const createUser = useMutation({
    mutationFn: (values: UserFormValues) => api.auth.createUser(values),
    onSuccess: (created) => {
      message.success(`Учётная запись ${created.userName} создана`)
      setOpen(false)
      form.resetFields()
      void queryClient.invalidateQueries({ queryKey: ['users'] })
      void queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
    onError: (error) => message.error(describeError(error)),
  })

  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.auth.setUserActive(id, isActive),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] })
      void queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
    onError: (error) => message.error(describeError(error)),
  })

  // Поиск и фильтр выполняются по уже полученным данным: перечень
  // учётных записей невелик, и обращение к серверу при каждом нажатии
  // клавиши было бы избыточным.
  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return (users.data ?? []).filter((item) => {
      if (state === 'active' && !item.isActive) return false
      if (state === 'blocked' && item.isActive) return false

      if (!needle) return true

      return [item.userName, item.fullName, item.position ?? '']
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [users.data, query, state])

  const filteredAudit = useMemo(() => {
    const needle = auditQuery.trim().toLowerCase()

    if (!needle) return audit.data ?? []

    return (audit.data ?? []).filter((record) =>
      [record.userName, record.description, record.entityType]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [audit.data, auditQuery])

  const userColumns: ColumnsType<UserView> = [
    {
      title: 'Пользователь',
      dataIndex: 'fullName',
      render: (value: string, record) => (
        <span>
          <div style={{ fontWeight: 600 }}>{value}</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{record.userName}</div>
        </span>
      ),
    },
    {
      title: 'Должность',
      dataIndex: 'position',
      ellipsis: true,
      responsive: ['lg'],
      render: (value: string | null) => value ?? '—',
    },
    {
      title: 'Роль',
      dataIndex: 'roles',
      width: 150,
      render: (values: string[]) => (
        <Space size={4} wrap>
          {values.map((role) => (
            <Tag key={role} color="success" style={{ margin: 0, borderRadius: 999 }}>
              {describeRole(role)}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Последний вход',
      dataIndex: 'lastLoginAt',
      width: 170,
      responsive: ['md'],
      render: (value: string | null) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {value ? formatDateTime(value) : 'входов ещё не было'}
        </Typography.Text>
      ),
    },
    {
      title: 'Состояние',
      dataIndex: 'isActive',
      width: 140,
      render: (isActive: boolean, record) => (
        <Space size={8}>
          <Switch
            size="small"
            checked={isActive}
            disabled={record.id === currentUser?.id || setActive.isPending}
            onChange={(checked) => setActive.mutate({ id: record.id, isActive: checked })}
          />
          {/* Подпись рядом с переключателем: состояние не должно
              определяться одним лишь его положением. */}
          <span style={{ fontSize: 12.5, color: isActive ? 'var(--primary)' : 'var(--muted)' }}>
            {isActive ? 'Действует' : 'Заблокирован'}
          </span>
        </Space>
      ),
    },
  ]

  const auditColumns: ColumnsType<AuditRecordView> = [
    {
      title: 'Время',
      dataIndex: 'timestamp',
      width: 160,
      render: (value: string) => (
        <Typography.Text style={{ fontSize: 12 }} className="rl-num">
          {formatDateTime(value)}
        </Typography.Text>
      ),
    },
    { title: 'Пользователь', dataIndex: 'userName', width: 140 },
    {
      title: 'Действие',
      dataIndex: 'action',
      width: 130,
      filters: ['Login', 'Create', 'Update', 'Delete', 'Import'].map((value) => ({
        text: describeAction(value),
        value,
      })),
      onFilter: (value, record) => record.action === value,
      render: (action: string) => (
        <Tag color={actionColor(action)} style={{ margin: 0, borderRadius: 999 }}>
          {describeAction(action)}
        </Tag>
      ),
    },
    { title: 'Объект', dataIndex: 'entityType', width: 110, responsive: ['lg'] },
    { title: 'Описание', dataIndex: 'description', ellipsis: true },
    {
      title: 'Адрес',
      dataIndex: 'ipAddress',
      width: 130,
      responsive: ['xl'],
      render: (value: string | null) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {value ?? '—'}
        </Typography.Text>
      ),
    },
  ]

  /** Карточка ролей: показывается рядом с таблицей на широком экране. */
  const rolesCard = (
    <Card>
      <SectionHead title="Роли и полномочия" subtitle="Доступ определяется сервером" />

      <Space orientation="vertical" size={14} style={{ width: '100%' }}>
        {(roles.data ?? []).map((role) => (
          <div key={role.name} style={{ paddingBottom: 14, borderBottom: '1px solid var(--line)' }}>
            <Tag color="success" style={{ marginBottom: 6, borderRadius: 999 }}>
              {describeRole(role.name)}
            </Tag>
            <Typography.Paragraph style={{ fontSize: 12.5, margin: 0, color: 'var(--muted)' }}>
              {role.description}
            </Typography.Paragraph>
          </div>
        ))}

        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: 14,
            borderRadius: 12,
            background: 'rgba(214, 149, 45, 0.08)',
          }}
        >
          <SafetyOutlined style={{ color: 'var(--warning)', marginTop: 2 }} />
          <Typography.Text style={{ fontSize: 12, lineHeight: 1.55 }}>
            Скрытие элементов интерфейса дополняет, но не заменяет серверную проверку
            полномочий: обращение к недоступному разделу отклоняется независимо от того,
            отображена ли кнопка.
          </Typography.Text>
        </div>
      </Space>
    </Card>
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
        <div>
          <Typography.Title level={2} style={{ margin: 0, fontSize: 27, letterSpacing: -0.5 }}>
            Администрирование
          </Typography.Title>
          <Typography.Text type="secondary">
            Учётные записи, роли и журнал действий системы
          </Typography.Text>
        </div>

        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Создать пользователя
        </Button>
      </div>

      <div className="rl-sticky-tabs">
        <Tabs
          activeKey={tab}
          onChange={(key) => setSearchParams(key === 'users' ? {} : { tab: key })}
          items={[
            { key: 'users', label: 'Учётные записи' },
            { key: 'audit', label: 'Журнал действий' },
            { key: 'roles', label: 'Роли и полномочия' },
          ]}
        />
      </div>

      {tab === 'users' && (
        <div
          className="rl-grid-split"
          style={{ gridTemplateColumns: 'minmax(0, 2.1fr) minmax(0, 1fr)' }}
        >
          <Card>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <Input
                allowClear
                prefix={<SearchOutlined style={{ color: 'var(--muted)' }} />}
                placeholder="Поиск по имени, ФИО или должности"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                style={{ maxWidth: 300 }}
              />

              <Segmented
                value={state}
                onChange={(value) => setState(value as typeof state)}
                options={[
                  { label: 'Все', value: 'all' },
                  { label: 'Действующие', value: 'active' },
                  { label: 'Заблокированные', value: 'blocked' },
                ]}
              />
            </div>

            <Table
              className="rl-table"
              rowKey="id"
              size="small"
              pagination={false}
              columns={userColumns}
              dataSource={filteredUsers}
              loading={users.isLoading}
              locale={{
                emptyText:
                  query || state !== 'all'
                    ? 'Учётных записей, удовлетворяющих условию, не найдено'
                    : 'Учётные записи отсутствуют',
              }}
            />

            <Typography.Paragraph
              type="secondary"
              style={{ fontSize: 11.5, marginTop: 14, marginBottom: 0 }}
            >
              Учётные записи не удаляются, а переводятся в недействующие: удаление нарушило
              бы связность журнала действий.
            </Typography.Paragraph>
          </Card>

          {rolesCard}
        </div>
      )}

      {tab === 'audit' && (
        <Card>
          <SectionHead
            title="Журнал действий"
            subtitle="Операции, изменяющие состояние системы"
            extra={
              <Input
                allowClear
                prefix={<SearchOutlined style={{ color: 'var(--muted)' }} />}
                placeholder="Поиск по описанию или пользователю"
                value={auditQuery}
                onChange={(event) => setAuditQuery(event.target.value)}
                style={{ width: 280 }}
              />
            }
          />

          <Table
            className="rl-table"
            rowKey="id"
            size="small"
            columns={auditColumns}
            dataSource={filteredAudit}
            loading={audit.isLoading}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            locale={{
              emptyText: auditQuery
                ? 'Записей, удовлетворяющих условию, не найдено'
                : 'Журнал пуст',
            }}
          />
        </Card>
      )}

      {tab === 'roles' && (
        <div
          className="rl-grid-split"
          style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}
        >
          {rolesCard}

          <Card>
            <SectionHead
              title="Разграничение доступа"
              subtitle="Как устроена проверка полномочий"
            />

            {roles.isLoading ? (
              <EmptyBlock height={200} title="Загрузка" />
            ) : (
              <Space orientation="vertical" size={14} style={{ width: '100%' }}>
                <Typography.Paragraph style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                  Проверка выполняется на двух уровнях. Принадлежность пользователя к роли
                  проверяется до выполнения метода — сведения о ролях содержатся в маркере
                  доступа и не требуют обращения к базе данных.
                </Typography.Paragraph>

                <Typography.Paragraph style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                  Принадлежность конкретного объекта пользователю устанавливается только
                  после обращения к базе данных: изменять состав портфеля вправе создавший
                  его пользователь и администратор.
                </Typography.Paragraph>

                <Typography.Paragraph
                  type="secondary"
                  style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6 }}
                >
                  Требование подлинности применяется ко всем методам программного
                  интерфейса. Исключения обозначены явно: вход в систему и проверка
                  работоспособности.
                </Typography.Paragraph>
              </Space>
            )}
          </Card>
        </div>
      )}

      <Modal
        title="Создание учётной записи"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createUser.isPending}
        okText="Создать"
        cancelText="Отмена"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => createUser.mutate(values)}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="userName"
            label="Имя пользователя"
            rules={[{ required: true, message: 'Укажите имя пользователя' }]}
          >
            <Input autoComplete="off" />
          </Form.Item>

          <Form.Item
            name="password"
            label="Пароль"
            tooltip="Не менее восьми знаков, строчные и прописные буквы, цифры"
            rules={[{ required: true, min: 8, message: 'Пароль не короче восьми знаков' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>

          <Form.Item
            name="fullName"
            label="Фамилия, имя, отчество"
            rules={[{ required: true, message: 'Укажите фамилию, имя и отчество' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item name="position" label="Должность">
            <Input />
          </Form.Item>

          <Form.Item name="email" label="Адрес электронной почты">
            <Input type="email" />
          </Form.Item>

          <Form.Item name="role" label="Роль" rules={[{ required: true, message: 'Выберите роль' }]}>
            <Select
              options={(roles.data ?? []).map((role) => ({
                value: role.name,
                label: describeRole(role.name),
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
