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
      </div>
    </nav>
  )
}
