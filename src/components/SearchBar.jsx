import { useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon.jsx'
import '../styles/discovery.css'

export default function SearchBar() {
  const navigate = useNavigate()
  const id = useId()
  const keywordRef = useRef(null)
  const placeRef = useRef(null)
  const composing = useRef(false)
  const [keyword, setKeyword] = useState('')
  const [place, setPlace] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (composing.current) return
    const params = new URLSearchParams()
    if (keyword.trim()) params.set('q', keyword.trim())
    if (place.trim()) params.set('location', place.trim())
    navigate({ pathname: '/listings', search: params.toString() })
  }

  const compositionEvents = {
    onCompositionStart: () => { composing.current = true },
    onCompositionEnd: () => { composing.current = false },
    onKeyDown: (e) => { if (e.key === 'Enter' && (e.nativeEvent.isComposing || composing.current)) e.preventDefault() },
  }

  return (
    <form className="searchbar rental-search" role="search" noValidate onSubmit={handleSubmit}>
      <div className="rental-search__field">
        <Icon name="search" size={22} />
        <div className="rental-search__input">
          <label htmlFor={`${id}-keyword`}>What do you want to rent?</label>
          <input id={`${id}-keyword`} ref={keywordRef} type="search" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="A room, a ride, something useful…" {...compositionEvents} />
        </div>
        {keyword && <button className="rental-search__clear" type="button" aria-label="Clear rental search" onClick={() => { setKeyword(''); keywordRef.current?.focus() }}><Icon name="x" size={16} /></button>}
      </div>
      <div className="rental-search__field rental-search__field--place">
        <Icon name="mapPin" size={22} />
        <div className="rental-search__input">
          <label htmlFor={`${id}-place`}>Location</label>
          <input id={`${id}-place`} ref={placeRef} type="text" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Barangay or area in Iligan" {...compositionEvents} />
        </div>
        {place && <button className="rental-search__clear" type="button" aria-label="Clear location" onClick={() => { setPlace(''); placeRef.current?.focus() }}><Icon name="x" size={16} /></button>}
      </div>
      <button type="submit" className="btn btn-primary"><Icon name="search" size={19} />Search</button>
    </form>
  )
}
