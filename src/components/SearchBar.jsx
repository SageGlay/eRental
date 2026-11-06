import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function SearchBar() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [place, setPlace] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (keyword.trim()) params.set('q', keyword.trim())
    if (place.trim()) params.set('location', place.trim())
    navigate({ pathname: '/listings', search: params.toString() })
  }

  return (
    <form className="searchbar" role="search" onSubmit={handleSubmit}>
      <label className="searchbar__field">
        <span className="sr-only">What do you want to rent?</span>
        <input type="search" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="What do you want to rent?" />
      </label>
      <label className="searchbar__field">
        <span className="sr-only">Location</span>
        <input type="text" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Barangay or area in Iligan" />
      </label>
      <button type="submit" className="btn btn-primary">Search</button>
    </form>
  )
}
