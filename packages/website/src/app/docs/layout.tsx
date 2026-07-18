import type { Metadata } from 'next'
import DocsChrome from '@/components/docs/DocsChrome'
import './docs.css'

export const metadata: Metadata = {
  title: {
    default: 'Documentation',
    template: '%s · MarkNotePro Docs'
  },
  description:
    'Guides, reference and developer documentation for MarkNotePro — the WYSIWYG markdown editor.'
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="bg-fx" />
      <div className="bg-grid" />
      <DocsChrome>{children}</DocsChrome>
    </>
  )
}
