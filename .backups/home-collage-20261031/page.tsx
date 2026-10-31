import Link from 'next/link';
import Image from 'next/image';
import BrandGlyph from './components/BrandGlyph';
import styles from './components/PhaseOne.module.css';
import heroStyles from './components/HomeHeroPhoto.module.css';

export default function Home() {
  return <main className={styles.page}>
    <div className={styles.wrap}>
      <section className={styles.hero} aria-labelledby="home-heading">
        <div>
          <p className={styles.eyebrow}>Shared access. More possibilities.</p>
          <h1 id="home-heading">Great ideas.<br />Meet your<br /><span>next possibility.</span></h1>
          <p className={styles.intro}>The right equipment. The space to create. Discover what your community has to offer, and put your next idea in motion.</p>
          <div className={styles.actions}><Link className={styles.primary} href="/resources">Explore resources <BrandGlyph kind="arrow" /></Link><Link className={styles.secondary} href="/register">Join your community</Link></div>
          <p className={styles.note}><BrandGlyph kind="check" width="16" height="16" />Clear eligibility. Upfront pricing. Owner-reviewed requests.</p>
        </div>
        <div className={heroStyles.visual}>
          <Image src="/resources/newimage.jpg" alt="A projector and laptop on a desk displaying presentation charts" fill sizes="(max-width: 767px) 100vw, (max-width: 1279px) 46vw, 562px" loading="eager" className={heroStyles.photo} />
        </div>
      </section>
      <div className={styles.principles}><strong>Designed for responsible sharing</strong><span><BrandGlyph kind="search" />AI-assisted discovery</span><span><BrandGlyph kind="calendar" />Transparent booking requests</span><span><BrandGlyph kind="check" />Clear access rules</span></div>
      <section className={styles.journey} aria-labelledby="journey-heading">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>From idea to action</p><h2 id="journey-heading">A little less friction.<br />A lot more possibility.</h2></div><p>Find what fits your project and keep every step of your booking in one place.</p></div>
        <div className={styles.steps}>{[
          { number: '01', icon: 'search' as const, title: 'Find your fit', text: 'Browse by category, location and availability. Or describe your project to the AI resource finder.' },
          { number: '02', icon: 'calendar' as const, title: 'Make your request', text: 'Review pricing, eligibility and access rules. Choose your time and send a request to the owner.' },
          { number: '03', icon: 'bridge' as const, title: 'Bring it to life', text: 'Track approval, check in and record conditions. Return responsibly so the next idea can begin.' },
        ].map(step => <article className={styles.step} key={step.number}><div className={styles.stepTop}><span>{step.number} /</span><BrandGlyph kind={step.icon} /></div><h3>{step.title}</h3><p>{step.text}</p></article>)}</div>
      </section>
      <section className={styles.owner}><div><p className={styles.eyebrow}>For resource owners</p><h2 className="mt-3">Give what you have a bigger purpose.</h2><p>Share your equipment and spaces. Stay in control of every request.</p></div><Link className={styles.primary} href="/register">Become a resource owner <BrandGlyph kind="arrow" /></Link></section>
    </div>
  </main>;
}
