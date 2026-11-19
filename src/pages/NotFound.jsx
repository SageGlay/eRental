import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'

export default function NotFound() {
  return (
    <section className="container page system-page">
      <p className="system-code">404</p>
      <h1>Page not found</h1>
      <p>This address doesn’t lead to a rental or an account page. Check the link or search the marketplace.</p>
      <div className="page-heading__actions">
        <Link className="btn btn-primary" to="/listings"><Icon name="search" size={18} />Browse rentals</Link>
        <Link className="btn" to="/">Back to home</Link>
      </div>
    </section>
  )
}
