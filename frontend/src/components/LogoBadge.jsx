import logos from '../assets/logos.png'
import './LogoBadge.css'

export default function LogoBadge() {
  return (
    <div className="logo-badge">
      <img src={logos} alt="MIT Media Lab · City Science" />
    </div>
  )
}
