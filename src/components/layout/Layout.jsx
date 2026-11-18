import { Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Navbar from './Navbar.jsx'
import Footer from './Footer.jsx'

export default function Layout() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    const titles = {
      '/': 'Rent locally in Iligan City',
      '/listings': 'Browse rentals',
      '/list': 'Create listing',
      '/bookings': 'Bookings',
      '/messages': 'Messages',
      '/my-listings': 'My listings',
      '/login': 'Log in',
      '/register': 'Create account',
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
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [pathname, hash])

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <Navbar />
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
