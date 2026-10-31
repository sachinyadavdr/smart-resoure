import type { SVGProps } from 'react';

export default function BrandGlyph({ kind, ...props }: { kind: 'equipment' | 'space' | 'learning' | 'arrow' | 'check' | 'search' | 'calendar' | 'bridge' } & SVGProps<SVGSVGElement>) {
  const paths = {
    equipment: <><rect x="4" y="4" width="24" height="17" rx="3" /><path d="M10 28h12M16 21v7M9 10h14M9 15h7" /></>,
    space: <><path d="M4 28h24M7 28V9l18-5v24M12 13h2m5-2h2m-9 7h2m5-2h2M14 28v-5h5v5" /></>,
    learning: <><path d="m3 12 13-7 13 7-13 7-13-7Z M8 16v8c5 4 11 4 16 0v-8M29 12v11" /></>,
    arrow: <path d="M6 16h20M18 8l8 8-8 8" />,
    check: <><path d="m16 3 11 5v8c0 7-11 13-11 13S5 23 5 16V8l11-5Z" /><path d="m10 16 4 4 8-9" /></>,
    search: <><circle cx="14" cy="14" r="9" /><path d="m21 21 7 7" /></>,
    calendar: <><rect x="5" y="7" width="22" height="22" rx="3" /><path d="M10 3v8M22 3v8M5 15h22m-16 6 4 4 7-7" /></>,
    bridge: <><path d="M3 25V7m26 18V7M3 12c7 13 19 13 26 0M3 25h26M10 21v4m12-4v4M16 22v3" /></>,
  };
  return <svg width="20" height="20" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[kind]}</svg>;
}
