import { Link } from 'react-router-dom'
import Brand from '../Brand.jsx'
export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div>
            <Link to="/" aria-label="eRental home">
              <Brand />
            </Link>
            <p className="footer__about">
              Find and list equipment, vehicles and spaces around Iligan City.
            </p>
            <span className="footer__place">
              Iligan City, Philippines · Prices in PHP
            </span>
          </div>
          <nav aria-label="Explore">
            <h3>Explore rentals</h3>
            <ul>
              <li>
                <Link to="/listings">Browse rentals</Link>
              </li>
              <li>
                <Link to="/#categories">Explore categories</Link>
              </li>
              <li>
                <Link to="/#how-it-works">How renting works</Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="Your marketplace">
            <h3>Your account</h3>
            <ul>
              <li>
                <Link to="/list">List an item</Link>
              </li>
              <li>
                <Link to="/my-listings">Manage your listings</Link>
              </li>
              <li>
                <Link to="/profile">Your account</Link>
              </li>
              <li>
                <Link to="/verification">Account verification</Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="footer__legal">
          <p>© 2026 eRental. Payments are simulated. No money changes hands on eRental.</p>
          <nav aria-label="Legal information">
            <Link to="/terms">Terms and conditions</Link>
            <Link to="/privacy">Privacy notice</Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
