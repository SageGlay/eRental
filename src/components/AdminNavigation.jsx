import { NavLink } from 'react-router-dom'
import Icon from './Icon.jsx'

export default function AdminNavigation() {
  return (
    <nav className="admin-section-nav" aria-label="Administration">
      <p className="admin-section-nav__title">
        <Icon name="shield" />
        Moderation
      </p>
      <div className="admin-section-nav__links">
        <NavLink to="/admin" end>
          <Icon name="grid" size={18} />
          Listing reports
        </NavLink>
        <NavLink to="/admin/verification">
          <Icon name="user" size={18} />
          Account verification
        </NavLink>
        <NavLink to="/admin/conversation-reports">
          <Icon name="message" size={18} />
          Conversation reports
        </NavLink>
        <NavLink to="/admin/review-disputes">
          <Icon name="star" size={18} />
          Review disputes
        </NavLink>
      </div>
    </nav>
  )
}
