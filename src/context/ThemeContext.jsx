import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)
const readPreference = () => {
  try {
    const value = localStorage.getItem('erental-theme')
    return ['light', 'dark', 'system'].includes(value) ? value : 'system'
  } catch {
    return 'system'
  }
}
export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readPreference)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme =
        preference === 'system'
          ? media.matches
            ? 'dark'
            : 'light'
          : preference
    }
    apply()
    try {
      localStorage.setItem('erental-theme', preference)
    } catch {
      /* Theme still works when storage is unavailable. */
    }
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [preference])
  useEffect(() => {
    const sync = (e) => {
      if (e.key === 'erental-theme') setPreference(readPreference())
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  )
}
export const useTheme = () => useContext(ThemeContext)
