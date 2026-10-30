import './Branding.css'

const SITE_HOME = '/'
const LOGO_SRC = `${import.meta.env.BASE_URL}favicon.svg`

export function BrandLogo({ className = '' }) {
  return (
    <a
      className={`awm-logo-link ${className}`.trim()}
      href={SITE_HOME}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="More simulations at alexmoorephysics.com"
      title="More simulations"
    >
      <img src={LOGO_SRC} alt="" />
    </a>
  )
}
