import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Rydding',
  description: 'Faste ryddeoppgaver og hva som bør gjøres på ryddedagen',
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
}

export default function RyddingLayout({ children }: { children: React.ReactNode }) {
  return children
}
