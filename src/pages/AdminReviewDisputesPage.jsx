import AdminNavigation from '../components/AdminNavigation.jsx'
import PageHeading from '../components/PageHeading.jsx'
import ReviewDisputeQueue from '../components/ReviewDisputeQueue.jsx'
import '../styles/review-trust.css'

export default function AdminReviewDisputesPage() {
  return (
    <section className="container page moderation-workspace admin-review-disputes-page">
      <AdminNavigation />
      <div className="moderation-workspace__body">
        <PageHeading title="Review disputes">
          <p>Evaluate submitted concerns and record a moderation decision.</p>
        </PageHeading>
        <ReviewDisputeQueue admin />
      </div>
    </section>
  )
}
