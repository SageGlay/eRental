import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout.jsx'
import Home from './pages/Home.jsx'
import AuthPage from './pages/AuthPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import CreateListing from './pages/CreateListing.jsx'
import ListingDetail from './pages/ListingDetail.jsx'
import ConversationPage from './pages/ConversationPage.jsx'
import MessagesPage from './pages/MessagesPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import RequireAdmin from './components/RequireAdmin.jsx'
import BookingsPage from './pages/BookingsPage.jsx'
import EditListing from './pages/EditListing.jsx'
import MyListings from './pages/MyListings.jsx'
import BrowsePage from './pages/BrowsePage.jsx'
import NotFound from './pages/NotFound.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="listings" element={<BrowsePage />} />
        <Route path="listings/:id" element={<ListingDetail />} />
        <Route path="listings/:id/edit" element={<RequireAuth><EditListing /></RequireAuth>} />
        <Route path="bookings" element={<RequireAuth><BookingsPage /></RequireAuth>} />
        <Route path="messages" element={<RequireAuth><MessagesPage /></RequireAuth>} />
        <Route path="messages/:id" element={<RequireAuth><ConversationPage /></RequireAuth>} />
        <Route path="admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
        <Route path="my-listings" element={<RequireAuth><MyListings /></RequireAuth>} />
        <Route path="list" element={<RequireAuth><CreateListing /></RequireAuth>} />
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="register" element={<AuthPage mode="register" />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
