import { Roles, useAuth } from '../auth/AuthContext'
import AdminDashboard from './dashboard/AdminDashboard'
import AnalystDashboard from './dashboard/AnalystDashboard'
import ViewerDashboard from './dashboard/ViewerDashboard'

/**
 * Обзорная страница.
 *
 * Состав первого экрана определяется ролью: у аналитика, администратора
 * и наблюдателя различаются не полномочия на одни и те же сведения,
 * а сами вопросы, на которые страница должна отвечать.
 *
 * Аналитику — «каково текущее состояние риска моих портфелей».
 * Администратору — «система и данные работают штатно».
 * Наблюдателю — «каково общее состояние портфелей и что готово
 * к ознакомлению».
 *
 * Выбор композиции является удобством представления. Разграничение
 * доступа к самим данным обеспечивается сервером: обращение к сведениям,
 * не полагающимся роли, отклоняется независимо от того, какая страница
 * их запросила.
 */
export default function DashboardPage() {
  const { user, isInRole } = useAuth()

  if (isInRole(Roles.Administrator)) {
    return <AdminDashboard />
  }

  if (isInRole(Roles.Analyst)) {
    return <AnalystDashboard userName={user?.fullName} />
  }

  return <ViewerDashboard />
}
