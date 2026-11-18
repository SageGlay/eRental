import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import PageHeading from '../components/PageHeading.jsx'

export default function NotFound() {
  return (
    <section className="container page">
      <PageHeading eyebrow="404 · A little off course" title="Page not found">
        <p>This address doesn’t lead to a page on eRental. Check the link or find your way back to the marketplace.</p>
      </PageHeading>
      <div className="panel">
        <p aria-hidden="true"><Icon name="search" size={32} /></p>
        <h2>Find something worth renting.</h2>
        <p>Explore rentals from individual owners and businesses around Iligan City.</p>
        <div className="page-heading__actions">
          <Link className="btn btn-primary" to="/listings">Browse rentals <Icon name="arrowRight" size={18} /></Link>
          <Link className="btn btn-ghost" to="/">Back to home</Link>
        </div>
      </div>
    </section>
  )
}
