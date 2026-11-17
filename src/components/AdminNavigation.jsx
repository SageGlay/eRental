import { NavLink } from 'react-router-dom'

export default function AdminNavigation() {
  return (
    <nav className="admin-section-nav" aria-label="Administration">
      <NavLink to="/admin" end>
        Listing reports
      </NavLink>
      <NavLink to="/admin/verification">Account verification</NavLink>
    </nav>
  )
}
