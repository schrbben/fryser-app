import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Boden',
  description: 'Hva ligger i hvilken boks i boden',
}

export const viewport: Viewport = {
  themeColor: '#1c1917',
}

export default function BodLayout({ children }: { children: React.ReactNode }) {
  return children
}
