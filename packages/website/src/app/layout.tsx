import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '@/lib/sections'
import './globals.css'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap'
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap'
})

const SITE_URL = 'https://github.com/scott20201225/marknote-pro'
const TITLE = 'MarkNotePro — The Markdown editor that gets out of your way'
const DESCRIPTION =
  'A free, open-source, real-time preview Markdown editor for macOS, Windows and Linux. Beautiful typography, 33 built-in themes, math, diagrams, footnotes — all rendered live.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: '%s | MarkNotePro'
  },
  description: DESCRIPTION,
  applicationName: 'MarkNotePro',
  keywords: [
    'markdown editor',
    'WYSIWYG markdown',
    'CommonMark',
    'GitHub Flavored Markdown',
    'GFM',
    'KaTeX',
    'Mermaid',
    'PlantUML',
    'Electron',
    'macOS',
    'Windows',
    'Linux'
  ],
  authors: [{ name: 'ScottCheng', url: 'https://github.com/scott20201225' }],
  creator: 'ScottCheng',
  alternates: { canonical: '/' },
  icons: { icon: '/favicon.png' },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'MarkNotePro',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: '/favicon.png', width: 512, height: 512, alt: 'MarkNotePro logo' }]
  },
  twitter: {
    card: 'summary_large_image',
    site: '@marknoteproapp',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/favicon.png']
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#08080b'
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'MarkNotePro',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'macOS, Windows, Linux',
  description: DESCRIPTION,
  url: SITE_URL,
  license: 'https://github.com/scott20201225/marknote-pro/blob/main/LICENSE',
  author: { '@type': 'Person', name: 'ScottCheng', url: 'https://github.com/scott20201225' },
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  downloadUrl: 'https://github.com/scott20201225/marknote-pro/releases/latest',
  softwareVersion: 'latest'
}

// Inline before paint to avoid theme flash.
const themeBootstrap = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(!t)t=${JSON.stringify(DEFAULT_THEME)};document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme',${JSON.stringify(DEFAULT_THEME)});}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME} className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  )
}
