'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLang } from '../../components/LangContext';
import { dict } from '../../lib/dict';

const strings = {
  en: {
    eyebrow: 'Step 1 — Intake', title: 'Open a case investigation',
    sub: 'The agent pipeline researches, routes, and prepares a case package for your review.',
    label: 'Case narrative (typed/pasted for now — the Intake Agent reads this text)',
    placeholder: 'e.g. On 15 March 2024, Jordan Trading & Investment Co. signed a supply agreement with Mohammed Al-Abdullah in Amman. Al-Abdullah failed to deliver goods worth 50,000 JOD by the agreed date of 1 June 2024...',
    start: 'Begin investigation', starting: 'Intake Agent reading case…',
    needFacts: 'Add a case narrative first — the Intake Agent needs text to extract from.',
    clarTitle: 'The Intake Agent needs more detail before continuing:',
    truncated: 'This narrative is over 20,000 characters. The Intake Agent reads only the first 20,000 — trim it to make sure nothing important is lost.',
    failed: 'Could not reach the server — check your connection.'
  },
  ar: {
    eyebrow: 'الخطوة ١ — الإدخال', title: 'فتح تحقيق في قضية',
    sub: 'يقوم مسار الوكلاء بالبحث والتوجيه وإعداد ملف قضية لمراجعتك.',
    label: 'سرد القضية (مكتوب/ملصوق حاليًا — وكيل الإدخال يقرأ هذا النص)',
    placeholder: 'مثال: في ١٥ مارس ٢٠٢٤، وقّعت شركة الأردن للتجارة والاستثمار اتفاقية توريد مع محمد العبدالله في عمّان. لم يقم العبدالله بتسليم بضائع بقيمة ٥٠,٠٠٠ دينار بحلول الموعد المتفق عليه...',
    start: 'بدء التحقيق', starting: 'وكيل الإدخال يقرأ القضية…',
    needFacts: 'أضف سرد القضية أولاً — يحتاج وكيل الإدخال إلى نص لاستخراج البيانات منه.',
    clarTitle: 'يحتاج وكيل الإدخال إلى مزيد من التفاصيل قبل المتابعة:',
    truncated: 'يتجاوز هذا السرد ٢٠,٠٠٠ حرفًا. يقرأ وكيل الإدخال أول ٢٠,٠٠٠ حرفًا فقط — اختصره للتأكد من عدم فقدان أي معلومة مهمة.',
    failed: 'تعذر الوصول إلى الخادم — تحقق من الاتصال.'
  }
};

export default function NewCasePage() {
  const { lang } = useLang();
  const s = strings[lang];
  const router = useRouter();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [ambiguities, setAmbiguities] = useState(null);
  const [error, setError] = useState(null);

  async function begin() {
    setError(null);
    setAmbiguities(null);
    if (!text.trim()) { setError(s.needFacts); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/case/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseFacts: text })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || s.failed); return; }
      if (data.status === 'needs_clarification') {
        setAmbiguities(data.extracted.ambiguities || []);
        return;
      }
      router.push(`/investigate/${data.caseId}`);
    } catch (e) {
      setError(s.failed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="view">
      <p className="eyebrow">{s.eyebrow}</p>
      <h1 className="page-title display">{s.title}</h1>
      <p className="page-sub">{s.sub}</p>

      <div className="card">
        <label>{s.label}</label>
        <textarea
          rows={8}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={s.placeholder}
          style={{ width: '100%', border: '1px solid var(--paper-line)', background: '#fff', borderRadius: 'var(--radius-s)', padding: '9px 11px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
        />

        {text.length > 20000 && (
          <p style={{ color: 'var(--flag)', fontSize: 12.5, marginTop: 8 }}>{s.truncated}</p>
        )}

        {ambiguities && (
          <div style={{ marginTop: 16, background: 'var(--alert-bg)', border: '1px solid var(--alert)', borderRadius: 'var(--radius-m)', padding: '14px 16px' }}>
            <strong style={{ display: 'block', marginBottom: 6, fontSize: 13.5, color: 'var(--alert)' }}>{s.clarTitle}</strong>
            <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13 }}>
              {ambiguities.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          </div>
        )}

        {error && <p style={{ color: 'var(--alert)', fontSize: 13, marginTop: 12 }}>{error}</p>}

        <div className="btn-row">
          <button className="btn btn-primary" onClick={begin} disabled={loading}>
            {loading ? s.starting : s.start}
          </button>
        </div>
      </div>
    </main>
  );
}
