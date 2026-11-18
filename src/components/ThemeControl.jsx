import { useId } from 'react'
import { useTheme } from '../context/ThemeContext.jsx'
import Icon from './Icon.jsx'
export default function ThemeControl() {
  const id = useId()
  const { preference, setPreference } = useTheme()
  return (
    <div className="theme-control">
      <Icon
        name={
          preference === 'system'
            ? 'monitor'
            : preference === 'dark'
              ? 'moon'
              : 'sun'
        }
        size={18}
      />
      <label htmlFor={id} className="sr-only">
        Color theme
      </label>
      <select
        id={id}
        value={preference}
        onChange={(e) => setPreference(e.target.value)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  )
}
