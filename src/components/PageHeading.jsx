export default function PageHeading({
  eyebrow,
  title,
  children,
  actions,
  titleRef,
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 ref={titleRef} tabIndex={titleRef ? -1 : undefined}>
          {title}
        </h1>
        {children && <div className="page-heading__lead">{children}</div>}
      </div>
      {actions && <div className="page-heading__actions">{actions}</div>}
    </header>
  )
}
