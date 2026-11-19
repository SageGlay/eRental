import Icon from './Icon.jsx'
export default function EmptyState({ icon, title, children, action }) {
  return (
    <div className="empty-state">
      {icon && <span className="empty-state__icon" aria-hidden="true">
        {typeof icon === 'string' ? <Icon name="box" size={28} /> : icon}
      </span>}
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  )
}
