import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useUnreadCount } from '../../hooks/useUnreadCount.js'
import Brand from '../Brand.jsx'
import Icon from '../Icon.jsx'
import ThemeControl from '../ThemeControl.jsx'

function NavItems() {
  const { user, isAdmin } = useAuth()
  const unread = useUnreadCount()
  const links = user
    ? [
        ['/listings', 'Browse'],
        ['/my-listings', 'My listings'],
        ['/bookings', 'Bookings'],
        ['/messages', 'Messages'],
        ...(isAdmin ? [['/admin', 'Admin']] : []),
      ]
    : [
        ['/listings', 'Browse rentals'],
        ['/#categories', 'Categories'],
        ['/#how-it-works', 'How it works'],
      ]
  return links.map(([to, label]) =>
    to.includes('#') ? (
      <Link key={to} to={to}>
        {label}
      </Link>
    ) : (
      <NavLink key={to} to={to}>
        {label}
        {to === '/messages' && unread > 0 && (
          <span className="nav-badge" aria-label={`${unread} unread`}>
            {unread}
          </span>
        )}
      </NavLink>
    ),
  )
}
function AccountActions({ mobile = false }) {
  const { user, profile, loading, signOut } = useAuth()
  if (loading)
    return (
      <span className="field__hint" role="status">
        Loading account…
      </span>
    )
  if (!user)
    return (
      <>
        <Link to="/login" className="btn btn-ghost">
          Log in
        </Link>
        <Link to="/register" className="btn btn-primary">
          Sign up
          <Icon name="arrowRight" size={16} />
        </Link>
      </>
    )
  const items = (
    <>
      <Link to="/profile">
        <Icon name="user" />
        My profile
      </Link>
      <Link to="/verification">
        <Icon name="shield" />
        Account verification
      </Link>
      <button type="button" onClick={signOut}>
        <Icon name="logOut" />
        Log out
      </button>
    </>
  )
  return (
    <>
      <Link to="/list" className="btn btn-primary">
        <Icon name="plus" size={18} />
        List an item
      </Link>
      {mobile ? (
        <div className="mobile-account">
          <p className="field__hint">{profile?.display_name ?? 'My account'}</p>
          {items}
        </div>
      ) : (
        <details className="account-menu">
          <summary aria-label="My account">
            <Icon name="user" />
            <Icon name="chevronDown" size={14} />
          </summary>
          <div className="account-menu__panel">
            <p>{profile?.display_name ?? 'My account'}</p>
            {items}
          </div>
        </details>
      )}
    </>
  )
}
export default function Navbar() {
  const [open, setOpen] = useState(false)
  const toggle = useRef(null)
  const header = useRef(null)
  const lastFocused = useRef(null)
  const { pathname, hash } = useLocation()
  useEffect(() => {
    const breakpoint = matchMedia('(min-width: 1200px)')
    const remember = (event) => {
      lastFocused.current = event.target
    }
    const recover = () => {
      const previous = lastFocused.current
      const wasMobile =
        previous === toggle.current ||
        header.current?.querySelector('#mobile-menu')?.contains(previous)
      const wasDesktop =
        header.current?.querySelector('.navbar__links')?.contains(previous) ||
        header.current?.querySelector('.navbar__actions')?.contains(previous)
      setOpen(false)
      header.current?.querySelectorAll('details[open]').forEach((element) => {
        element.open = false
      })
      if (breakpoint.matches && wasMobile)
        requestAnimationFrame(() =>
          (
            header.current?.querySelector('.account-menu > summary') ||
            header.current?.querySelector('.navbar__links a')
          )?.focus(),
        )
      if (!breakpoint.matches && wasDesktop)
        requestAnimationFrame(() => toggle.current?.focus())
    }
    document.addEventListener('focusin', remember)
    breakpoint.addEventListener('change', recover)
    return () => {
      document.removeEventListener('focusin', remember)
      breakpoint.removeEventListener('change', recover)
    }
  }, [])
  useEffect(() => {
    setOpen(false)
    header.current?.querySelectorAll('details[open]').forEach((el) => {
      el.open = false
    })
  }, [pathname, hash])
  useEffect(() => {
    const close = (e) => {
      // The top-layer modal owns Escape and pointer interactions until it closes.
      if (document.querySelector('dialog[open]')) return
      if (e.type === 'keydown' && e.key !== 'Escape') return
      if (e.type === 'pointerdown' && header.current?.contains(e.target)) return
      const expanded = header.current?.querySelector('details[open]')
      if (expanded) {
        expanded.open = false
        if (e.type === 'keydown') expanded.querySelector('summary').focus()
      }
      if (open) {
        setOpen(false)
        if (e.type === 'keydown') toggle.current?.focus()
      }
    }
    document.addEventListener('keydown', close)
    document.addEventListener('pointerdown', close)
    return () => {
      document.removeEventListener('keydown', close)
      document.removeEventListener('pointerdown', close)
    }
  }, [open])
  return (
    <header className="navbar" ref={header}>
      <div className="container navbar__inner">
        <Link to="/" aria-label="eRental home" className="brand-link">
          <Brand />
        </Link>
        <nav className="navbar__links" aria-label="Main">
          <NavItems />
        </nav>
        <div className="navbar__end">
          <ThemeControl />
          <div className="navbar__actions">
            <AccountActions />
          </div>
          <button
            ref={toggle}
            type="button"
            className="navbar__toggle"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen(!open)}
          >
            <Icon name={open ? 'x' : 'menu'} />
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="mobile-menu"
          className="mobile-menu container"
          aria-label="Mobile"
        >
          <NavItems />
          <AccountActions mobile />
        </nav>
      )}
    </header>
  )
}
