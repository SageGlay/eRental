import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Navbar from './Navbar.jsx'
import Footer from './Footer.jsx'

export default function Layout() {
  const [offline, setOffline] = useState(() => !navigator.onLine)
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine)
    window.addEventListener('offline', sync)
    window.addEventListener('online', sync)
    return () => {
      window.removeEventListener('offline', sync)
      window.removeEventListener('online', sync)
    }
  }, [])
  const { pathname, hash } = useLocation()

  useEffect(() => {
    const titles = {
      '/': 'Rent locally in Iligan City',
      '/listings': 'Browse rentals',
      '/list': 'Create listing',
      '/bookings': 'Bookings',
      '/messages': 'Messages',
      '/saved': 'Saved listings',
      '/notifications': 'Notifications',
      '/terms': 'Terms and conditions',
      '/privacy': 'Privacy notice',
      '/my-listings': 'My listings',
      '/login': 'Log in',
      '/register': 'Create account',
      '/forgot-password': 'Reset password',
      '/reset-password': 'Choose a new password',
      '/profile': 'My profile',
      '/verification': 'Account verification',
      '/admin': 'Listing reports',
      '/admin/verification': 'Verification review',
    }
    const title =
      titles[pathname] ||
      (pathname.startsWith('/listings/')
        ? pathname.endsWith('/edit')
          ? 'Edit listing'
          : 'Rental details'
        : pathname.startsWith('/messages/')
          ? 'Conversation'
          : 'Page not found')
    document.title = `${title} · eRental`
  }, [pathname])

  // Scroll to a #section if the link has one, otherwise to the top of the new page.
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0)
      return
    }
    // Lazy account routes may mount after the shell receives the hash.
    const reachTarget = () => {
      const target = document.getElementById(hash.slice(1))
      if (!target) return false
      target.scrollIntoView()
      if (target.matches('input, select, textarea, [tabindex]')) target.focus({ preventScroll: true })
      return true
    }
    if (reachTarget()) return
    const observer = new MutationObserver(() => { if (reachTarget()) observer.disconnect() })
    observer.observe(document.getElementById('main'), { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [pathname, hash])

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <Navbar />
      {offline && <p className="offline-notice" role="status">You’re offline. Reconnect before sending changes or checking availability.</p>}
      <main id="main" tabIndex={-1}>
        <Suspense
          fallback={
            <p className="container page" role="status">
              Loading page…
            </p>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}
