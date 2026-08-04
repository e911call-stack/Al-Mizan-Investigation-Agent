'use client';
import { useEffect, useRef, useState } from 'react';
import { useLang } from '../../../components/LangContext';

const STAGE_NAMES_EN = ['Intake', 'Research', 'Court-Routing', 'Drafting', 'Citation Verification', 'Fact-Consistency', 'Assembler', 'Attorney Review Gate'];
const STAGE_NAMES_AR = ['الإدخال', 'البحث القانوني', 'تحديد المحكمة', 'الصياغة', 'التحقق من الاستشهادات', 'الاتساق الواقعي', 'التجميع', 'بوابة مراجعة المحامي'];
const STATUS_LABEL = {
  en: { done: 'Passed', running: 'Running…', pending: 'Pending', flag: 'Advisory flag', blocked: 'Blocked — needs review' },
  ar: { done: 'مكتمل', running: 'قيد التنفيذ…', pending: 'قيد الانتظار', flag: 'ملاحظة استشارية', blocked: 'محظور — يحتاج مراجعة' }
};

export default function CasePage({ params }) {
  const { caseId } = params;
  const { lang } = useLang();
  const [caseData, setCaseData] = useState(null);
  const [stages, setStages] = useState([]);
  const [audit, setAudit] = useState([]);
  const [selectedStage, setSelectedStage] = useState(0);
  const [view, setView] = useState('pipeline'); // pipeline | review
  const [reviewTab, setReviewTab] = useState('drafts');
  const [reverifying, setReverifying] = useState(false);
  const [toast, setToast] = useState('');
  const kickedOff = useRef(false);
  const pollRef = useRef(null);

  const stageNames = lang === 'en' ? STAGE_NAMES_EN : STAGE_NAMES_AR;
  const statusLabel = STATUS_LABEL[lang];

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  }

  async function refresh() {
    const res = await fetch(`/api/case/${caseId}`);
    if (!res.ok) return null;
    const data = await res.json();
    setCaseData(data.case);
    setStages(data.stages);
    setAudit(data.audit || []);
    return data;
  }

  useEffect(() => {
    let cancelled = false;

    async function kickoff() {
      const data = await refresh();
      if (!data || cancelled) return;

      // Fire the still-missing real agent calls once, in parallel.
      const jobs = [];
      if (!data.case.research) {
        jobs.push(fetch('/api/case/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId }) }));
      }
      if (!data.case.routing) {
        jobs.push(fetch('/api/case/routing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId }) }));
      }
      if (!data.case.fact_consistency) {
        jobs.push(fetch('/api/case/fact-consistency', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId }) }));
      }
      await Promise.allSettled(jobs);
      if (!cancelled) await refresh();

      // Citation Verification depends on Research's findings existing first.
      const after = await (await fetch(`/api/case/${caseId}`)).json();
      if (!after.case.citation_verification && after.case.research && after.case.research.findings && after.case.research.findings.length > 0) {
        await fetch('/api/case/verify-citations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId }) });
        if (!cancelled) await refresh();
      }

      if (!cancelled) {
        pollRef.current = setInterval(refresh, 1500);
      }
    }

    if (!kickedOff.current) {
      kickedOff.current = true;
      kickoff();
    }

    return () => { cancelled = true; if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  async function handleTierOneEdit() {
    setReverifying(true);
    try {
      const res = await fetch(`/api/case/${caseId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'partyName', value: caseData?.extracted?.parties?.[0]?.name })
      });
      const data = await res.json();
      if (res.ok) {
        await refresh();
        showToast(lang === 'en' ? 'Re-verification complete.' : 'اكتملت إعادة التحقق.');
      } else {
        showToast(data.error || (lang === 'en' ? 'Re-verification failed.' : 'فشلت إعادة التحقق.'));
      }
    } finally {
      setReverifying(false);
    }
  }

  async function handleApprove() {
    const res = await fetch(`/api/case/${caseId}/approve`, { method: 'POST' });
    if (res.ok) {
      await refresh();
      showToast(lang === 'en' ? 'Case package approved — marked attorney-reviewed.' : 'تمت الموافقة على ملف القضية.');
    }
  }

  if (!caseData) {
    return <main className="view"><p className="page-sub">{lang === 'en' ? 'Loading case…' : 'جارٍ تحميل القضية…'}</p></main>;
  }

  const extracted = caseData.extracted || {};
  const research = caseData.research;
  const routing = caseData.routing;
  const citeVerify = caseData.citation_verification;
  const factCheck = caseData.fact_consistency;

  return (
    <>
      <nav className="nav-tabs">
        <button className={view === 'pipeline' ? 'active' : ''} onClick={() => setView('pipeline')}>
          {lang === 'en' ? 'Investigation' : 'التحقيق'}
        </button>
        <button className={view === 'review' ? 'active' : ''} onClick={() => setView('review')}>
          {lang === 'en' ? 'Case package' : 'ملف القضية'}
        </button>
      </nav>

      {view === 'pipeline' && (
        <main className="view">
          <p className="eyebrow mono">{caseId}</p>
          <h1 className="page-title display">{(extracted.parties || []).map(p => p.name).join(' v. ') || (lang === 'en' ? 'Case investigation' : 'تحقيق القضية')}</h1>
          <p className="page-sub">{lang === 'en' ? 'Each stage is handled by a specialist agent. Verification stages are blocking.' : 'كل مرحلة يتولاها وكيل متخصص. مراحل التحقق إلزامية.'}</p>

          <div className="pipeline-grid">
            <div className="docket-rail">
              {stages.map((st, i) => (
                <div key={i} className={'stage' + (i === selectedStage ? ' selected' : '')} onClick={() => setSelectedStage(i)}>
                  <span className="stage-num mono">{String(i + 1).padStart(2, '0')}</span>
                  <div className="stage-body">
                    <div className="stage-name">{stageNames[i]}</div>
                    <div className={`stage-status status-text ${st.status}`}>
                      <span className={`dot ${st.status}`}></span>{statusLabel[st.status]}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="card stage-detail">
              <div className="eyebrow mono">{String(selectedStage + 1).padStart(2, '0')} / 08</div>
              <h2 className="display">{stageNames[selectedStage]}</h2>

              {selectedStage === 0 && (
                <div>
                  {(extracted.parties || []).map((p, i) => (
                    <div className="finding-row" key={i}><div className="finding-main"><div className="k">{p.name} <span style={{ color: 'var(--ink-500)', fontSize: 12 }}>({p.role})</span></div></div></div>
                  ))}
                  {(extracted.keyDates || []).map((d, i) => (
                    <div className="finding-row" key={i}><div className="finding-main"><div className="k">{d.date} — {d.context}</div><div className="anchor">&quot;{d.sourceAnchor}&quot;</div></div></div>
                  ))}
                  {extracted.jurisdictionSignal && <div className="finding-row"><div className="finding-main"><div className="k mono">jurisdiction_signal: {extracted.jurisdictionSignal}</div></div></div>}
                </div>
              )}

              {selectedStage === 1 && (
                research ? (
                  research.status === 'no_corpus_for_jurisdiction' ? <div className="tag-alert">{research.message}</div> :
                  research.status === 'no_relevant_authority' ? <div className="tag-flag">{lang === 'en' ? 'No relevant authority found in the stub corpus.' : 'لم يتم العثور على مرجع مناسب.'}</div> :
                  <>
                    {(research.findings || []).map((f, i) => (
                      <div className="finding-row" key={i}>
                        <div className="finding-main"><div className="k">{f.citation}</div><div className="anchor">{f.relevanceNote}</div></div>
                        <span className="tag-flag">{lang === 'en' ? 'stub — unverified' : 'تجريبي'}</span>
                      </div>
                    ))}
                    <p className="anchor" style={{ marginTop: 10 }}>{research.stubNotice}</p>
                  </>
                ) : <p className="anchor">{lang === 'en' ? 'Running…' : 'قيد التنفيذ…'}</p>
              )}

              {selectedStage === 2 && (
                routing ? (
                  routing.status === 'ok' ? (
                    <div className="card">
                      <div className="route-row"><span className="k">{lang === 'en' ? 'Recommended court' : 'المحكمة الموصى بها'}</span><span className="v">{routing.court}</span></div>
                      <div className="route-row"><span className="k">{lang === 'en' ? 'Filing fee' : 'رسوم التقديم'}</span><span className="v">{routing.fee} {routing.feeCurrency}</span></div>
                      <div className="route-row"><span className="k">{lang === 'en' ? 'Basis' : 'الأساس'}</span><span className="v">{routing.basis}</span></div>
                      <div className="route-row"><span className="k">{lang === 'en' ? 'Reference data' : 'البيانات المرجعية'}</span><span className="v freshness">{lang === 'en' ? 'Last verified' : 'آخر تحقق'} {routing.lastVerifiedDate} · {routing.referenceOwner}</span></div>
                    </div>
                  ) : <div className="tag-flag">{routing.message}</div>
                ) : <p className="anchor">{lang === 'en' ? 'Running…' : 'قيد التنفيذ…'}</p>
              )}

              {selectedStage === 3 && <p className="anchor">{lang === 'en' ? 'Drafting is still mocked — not yet built.' : 'الصياغة تجريبية حاليًا — لم تُبنَ بعد.'}</p>}

              {selectedStage === 4 && (
                citeVerify ? (
                  citeVerify.status === 'nothing_to_verify' ? <p className="anchor">{lang === 'en' ? 'No citations to verify.' : 'لا استشهادات للتحقق منها.'}</p> :
                  (citeVerify.results || []).map((r, i) => (
                    <div className="finding-row" key={i}>
                      <div className="finding-main"><div className="k">{r.citation}</div><div className="anchor">{r.reason}</div></div>
                      {r.verified ? <span className="seal"><span className="ring">✓</span>{lang === 'en' ? 'Verified' : 'موثّق'}</span> : <span className="tag-alert">{lang === 'en' ? 'Failed' : 'فشل'}</span>}
                    </div>
                  ))
                ) : <p className="anchor">{lang === 'en' ? 'Running…' : 'قيد التنفيذ…'}</p>
              )}

              {selectedStage === 5 && (
                factCheck ? (
                  <>
                    {(factCheck.tier1Issues || []).length > 0 ? factCheck.tier1Issues.map((iss, i) => (
                      <div className="finding-row" key={i}><div className="finding-main"><div className="k">{lang === 'en' ? 'Tier 1 issue' : 'مشكلة المستوى ١'}</div><div className="anchor">{iss}</div></div><span className="tag-alert">{lang === 'en' ? 'Blocking' : 'إلزامي'}</span></div>
                    )) : <div className="finding-row"><div className="finding-main"><div className="k">{lang === 'en' ? 'Tier 1/2 (hard facts)' : 'المستوى ١/٢'}</div></div><span className="seal"><span className="ring">✓</span>{lang === 'en' ? 'Consistent' : 'متسقة'}</span></div>}
                    {factCheck.tier3Note && <div className="tier3-note"><span>{factCheck.tier3Note}</span></div>}
                  </>
                ) : <p className="anchor">{lang === 'en' ? 'Running…' : 'قيد التنفيذ…'}</p>
              )}

              {selectedStage === 6 && <p className="anchor">{lang === 'en' ? 'Assembler is still mocked — not yet built.' : 'التجميع تجريبي حاليًا — لم يُبنَ بعد.'}</p>}

              {selectedStage === 7 && (
                <div className="btn-row" style={{ justifyContent: 'flex-start' }}>
                  <button className="btn btn-primary" onClick={() => setView('review')}>{lang === 'en' ? 'Case package →' : '← ملف القضية'}</button>
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {view === 'review' && (
        <main className="view">
          <p className="eyebrow">{lang === 'en' ? 'Attorney review gate' : 'بوابة مراجعة المحامي'}</p>
          <h1 className="page-title display">{lang === 'en' ? 'Case package' : 'ملف القضية'}</h1>
          <p className="page-sub">{lang === 'en' ? 'Nothing here is filed automatically.' : 'لا شيء هنا يُقدَّم تلقائيًا.'}</p>

          <div className="review-tabs">
            <button className={reviewTab === 'drafts' ? 'active' : ''} onClick={() => setReviewTab('drafts')}>{lang === 'en' ? 'Drafts' : 'المسودات'}</button>
            <button className={reviewTab === 'routing' ? 'active' : ''} onClick={() => setReviewTab('routing')}>{lang === 'en' ? 'Court & fees' : 'المحكمة والرسوم'}</button>
            <button className={reviewTab === 'audit' ? 'active' : ''} onClick={() => setReviewTab('audit')}>{lang === 'en' ? 'Audit trail' : 'سجل التدقيق'}</button>
          </div>

          {reverifying && (
            <div className="reverify-banner show">
              <span className="spin"></span>
              <span>{lang === 'en' ? 'Re-checking Fact-Consistency and Citation Verification…' : 'جارٍ إعادة التحقق…'}</span>
            </div>
          )}

          {reviewTab === 'drafts' && (
            <div>
              <div className="doc-block">
                <h3>{lang === 'en' ? 'Statement of Claim (Drafting not yet built — showing extracted facts only)' : 'لائحة الدعوى (الصياغة لم تُبنَ بعد — عرض الوقائع المستخرجة فقط)'}</h3>
                <div className="doc-text">
                  <p>
                    <span className="editable" onClick={handleTierOneEdit} title="Tier 1 fact — click to simulate an edit and re-trigger verification">
                      {extracted.parties?.[0]?.name || '—'}
                    </span> {lang === 'en' ? 'v.' : 'ضد'} {extracted.parties?.[1]?.name || '—'} — {extracted.claimType || '—'}
                    {extracted.claimValueEstimate ? `, ${extracted.claimValueEstimate} ${extracted.claimValueCurrency || ''}` : ''}
                  </p>
                </div>
              </div>
              <div className="doc-block">
                <h3>{lang === 'en' ? 'Citations from Research' : 'الاستشهادات من البحث القانوني'}</h3>
                <div className="card">
                  {(research?.findings || []).length === 0 && <p className="anchor">{lang === 'en' ? 'None yet.' : 'لا يوجد بعد.'}</p>}
                  {(research?.findings || []).map((f, i) => (
                    <div className="finding-row" key={i}>
                      <div className="finding-main"><div className="k">{f.citation}</div><div className="anchor">{f.relevanceNote}</div></div>
                      <span className="seal"><span className="ring">✓</span>{lang === 'en' ? 'stub-verified' : 'تحقق تجريبي'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {reviewTab === 'routing' && (
            <div>
              {routing && routing.status === 'ok' ? (
                <div className="card">
                  <div className="route-row"><span className="k">{lang === 'en' ? 'Recommended court' : 'المحكمة الموصى بها'}</span><span className="v">{routing.court}</span></div>
                  <div className="route-row"><span className="k">{lang === 'en' ? 'Filing fee' : 'رسوم التقديم'}</span><span className="v">{routing.fee} {routing.feeCurrency}</span></div>
                  <div className="route-row"><span className="k">{lang === 'en' ? 'Reference data' : 'البيانات المرجعية'}</span><span className="v freshness">{lang === 'en' ? 'Last verified' : 'آخر تحقق'} {routing.lastVerifiedDate} · {routing.referenceOwner}</span></div>
                </div>
              ) : <p className="page-sub">{routing?.message || (lang === 'en' ? 'Not available yet.' : 'غير متاح بعد.')}</p>}
              <p className="page-sub" style={{ marginTop: 14 }}>{lang === 'en' ? 'Reference information only — confirm against the court\'s current published schedule before filing.' : 'معلومات مرجعية فقط — تأكد من الجدول الرسمي قبل التقديم.'}</p>
            </div>
          )}

          {reviewTab === 'audit' && (
            <div className="card">
              {audit.length === 0 && <p className="anchor">{lang === 'en' ? 'No audit entries yet.' : 'لا توجد سجلات بعد.'}</p>}
              {audit.map((a) => (
                <div className="audit-item" key={a.id}>
                  <span className="ts mono">{new Date(a.ts).toLocaleTimeString()}</span>
                  <span className="agent">{a.agent}</span>
                  <span>{a.action}</span>
                </div>
              ))}
            </div>
          )}

          <div className="approve-bar">
            <p className="note">{lang === 'en' ? 'Approving marks this package attorney-reviewed. It does not submit anything to a court.' : 'الموافقة تُعلِّم هذا الملف كمُراجَع من المحامي. لا يتم تقديم أي شيء للمحكمة.'}</p>
            <button className="btn btn-primary" onClick={handleApprove} disabled={caseData.review_status === 'approved'}>
              {caseData.review_status === 'approved' ? (lang === 'en' ? 'Approved' : 'تمت الموافقة') : (lang === 'en' ? 'Approve case package' : 'الموافقة على ملف القضية')}
            </button>
          </div>
        </main>
      )}

      <div className={'toast' + (toast ? ' show' : '')}>{toast}</div>
    </>
  );
}
