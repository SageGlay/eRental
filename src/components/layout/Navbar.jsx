import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useUnreadCount } from '../../hooks/useUnreadCount.js'

const guestLinks = [
  { to: '/listings', label: 'Browse' },
  { to: '/#categories', label: 'Categories', hash: true },
  { to: '/#how-it-works', label: 'How it works', hash: true },
]

// Signed-in people get their own pages in the main menu; visitors get the public sections.
const memberLinks = [
  { to: '/listings', label: 'Browse' },
  { to: '/my-listings', label: 'My listings' },
  { to: '/bookings', label: 'Bookings' },
  { to: '/messages', label: 'Messages' },
]

function NavItems() {
  const { user, isAdmin } = useAuth()
  const unread = useUnreadCount()
  const links = user ? [...memberLinks, ...(isAdmin ? [{ to: '/admin', label: 'Admin' }] : [])] : guestLinks
  return links.map(({ to, label, hash }) =>
    hash ? <Link key={to} to={to}>{label}</Link> : (
      <NavLink key={to} to={to}>
        {label}
        {to === '/messages' && unread > 0 && <span className="nav-badge" aria-label={`${unread} unread`}>{unread}</span>}
      </NavLink>
    )
  )
}

function AccountActions() {
  const { user, profile, loading, signOut } = useAuth()
  if (loading) return null
  if (!user) {
    return (
      <>
        <Link to="/login" className="btn btn-ghost">Log in</Link>
        <Link to="/register" className="btn btn-primary">Sign up</Link>
      </>
    )
  }
  return (
    <>
      <Link to="/profile" className="navbar__user" title="My profile">{profile?.display_name ?? 'My account'}</Link>
      <Link to="/list" className="btn btn-primary">List an item</Link>
      <button type="button" className="btn btn-ghost" onClick={signOut}>Log out</button>
    </>
  )
}

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const { pathname, hash } = useLocation()

  useEffect(() => setOpen(false), [pathname, hash])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header className="navbar">
      <div className="container navbar__inner">
        <Link to="/" className="brand" aria-label="eRental home">
          <span className="brand__mark" aria-hidden="true">e</span>
          eRental
        </Link>

        <nav className="navbar__links" aria-label="Main">
          <NavItems />
        </nav>

        <div className="navbar__actions">
          <AccountActions />
        </div>

        <button
          type="button"
          className="navbar__toggle"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen(!open)}
        >
          <span aria-hidden="true">{open ? '✕' : '☰'}</span>
        </button>
      </div>

      {open && (
        <nav id="mobile-menu" className="mobile-menu container" aria-label="Mobile">
          <NavItems />
          <AccountActions />
        </nav>
      )}
    </header>
  )
}
