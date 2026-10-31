import './globals.css';
import Link from 'next/link';
import SiteNavigation from './components/SiteNavigation';
export const metadata = { title: 'ResourceBridge AI | Shared access, more possibilities', description: 'Discover equipment, spaces and learning resources. Request bookings and share responsibly with your community.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><SiteNavigation /><div id="main-content" tabIndex={-1}>{children}</div><footer className="mt-12 border-t border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-slate-500"><p><strong className="text-slate-800">ResourceBridge AI</strong> · Shared access, more possibilities.</p><div className="flex gap-5"><Link href="/resources">Explore resources</Link><Link href="/image-credits">Image credits</Link></div></div></footer></body></html>;
}
