import {
  Atom,
  BookOpen,
  FlaskConical,
  Landmark,
  Languages,
  LetterText,
  Radical,
  Scale,
} from 'lucide-react'

const iconMap = {
  数学: Radical,
  语文: Languages,
  英语: LetterText,
  物理: Atom,
  化学: FlaskConical,
  道法: Scale,
  历史: Landmark,
}

export function SubjectIcon({ subject }: { subject: string }) {
  const Icon = iconMap[subject as keyof typeof iconMap] ?? BookOpen
  return <Icon aria-hidden="true" size={28} strokeWidth={1.7} />
}

