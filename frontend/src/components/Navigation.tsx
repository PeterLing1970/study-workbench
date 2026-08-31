import { BookOpenText, ChartNoAxesColumnIncreasing, House, MessageCircle, UserRound } from 'lucide-react'
import type { TabId } from '../types'

const studentItems: Array<{ id: TabId; label: string; Icon: typeof House }> = [
  { id: 'today', label: '今日', Icon: House },
  { id: 'wrong', label: '错题', Icon: BookOpenText },
  { id: 'coach', label: '辅导', Icon: MessageCircle },
  { id: 'scores', label: '成绩', Icon: ChartNoAxesColumnIncreasing },
  { id: 'profile', label: '我的', Icon: UserRound },
]

const parentItems: Array<{ id: TabId; label: string; Icon: typeof House }> = [
  { id: 'today', label: '概览', Icon: House },
  { id: 'scores', label: '成绩', Icon: ChartNoAxesColumnIncreasing },
  { id: 'profile', label: '我的', Icon: UserRound },
]

interface NavigationProps {
  active: TabId
  onChange: (tab: TabId) => void
  role: 'student' | 'parent'
}

export function Navigation({ active, onChange, role }: NavigationProps) {
  const items = role === 'parent' ? parentItems : studentItems
  return (
    <nav className="navigation" aria-label="主导航">
      <div className="desktop-brand">
        <span>AI学习助手</span>
      </div>
      <div className={role === 'parent' ? 'nav-items nav-items-parent' : 'nav-items'}>
        {items.map(({ id, label, Icon }) => (
          <button
            className={active === id ? 'nav-item is-active' : 'nav-item'}
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={active === id ? 'page' : undefined}
          >
            <Icon aria-hidden="true" size={23} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
