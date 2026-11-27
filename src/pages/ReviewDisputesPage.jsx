import PageHeading from '../components/PageHeading.jsx'
import ReviewDisputeQueue from '../components/ReviewDisputeQueue.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import '../styles/review-trust.css'

export default function ReviewDisputesPage() {
  const { user } = useAuth()
  return (
    <section className="container page review-disputes-page">
      <PageHeading title="My review disputes">
        <p>Track cases you submitted about reviews of your rentals.</p>
      </PageHeading>
      {user && <ReviewDisputeQueue key={user.id} userId={user.id} />}
    </section>
  )
}
