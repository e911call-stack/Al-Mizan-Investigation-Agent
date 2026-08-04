'use client';
import Link from 'next/link';
import { useLang } from '../../components/LangContext';
import { dict } from '../../lib/dict';

export default function InvestigateLayout({ children }) {
  const { lang, toggle } = useLang();
  const d = dict[lang];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>
            <span className="mark">{d.brand}</span>
          </Link>
          <span className="sep">·</span>
          <span className="sub">{d.brandSub}</span>
        </div>
        <div className="right">
          <button className="lang-toggle" onClick={toggle}>{d.langToggle}</button>
        </div>
      </header>
      {children}
    </div>
  );
}
