import { Routes, Route } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { supabaseConfigurationError } from './lib/supabaseClient.js'
import Brand from './components/Brand.jsx'
import PageHeading from './components/PageHeading.jsx'
import Layout from './components/layout/Layout.jsx'
import Home from './pages/Home.jsx'
const AuthPage = lazy(() => import('./pages/AuthPage.jsx'))
const RecoveryPage = lazy(() => import('./pages/RecoveryPage.jsx'))
const ProfilePage = lazy(() => import('./pages/ProfilePage.jsx'))
import RequireAuth from './components/RequireAuth.jsx'
const CreateListing = lazy(() => import('./pages/CreateListing.jsx'))
const ListingDetail = lazy(() => import('./pages/ListingDetail.jsx'))
const ConversationPage = lazy(() => import('./pages/ConversationPage.jsx'))
const MessagesPage = lazy(() => import('./pages/MessagesPage.jsx'))
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'))
import RequireAdmin from './components/RequireAdmin.jsx'
const BookingsPage = lazy(() => import('./pages/BookingsPage.jsx'))
const EditListing = lazy(() => import('./pages/EditListing.jsx'))
const MyListings = lazy(() => import('./pages/MyListings.jsx'))
import NotFound from './pages/NotFound.jsx'
const BrowsePage = lazy(() => import('./pages/BrowsePage.jsx'))
const SavedListingsPage = lazy(() => import('./pages/SavedListingsPage.jsx'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage.jsx'))
const LegalPage = lazy(() => import('./pages/LegalPage.jsx'))
const ViewingsPage = lazy(() => import('./pages/ViewingsPage.jsx'))
const OwnerProfilePage = lazy(() => import('./pages/OwnerProfilePage.jsx'))
const ReviewDisputesPage = lazy(() => import('./pages/ReviewDisputesPage.jsx'))
const AdminConversationReportsPage = lazy(() => import('./pages/AdminConversationReportsPage.jsx'))
const AdminReviewDisputesPage = lazy(() => import('./pages/AdminReviewDisputesPage.jsx'))
const VerificationPage = lazy(() => import('./pages/VerificationPage.jsx'))
const AdminVerificationPage = lazy(
  () => import('./pages/AdminVerificationPage.jsx'),
)
const verificationLoading = (
  <p className="container page" role="status">
    Loading verification…
  </p>
)

export default function App() {
  useEffect(() => {
    if (supabaseConfigurationError)
      document.title = 'Supabase setup required · eRental'
  }, [])

  if (supabaseConfigurationError) {
    return (
      <main id="main" className="container page system-page">
        <Brand />
        <PageHeading title="Supabase setup required" />
        <p className="form-error" role="alert">
          {supabaseConfigurationError}
        </p>
        <p>
          Update the app’s environment settings, then restart the development
          server or rebuild the app.
        </p>
      </main>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="saved" element={<RequireAuth><SavedListingsPage /></RequireAuth>} />
        <Route path="notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
        <Route path="viewings" element={<RequireAuth><ViewingsPage /></RequireAuth>} />
        <Route path="owners/:id" element={<OwnerProfilePage />} />
        <Route path="review-disputes" element={<RequireAuth><ReviewDisputesPage /></RequireAuth>} />
        <Route path="admin/conversation-reports" element={<RequireAdmin><AdminConversationReportsPage /></RequireAdmin>} />
        <Route path="admin/review-disputes" element={<RequireAdmin><AdminReviewDisputesPage /></RequireAdmin>} />
        <Route path="terms" element={<LegalPage kind="terms" />} />
        <Route path="privacy" element={<LegalPage kind="privacy" />} />
        <Route path="listings" element={<BrowsePage />} />
        <Route path="listings/:id" element={<ListingDetail />} />
        <Route
          path="listings/:id/edit"
          element={
            <RequireAuth>
              <EditListing />
            </RequireAuth>
          }
        />
        <Route
          path="bookings"
          element={
            <RequireAuth>
              <BookingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="messages"
          element={
            <RequireAuth>
              <MessagesPage />
            </RequireAuth>
          }
        />
        <Route
          path="messages/:id"
          element={
            <RequireAuth>
              <ConversationPage />
            </RequireAuth>
          }
        />
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          }
        />
        <Route
          path="admin/verification"
          element={
            <RequireAdmin>
              <Suspense fallback={verificationLoading}>
                <AdminVerificationPage />
              </Suspense>
            </RequireAdmin>
          }
        />
        <Route
          path="my-listings"
          element={
            <RequireAuth>
              <MyListings />
            </RequireAuth>
          }
        />
        <Route
          path="list"
          element={
            <RequireAuth>
              <CreateListing />
            </RequireAuth>
          }
        />
        <Route path="forgot-password" element={<RecoveryPage key="request" mode="request" />} />
        <Route path="reset-password" element={<RecoveryPage key="reset" mode="reset" />} />
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route
          path="profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        <Route
          path="verification"
          element={
            <RequireAuth>
              <Suspense fallback={verificationLoading}>
                <VerificationPage />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route path="register" element={<AuthPage mode="register" />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
