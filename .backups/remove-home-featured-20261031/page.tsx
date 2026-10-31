import Link from 'next/link';
import Image from 'next/image';
import BrandGlyph from './components/BrandGlyph';
import HomeFeaturedResources from './components/HomeFeaturedResources';
import styles from './components/HomeLanding.module.css';

export default function Home() {
  return <main className={styles.page}>
    <div className={styles.wrap}>
      <section className={styles.hero} aria-labelledby="home-heading">
        <div>
          <p className={styles.eyebrow}>Your community. Your next possibility.</p>
          <h1 id="home-heading">Great ideas.<br />Meet your<br /><span>next possibility.</span></h1>
          <p className={styles.intro}>The right equipment. The space to create. Discover what your community has to offer, and put your next idea in motion.</p>
          <div className={styles.actions}><Link className={styles.primary} href="/resources">Explore resources <BrandGlyph kind="arrow" /></Link><Link className={styles.secondary} href="/register">Join your community</Link></div>
          <p className={styles.note}><BrandGlyph kind="check" />Clear eligibility. Upfront pricing. Owner-reviewed requests.</p>
        </div>
        <div className={styles.gallery}>
          <div className={styles.collage}>
            <div className={styles.photoFrame+' '+styles.lab}><Image src="/resources/homepage/56ac7aa0-ad5d-491e-92fd-8ed94a757f50.jpg" alt="Computer laboratory with rows of desktop workstations" fill sizes="(max-width: 767px) 55vw, (max-width: 1599px) 26vw, 340px" loading="eager" /></div>
            <div className={styles.photoFrame+' '+styles.equipment}><Image src="/resources/newimage.jpg" alt="A projector and laptop ready for a presentation" fill sizes="(max-width: 767px) 43vw, (max-width: 1599px) 22vw, 290px" loading="eager" /></div>
            <div className={styles.photoFrame+' '+styles.space}><Image src="/resources/homepage/97394130-0ac5-469a-b2f6-5abad69e6b55.jpg" alt="Seminar hall with chairs and a presentation screen" fill sizes="(max-width: 767px) 43vw, (max-width: 1599px) 22vw, 290px" loading="eager" /></div>
          </div>
          <p className={styles.galleryCaption}><span>Spaces to learn. Tools to create.</span><span>Equipment / Spaces / Learning</span></p>
        </div>
      </section>
      <div className={styles.principles}><strong>Built around responsible sharing</strong><span><BrandGlyph kind="search" />AI-assisted discovery</span><span><BrandGlyph kind="calendar" />Owner-reviewed bookings</span><span><BrandGlyph kind="check" />Transparent access rules</span></div>
      <section className={styles.discovery} aria-labelledby="featured-heading">
        <div className={styles.sectionTop}><div><p className={styles.eyebrow}>Explore the community</p><h2 id="featured-heading">The right resource changes everything.</h2><p className={styles.sectionCopy}>A glimpse of the current catalog. Find a space, a tool or a new way forward.</p></div><Link className={styles.textLink} href="/resources">View all resources <BrandGlyph kind="arrow" /></Link></div>
        <HomeFeaturedResources />
      </section>
      <section className={styles.ai} aria-labelledby="ai-heading">
        <div><p className={styles.eyebrow}>Discovery, with a little intelligence</p><h2 id="ai-heading">Start with the idea.<br />Find what fits.</h2><p>Not sure what to look for? Describe your project to our Gemini-powered resource finder and explore relevant resources from the available catalog.</p><Link className={styles.textLink} href="/resources">Explore the AI resource finder <BrandGlyph kind="arrow" /></Link></div>
        <div className={styles.aiPanel} aria-label="How AI-assisted discovery works"><div className={styles.aiPanelTop}><span>From a need to a next step</span><BrandGlyph kind="search" /></div><ol><li><span>01</span><div><strong>Describe your project</strong><p>What you need, where and why.</p></div></li><li><span>02</span><div><strong>Explore relevant resources</strong><p>Recommendations draw on available listings.</p></div></li><li><span>03</span><div><strong>You choose what happens next</strong><p>Review eligibility. Request owner approval.</p></div></li></ol></div>
      </section>
      <section className={styles.workflow} aria-labelledby="workflow-heading">
        <div className={styles.workflowIntro}><p className={styles.eyebrow}>A clear path from idea to action</p><h2 id="workflow-heading">Less friction.<br />More making<br />things happen.</h2><p>Every resource has an owner. Every project has a purpose. Keep discovery, requests and responsible use connected.</p></div>
        <ol>{[
          { icon: 'search' as const, label: '01 / Discover', title: 'Find your fit.', text: 'Browse real listings by category, location and availability. Review the hourly price, eligibility and access rules before you book.' },
          { icon: 'calendar' as const, label: '02 / Request', title: 'Make time for your idea.', text: 'Choose your booking window, review the estimated cost and tell the owner what you are working on. Your request goes to them for review.' },
          { icon: 'check' as const, label: '03 / Owner approval & use', title: 'Create. Care. Share again.', text: 'Track the decision from the owner. Once approved, follow the access rules, check in, record conditions and return the resource responsibly.' },
        ].map(step => <li key={step.label}><span className={styles.stepIcon}><BrandGlyph kind={step.icon} /></span><div><span className={styles.stepLabel}>{step.label}</span><h3>{step.title}</h3><p>{step.text}</p></div></li>)}</ol>
      </section>
      <section className={styles.owner} aria-labelledby="owner-heading"><div><p className={styles.eyebrow}>For resource owners</p><h2 id="owner-heading">What you have could be<br />the start of a big idea.</h2><p>Give your equipment and spaces a bigger purpose. Share what is available, set clear rules and stay in control of every request.</p></div><div className={styles.ownerAction}><Link className={styles.primary} href="/register">Become a resource owner <BrandGlyph kind="arrow" /></Link><p>Your resources. Your rules. Your approval.</p></div></section>
    </div>
  </main>;
}
