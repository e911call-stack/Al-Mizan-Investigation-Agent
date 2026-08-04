'use client';
import Link from 'next/link';
import { useLang } from '../components/LangContext';
import { dict } from '../lib/dict';

export default function LandingPage() {
  const { lang, toggle } = useLang();
  const d = dict[lang];

  const agents = [
    [d.a1t, d.a1d], [d.a2t, d.a2d], [d.a3t, d.a3d], [d.a4t, d.a4d],
    [d.a5t, d.a5d], [d.a6t, d.a6d], [d.a7t, d.a7d], [d.a8t, d.a8d]
  ];

  return (
    <div>
      <nav className="landing-nav">
        <span className="mark">{d.brand}</span>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <button className="lang-toggle" style={{ color: 'var(--ink-900)', borderColor: 'var(--ink-500)' }} onClick={toggle}>
            {d.langToggle}
          </button>
          <Link href="/investigate" className="landing-cta">{d.navLaunch}</Link>
        </div>
      </nav>

      <header className="hero">
        <p className="eyebrow">{d.heroEyebrow}</p>
        <h1 className="display">{d.heroTitle}</h1>
        <p className="lede">{d.heroLede}</p>
        <div className="hero-actions">
          <Link href="/investigate" className="primary">{d.heroPrimary}</Link>
          <a href="#how" className="secondary">{d.heroSecondary}</a>
        </div>
      </header>

      <section className="section" id="how">
        <p className="eyebrow">{d.howEyebrow}</p>
        <h2 className="display">{d.howTitle}</h2>
        <p className="lede">{d.howLede}</p>
        <div className="agent-grid">
          {agents.map(([title, body], i) => (
            <div className="agent-card" key={i}>
              <div className="num">{String(i + 1).padStart(2, '0')} / 08</div>
              <h3 className="display">{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="trust-band">
        <section className="section">
          <p className="eyebrow" style={{ color: 'var(--brass)' }}>{d.trustEyebrow}</p>
          <h2 className="display">{d.trustTitle}</h2>
          <p className="lede">{d.trustLede}</p>
          <div className="trust-grid">
            <div className="trust-item"><h3 className="display">{d.t1h}</h3><p>{d.t1d}</p></div>
            <div className="trust-item"><h3 className="display">{d.t2h}</h3><p>{d.t2d}</p></div>
            <div className="trust-item"><h3 className="display">{d.t3h}</h3><p>{d.t3d}</p></div>
          </div>
        </section>
      </div>

      <section className="section">
        <div className="stub-callout">
          <h3 className="display">{d.stubTitle}</h3>
          <p>{d.stubBody}</p>
        </div>
      </section>

      <footer className="landing-footer">{d.footer}</footer>
    </div>
  );
}
