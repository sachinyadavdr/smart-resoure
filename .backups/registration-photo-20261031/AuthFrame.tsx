import type { ReactNode } from 'react';
import BrandGlyph from './BrandGlyph';
import styles from './PhaseOne.module.css';

export default function AuthFrame({ children, register = false }: { children: ReactNode; register?: boolean }) {
  return <main className={`${styles.page} ${styles.auth}`}><div className={styles.authShell}>
    <aside className={styles.authStory} aria-label="About ResourceBridge">
      <p className={styles.eyebrow}>The shared resource community</p>
      <h2>{register ? <>Your next chapter.<br /><span>Our shared possibilities.</span></> : <>Less searching.<br /><span>More making things happen.</span></>}</h2>
      <p>Connect your ideas with the equipment, spaces and learning resources around you. One place to discover, request and share.</p>
      <div className={styles.authGraphic} aria-hidden="true"><div><BrandGlyph kind="equipment" /><span>Equipment</span></div><div><BrandGlyph kind="space" /><span>Spaces</span></div><div><BrandGlyph kind="learning" /><span>Learning</span></div></div>
      <div className={styles.storyFooter}><BrandGlyph kind="bridge" /><div><strong>Good resources. Greater possibilities.</strong><p>Clear access rules, owner-reviewed bookings and responsible sharing, from the first request to the final return.</p></div></div>
    </aside>
    <div className={styles.authContent}>{children}</div>
  </div></main>;
}
