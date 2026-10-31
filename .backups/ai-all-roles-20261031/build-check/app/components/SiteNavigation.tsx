'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { requestJson } from '../lib/api';

export default function SiteNavigation() {
  const pathname = usePathname();
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  useEffect(() => {
    const token = localStorage.getItem('resourcebridge_token');
    if (token) requestJson<{ user: { name: string; role: string } }>('/auth/me', { headers: { Authorization: `Bearer ${token}` } }).then(({ response, data }) => { if (response.ok && data) setUser(data.user); }).catch(() => {});
  }, []);
  const links = [{ href:'/resources', label:'Explore resources' }, ...(user ? [{ href:`/dashboard/${user.role}`, label:'Dashboard' }, { href:'/notifications', label:'Notifications' }, { href:'/audit', label:'Activity' }] : [])];
  const items = links.map(link => <Link key={link.href} className="nav-link" aria-current={pathname === link.href ? 'page' : undefined} href={link.href}>{link.label}</Link>);
  return <header className="site-header"><a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:bg-white focus:p-4">Skip to content</a><div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6"><Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900"><span className="brand-icon" aria-hidden="true">RB</span><span>ResourceBridge <span className="text-blue-600">AI</span></span></Link><nav aria-label="Main navigation" className="hidden items-center gap-1 lg:flex">{items}</nav><div className="flex items-center gap-2">{user ? <button className="btn border border-slate-200" onClick={() => { localStorage.removeItem('resourcebridge_token'); setUser(null); window.location.href='/'; }}>Log out</button> : <><Link className="nav-link hidden sm:block" href="/login">Log in</Link><Link className="btn-primary" href="/register">Get started</Link></>}</div></div><details className="mobile-menu lg:hidden"><summary>Menu</summary><nav aria-label="Mobile navigation">{items}{!user && <Link className="nav-link" href="/login">Log in</Link>}</nav></details></header>;
}
