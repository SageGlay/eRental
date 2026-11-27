import { Link } from 'react-router-dom'
import PageHeading from '../components/PageHeading.jsx'
import '../styles/legal.css'

const terms = {
  title: 'Terms and conditions',
  description: 'How to list, request and hand over a rental on eRental.',
  sections: [
    {
      id: 'accounts',
      heading: 'Your account',
      content: <p>eRental connects people renting equipment, vehicles and spaces in Iligan City. You can rent and list items from the same individual or business account. Use accurate profile information, protect your sign-in details and check that you are using your own account before sending a request or message.</p>,
    },
    {
      id: 'listings',
      heading: 'Listing an item',
      content: <p>Only offer items or spaces you have permission to rent. Describe the condition, rental period, rate, deposit and pickup area accurately. Use photos you have permission to publish. Update availability when plans change. Featured listings help renters discover inventory. Owners remain responsible for what they offer.</p>,
    },
    {
      id: 'bookings',
      heading: 'Requests and handover',
      content: <>
        <p>A booking request goes to the owner for a decision. Check your booking status before making plans. Owners and renters can use their conversation to agree on the dates, total cost, pickup location, return arrangements and how to handle damage or delays.</p>
        <p>At handover, both parties should check the item together and agree on its condition. Return it as agreed and communicate changes promptly. The parties arrange the physical exchange themselves. eRental provides no item inspection, transaction guarantee or insurance.</p>
      </>,
    },
    {
      id: 'payments',
      heading: 'Simulated payments',
      content: <p>Rental, deposit and refund amounts in the booking workflow are simulations. A simulated payment records a test transaction. No money changes hands through eRental. Confirm any separate payment arrangement directly with the other party before handover.</p>,
    },
    {
      id: 'verification',
      heading: 'What verification covers',
      content: <p>An identity or business badge records an administrator’s review of evidence for that account. It cannot guarantee a person’s identity, ownership of an item, its condition or a safe transaction. Check the listing details and ask questions before committing to a rental.</p>,
    },
    {
      id: 'conduct',
      heading: 'Reviews, reports and misuse',
      content: <>
        <p>Describe your own experience when reviewing a completed rental. Keep reviews and messages relevant and respectful. Impersonation, false listings, harassment, fraudulent requests and sharing someone else’s private documents are prohibited.</p>
        <p>If a listing appears misleading, prohibited or unsafe, sign in, open the listing and choose <strong>Report this listing</strong>. Give the reason without including identity documents or passwords. Authorized administrators review reports and may remove listings. The project team has yet to publish a general support contact.</p>
      </>,
    },
  ],
}

const privacy = {
  title: 'Privacy notice',
  description: 'What eRental records, who can see it and which information you can manage.',
  sections: [
    {
      id: 'profiles',
      heading: 'Accounts and public listings',
      content: <>
        <p>eRental uses Supabase Authentication for account access, email confirmation and password recovery. Your sign-in email is used to manage your account. The public profile associated with a listing can show your display name, business information and current verification badge.</p>
        <p>Listings publish the details you provide, including photos, rate, rental period and pickup area. Use an area you are comfortable making public. Exchange precise handover details with the other participant in your conversation.</p>
      </>,
    },
    {
      id: 'rental-activity',
      heading: 'Bookings, messages and reports',
      content: <>
        <p>The booking record links the renter, owner and listing with dates, status and rental details. Simulated payment and refund records describe activity on that booking. Booking participants can consult their history. The simulation does not collect payment-card details or transfer funds.</p>
        <p>Participants can read their conversation and see its read state. Listing reviews publish feedback about completed rentals. Listing reports and reasons go to authorized administrators for moderation. Keep sensitive personal information out of messages, reviews, photos and report descriptions.</p>
      </>,
    },
    {
      id: 'discovery',
      heading: 'Saved listings and viewing history',
      content: <>
        <p>Saving a listing adds a private bookmark to your account. You can remove it in Saved listings. Your saved and recently viewed categories help select available rentals to recommend.</p>
        <p>eRental keeps up to 12 recently viewed listing IDs after a listing opens successfully. Signed-in history is stored for your account. A guest’s history stays in that browser tab’s session storage, separate from any member’s history. Use <strong>Clear history</strong> on Home to clear the current history. Your bookmarks remain available.</p>
      </>,
    },
    {
      id: 'notifications',
      heading: 'Account notifications',
      content: <p>Confirmed marketplace events create private updates for their recipients. A notification records the type of activity, a reference to its booking, conversation or verification submission, and when the notice was created and read. Marking it read updates your notification list. Full messages and verification rejection reasons stay in their respective account pages.</p>,
    },
    {
      id: 'verification-documents',
      heading: 'Verification documents',
      content: <p>Submitting evidence uploads a private file to Supabase Storage. The applicant and authorized administrators can access it for verification. The review records the decision and any permitted note. Other members can see your current identity or business badge. Submit only evidence needed for the review and keep private document links out of public listings.</p>,
    },
    {
      id: 'retention',
      heading: 'Storage and retention',
      content: <p>eRental uses Supabase for authentication, database records and file storage. Removing a bookmark or clearing recent views removes that saved activity. Signing out leaves account records in place. Booking and review histories, moderation records and private uploads can remain after a workflow ends. The project team has yet to publish an approved retention schedule for these records.</p>,
    },
    {
      id: 'privacy-requests',
      heading: 'Your information and privacy requests',
      content: <p>You can update your display name and business details in My profile, manage bookmarks in Saved listings and clear recent views on Home. Under the Philippine Data Privacy Act of 2012, you may have rights concerning access to and correction of personal information. The project owner still needs to confirm a contact and process for formal privacy requests before public release. Keep identity documents out of listing reports. Read the <a href="https://privacy.gov.ph/data-privacy-act/">Data Privacy Act on the National Privacy Commission website</a>.</p>,
    },
  ],
}

export default function LegalPage({ kind }) {
  const isPrivacy = kind === 'privacy'
  const page = isPrivacy ? privacy : terms
  return (
    <article className="container page legal-page">
      <PageHeading title={page.title}>
        <p>{page.description}</p>
      </PageHeading>
      <div className="legal-layout">
        <nav className="legal-contents" aria-label="On this page">
          <h2>On this page</h2>
          <ul>
            {page.sections.map(({ id, heading }) => (
              <li key={id}><a href={`#${id}`}>{heading}</a></li>
            ))}
          </ul>
        </nav>
        <div className="legal-text">
          <p className="legal-draft">Draft for project-owner and academic or legal review before public release.</p>
          {page.sections.map(({ id, heading, content }) => (
            <section key={id} aria-labelledby={id}>
              <h2 id={id} tabIndex={-1}>{heading}</h2>
              {content}
            </section>
          ))}
          <Link className="btn" to={isPrivacy ? '/terms' : '/privacy'}>
            {isPrivacy ? terms.title : privacy.title}
          </Link>
        </div>
      </div>
    </article>
  )
}
