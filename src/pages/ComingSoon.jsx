import { Link, useSearchParams } from 'react-router-dom'
import EmptyState from '../components/EmptyState.jsx'
import { categories } from '../data/categories.js'

export default function ComingSoon({ title, note, showQuery = false }) {
  const [params] = useSearchParams()
  const category = categories.find((c) => c.slug === params.get('category'))
  const searched = showQuery
    ? [params.get('q') && `“${params.get('q')}”`, params.get('location') && `in ${params.get('location')}`, category?.name].filter(Boolean)
    : []

  return (
    <section className="container page">
      <h1>{title}</h1>
      <EmptyState icon="🚧" title="Not built yet" action={<Link className="btn btn-primary" to="/">Back to home</Link>}>
        {searched.length > 0 && `You searched for ${searched.join(' · ')}. `}
        {note}
      </EmptyState>
    </section>
  )
}
