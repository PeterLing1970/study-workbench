import { Atom, Languages, Radical } from 'lucide-react'

const iconMap = {
  数学: Radical,
  英语: Languages,
  物理: Atom,
}

export function SubjectIcon({ subject }: { subject: string }) {
  const Icon = iconMap[subject as keyof typeof iconMap] ?? Radical
  return <Icon aria-hidden="true" size={28} strokeWidth={1.7} />
}

