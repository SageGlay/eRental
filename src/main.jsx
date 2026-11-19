import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import './styles/auth.css'
import './styles/listings.css'
import './styles/verification.css'

const router = createBrowserRouter([{
  path: '*',
  element: <App />,
  errorElement: (
    <main className="container page system-page">
      <h1>This page couldn’t open</h1>
      <p>Reload the page to try again, or return to the marketplace.</p>
      <a className="btn btn-primary" href="/">Return to eRental</a>
    </main>
  ),
}])

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
