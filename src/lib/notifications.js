// Notifications store event facts. Only these application-owned templates and
// destinations may become visible text or links.
const events = new Map([
  ['booking_requested', ['calendar', 'New booking request', 'A renter requested dates for your listing.']],
  ['booking_accepted', ['calendar', 'Booking accepted', 'Your rental request has been accepted. Check the booking for dates and next steps.']],
  ['booking_rejected', ['calendar', 'Booking declined', 'The owner declined your rental request.']],
  ['booking_cancelled', ['calendar', 'Booking cancelled', 'Open the booking to check its updated status.']],
  ['rental_completed', ['check', 'Rental completed', 'Your rental was marked complete. Open the booking for details.']],
  ['inquiry_received', ['message', 'New rental inquiry', 'Open the conversation to read the first message.']],
  ['message_received', ['message', 'New rental message', 'You have a new message in a rental conversation.']],
  ['simulated_payment_recorded', ['calendar', 'Simulated payment recorded', 'The booking has a simulated payment entry. No money changed hands.']],
  ['simulated_refund_recorded', ['calendar', 'Simulated refund recorded', 'The booking has a simulated refund entry. No money changed hands.']],
  ['verification_approved', ['shield', 'Account verification approved', 'Open account verification to see your current status.']],
  ['verification_rejected', ['shield', 'Verification request declined', 'Open account verification to read the decision and available next steps.']],
  ['viewing_requested', ['calendar', 'New viewing request', 'A renter requested a time to view your rental.']],
  ['viewing_confirmed', ['calendar', 'Viewing confirmed', 'Open the appointment for the confirmed time and details.']],
  ['viewing_declined', ['calendar', 'Viewing declined', 'The owner declined your viewing request.']],
  ['viewing_reschedule_proposed', ['calendar', 'New viewing time proposed', 'Open the appointment to review the proposed time.']],
  ['viewing_reschedule_accepted', ['calendar', 'New viewing time confirmed', 'The proposed time was accepted. Open the appointment for details.']],
  ['viewing_reschedule_declined', ['calendar', 'Proposed viewing time declined', 'Open the appointment to check its current schedule.']],
  ['viewing_cancelled', ['calendar', 'Viewing cancelled', 'The viewing appointment was cancelled.']],
  ['viewing_completed', ['calendar', 'Viewing completed', 'The appointment was marked complete.']],
  ['review_published', ['star', 'New rental review', 'A renter published a review for your listing.']],
  ['review_response_published', ['star', 'Owner responded to your review', 'Open the listing to see the response.']],
  ['review_dispute_resolved', ['shield', 'Review dispute resolved', 'Open your review disputes to see the decision.']],
  ['review_visibility_updated', ['shield', 'Review visibility updated', 'An administrator reviewed the visibility of your rental review.']],
  ['conversation_report_resolved', ['shield', 'Conversation report resolved', 'Open your conversation to check the report status.']],
])

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function notificationDisplay({ event_type: type, recipient_role: role, entity_id: id }) {
  const template = events.get(type)
  const [icon, title, description] = template ?? ['bell', 'Account update', 'An update was recorded for your account.']
  let to = null
  if (template && typeof id === 'string' && uuid.test(id)) {
    if (type.startsWith('verification_')) {
      if (role === 'applicant') to = '/verification'
    } else if (type === 'conversation_report_resolved') {
      if (role === 'reporter') to = `/messages/${id}#conversation-reports`
    } else if (type === 'review_dispute_resolved') {
      if (role === 'owner') to = `/review-disputes#dispute-${id}`
    } else if (type === 'review_published') {
      if (role === 'owner') to = `/listings/${id}#rental-reviews`
    } else if (type === 'review_response_published' || type === 'review_visibility_updated') {
      if (role === 'renter') to = `/listings/${id}#rental-reviews`
    } else if (role === 'owner' || role === 'renter') {
      if (type === 'inquiry_received' || type === 'message_received') to = '/messages/' + id
      else if (type.startsWith('viewing_')) to = '/viewings' + (role === 'owner' ? '?tab=incoming' : '') + '#viewing-' + id
      else to = '/bookings' + (role === 'owner' ? '?tab=incoming' : '') + '#booking-' + id
    }
  }
  return { icon, title, description, to }
}
