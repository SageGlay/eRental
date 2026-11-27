import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useNotifications } from '../context/NotificationsContext.jsx'
import Icon from './Icon.jsx'
import '../styles/notification-bell.css'

export default function NotificationBell() {
  const { user } = useAuth()
  const { unreadCount } = useNotifications()
  if (!user) return null
  const label = unreadCount === null ? 'Notifications' : `Notifications, ${unreadCount} unread`
  return (
    <NavLink to="/notifications" className="notification-bell" aria-label={label} title={label}>
      <Icon name="bell" size={21} />
      {unreadCount > 0 && (
        <span aria-hidden="true" className="notification-bell__count">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </NavLink>
  )
}
