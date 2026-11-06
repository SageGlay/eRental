import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div>
            <Link to="/" className="brand">
              <span className="brand__mark" aria-hidden="true">e</span>
              eRental
            </Link>
            <p className="footer__about">An online rental marketplace for Iligan City, connecting renters with individual owners and rental businesses.</p>
          </div>
          <div>
            <h3>Explore</h3>
            <ul>
              <li><Link to="/listings">Browse rentals</Link></li>
              <li><Link to="/#categories">Categories</Link></li>
              <li><Link to="/#how-it-works">How it works</Link></li>
            </ul>
          </div>
          <div>
            <h3>Account</h3>
            <ul>
              <li><Link to="/login">Log in</Link></li>
              <li><Link to="/list">List an item</Link></li>
            </ul>
          </div>
        </div>
        <p className="footer__legal">© 2026 eRental. Academic prototype. Payments are simulated and no real money is processed.</p>
      </div>
    </footer>
  )
}
