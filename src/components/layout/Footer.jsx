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
              Good things, shared locally. Find your next rental or give
              something you own a new purpose in Iligan City.
            </p>
            <span className="footer__place">
              Iligan City, Philippines · Prices in PHP
            </span>
          </div>
          <nav aria-label="Explore">
            <h3>Find your next rental</h3>
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
            <h3>Make it yours</h3>
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
        <p className="footer__legal">
          © 2026 eRental. Academic prototype. Payments are simulated and no
          real money is processed.
        </p>
      </div>
    </footer>
  )
}
