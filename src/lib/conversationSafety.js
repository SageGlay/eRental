export const reportReasons = [
  ['harassment', 'Harassment'],
  ['spam', 'Spam'],
  ['suspected_scam', 'Suspected scam'],
  ['threatening_language', 'Threatening or abusive language'],
  ['inappropriate_content', 'Inappropriate content'],
  ['other', 'Other'],
]

const labels = Object.fromEntries(reportReasons)
export const reportReasonLabel = (reason) => Object.hasOwn(labels, reason) ? labels[reason] : 'Conversation concern'

const statuses = { pending: 'Pending review', dismissed: 'Dismissed', upheld: 'Upheld' }
export const reportStatusLabel = (status) => Object.hasOwn(statuses, status) ? statuses[status] : 'Status unavailable'
