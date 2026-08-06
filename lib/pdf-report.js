// Generates the HTML string that gets rendered to PDF by Puppeteer.
// Kept separate from the route handler so the template can be reasoned
// about (and eventually tested) independent of the Puppeteer plumbing.

const STRINGS = {
  en: {
    dir: 'ltr',
    bodyFont: "'IBM Plex Sans', sans-serif",
    displayFont: "'Newsreader', serif",
    packageLabel: 'Attorney Review Package — Not Filed',
    generated: 'Generated',
    language: 'Language',
    parties: 'Parties', claimant: 'Claimant', respondent: 'Respondent',
    jurisdiction: 'Jurisdiction',
    claim: 'Claim / Statement of Claim',
    claimType: 'Claim type', claimValue: 'Claim value',
    relief: 'Relief Sought',
    timeline: 'Timeline of Dates',
    noDates: 'No dates were extracted for this case.',
    source: 'Source',
    keyFacts: 'Key Facts',
    citations: 'Citations', verified: 'Verified', unverified: 'Not yet verified', failed: 'Failed verification',
    noCitations: 'No citations recorded for this case.',
    flags: 'Consistency / Advisory Flags',
    noIssues: 'No Tier 1 consistency issues were flagged.',
    tier3: 'Advisory note (attorney judgment, not blocking)',
    approvedNote: 'This case package was reviewed and approved by the attorney of record on',
    footerDisclaimer: 'CaseCraft did not file or submit anything to any court. This document is a review package for the attorney of record.',
    stubWarning: 'Citations and court/fee routing in this report are drawn from placeholder pipeline-testing data, not a verified legal corpus. Confirm independently before relying on this for a filing.',
    caseId: 'Case ID'
  },
  ar: {
    dir: 'rtl',
    bodyFont: "'IBM Plex Sans Arabic', sans-serif",
    displayFont: "'Amiri', serif",
    packageLabel: 'حزمة مراجعة المحامي — لم تُقدَّم للمحكمة',
    generated: 'تاريخ الإنشاء',
    language: 'اللغة',
    parties: 'الأطراف', claimant: 'المدعي', respondent: 'المدعى عليه',
    jurisdiction: 'الاختصاص القضائي',
    claim: 'الدعوى / لائحة الدعوى',
    claimType: 'نوع الدعوى', claimValue: 'قيمة الدعوى',
    relief: 'الطلبات',
    timeline: 'الجدول الزمني للتواريخ',
    noDates: 'لم يتم استخراج أي تواريخ لهذه القضية.',
    source: 'المصدر',
    keyFacts: 'الوقائع الرئيسية',
    citations: 'الاستشهادات', verified: 'موثّق', unverified: 'لم يتم التحقق بعد', failed: 'فشل التحقق',
    noCitations: 'لا توجد استشهادات مسجلة لهذه القضية.',
    flags: 'ملاحظات الاتساق / التنبيهات الاستشارية',
    noIssues: 'لم يتم رصد أي مشكلات اتساق من المستوى الأول.',
    tier3: 'ملاحظة استشارية (تقدير المحامي، غير إلزامية)',
    approvedNote: 'تمت مراجعة ملف القضية هذا والموافقة عليه من قبل المحامي المسؤول بتاريخ',
    footerDisclaimer: 'لم تقم CaseCraft بتقديم أو تسليم أي شيء إلى أي محكمة. هذا المستند حزمة مراجعة للمحامي المسؤول عن القضية.',
    stubWarning: 'الاستشهادات وتوجيه المحكمة/الرسوم في هذا التقرير مأخوذة من بيانات تجريبية لأغراض اختبار المسار، وليست قاعدة قانونية موثّقة. يرجى التأكد منها بشكل مستقل قبل الاعتماد عليها في أي تقديم.',
    caseId: 'رقم القضية'
  }
};

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildReportHtml(caseRow, lang) {
  const t = STRINGS[lang] || STRINGS.en;
  const extracted = caseRow.extracted || {};
  const research = caseRow.research || {};
  const citeVerify = caseRow.citation_verification || {};
  const factCheck = caseRow.fact_consistency || {};
  const routing = caseRow.routing || {};

  const parties = extracted.parties || [];
  const claimant = parties.find(p => /claim/i.test(p.role || '')) || parties[0];
  const respondent = parties.find(p => p !== claimant) || parties[1];

  const dates = extracted.keyDates || [];

  const findings = research.findings || [];
  const verifyResults = citeVerify.results || [];
  const citationRows = findings.map(f => {
    const match = verifyResults.find(r => r.citation === f.citation);
    let statusLabel = t.unverified;
    let statusColor = '#8C8577';
    if (match) {
      statusLabel = match.verified ? t.verified : t.failed;
      statusColor = match.verified ? '#3F6E52' : '#9C4B3B';
    }
    return { citation: f.citation, note: f.relevanceNote, statusLabel, statusColor };
  });

  const tier1Issues = factCheck.tier1Issues || [];

  const generatedDate = new Date().toLocaleString(lang === 'ar' ? 'ar-JO' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const approvedDate = caseRow.approved_at ? new Date(caseRow.approved_at).toLocaleDateString(lang === 'ar' ? 'ar-JO' : 'en-GB', { dateStyle: 'long' }) : null;

  const reliefText = extracted.reliefSought
    || (extracted.claimValueEstimate
      ? (lang === 'ar'
        ? `تعويضات بقيمة ${extracted.claimValueEstimate} ${extracted.claimValueCurrency || ''}`
        : `Damages of ${extracted.claimValueEstimate} ${extracted.claimValueCurrency || ''}`)
      : (lang === 'ar' ? 'لم يُذكر صراحةً في نص القضية.' : 'Not explicitly stated in the case narrative.'));

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${t.dir}">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Newsreader:wght@500;600&family=Amiri:wght@700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Sans+Arabic:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 22mm 18mm 24mm; }
  :root {
    --ink-900:#12203A; --ink-700:#2F4363; --ink-500:#5C6E8A;
    --paper-line:#DCD7C9; --brass:#A9824C;
    --verified:#3F6E52; --verified-bg:#E4EBE4;
    --flag:#B8763E; --flag-bg:#F3E7D8;
    --alert:#9C4B3B; --alert-bg:#F2E1DC;
  }
  * { box-sizing: border-box; }
  body { font-family: ${t.bodyFont}; color: var(--ink-900); font-size: 11.5px; line-height: 1.6; margin: 0; }
  h1, h2, .display { font-family: ${t.displayFont}; font-weight: 600; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 26px 0 10px; border-bottom: 1px solid var(--paper-line); padding-bottom: 6px; }
  .mono { font-family: 'IBM Plex Mono', monospace; }
  .package-label {
    display: inline-block; border: 1.5px solid var(--brass); color: var(--brass);
    font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 0.04em;
    padding: 4px 10px; border-radius: 20px; margin-top: 8px;
  }
  .header-meta { font-size: 10.5px; color: var(--ink-500); margin-top: 10px; }
  .header-meta span { margin-inline-end: 18px; }
  .row { display: flex; gap: 24px; margin-bottom: 6px; }
  .row .col { flex: 1; }
  .k { color: var(--ink-500); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  .v { font-size: 13px; margin-top: 2px; }
  .date-row { border-bottom: 1px solid var(--paper-line); padding: 8px 0; }
  .date-row .d { font-size: 12.5px; font-weight: 500; }
  .date-row .anchor { font-size: 10.5px; color: var(--ink-500); font-style: italic; margin-top: 2px; }
  .cite-row { border-bottom: 1px solid var(--paper-line); padding: 9px 0; display: flex; justify-content: space-between; gap: 12px; }
  .cite-row .note { font-size: 10.5px; color: var(--ink-500); margin-top: 2px; }
  .status-pill { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; border-radius: 20px; padding: 3px 10px; white-space: nowrap; height: fit-content; }
  .issue { background: var(--alert-bg); border: 1px solid var(--alert); border-radius: 6px; padding: 8px 12px; margin-bottom: 8px; font-size: 11px; }
  .tier3-box { background: var(--flag-bg); border: 1px solid var(--flag); border-radius: 6px; padding: 10px 14px; font-size: 11px; margin-top: 10px; }
  .ok-box { background: var(--verified-bg); border: 1px solid var(--verified); border-radius: 6px; padding: 8px 12px; font-size: 11px; }
  .approved-box { background: var(--verified-bg); border: 1px solid var(--verified); border-radius: 6px; padding: 10px 14px; font-size: 11.5px; margin-top: 26px; }
  .stub-note { font-size: 9.5px; color: var(--ink-500); margin-top: 30px; border-top: 1px dashed var(--paper-line); padding-top: 10px; }
  .footer-disclaimer { position: fixed; bottom: -14mm; left: 0; right: 0; font-size: 9px; color: var(--ink-500); text-align: center; border-top: 1px solid var(--paper-line); padding-top: 6px; }
</style>
</head>
<body>

  <h1>${esc(claimant ? claimant.name : '')} ${lang === 'ar' ? 'ضد' : 'v.'} ${esc(respondent ? respondent.name : '')}</h1>
  <div class="package-label">${t.packageLabel}</div>
  <div class="header-meta">
    <span class="mono">${t.caseId}: ${esc(caseRow.id)}</span>
    <span>${t.generated}: ${generatedDate}</span>
    <span>${t.language}: ${lang === 'ar' ? 'العربية' : 'English'}</span>
  </div>

  <h2>${t.parties}</h2>
  <div class="row">
    <div class="col"><div class="k">${t.claimant}</div><div class="v">${esc(claimant ? claimant.name : '—')}</div></div>
    <div class="col"><div class="k">${t.respondent}</div><div class="v">${esc(respondent ? respondent.name : '—')}</div></div>
  </div>

  <h2>${t.jurisdiction}</h2>
  <div class="v mono">${esc(extracted.jurisdictionSignal || '—')}</div>

  <h2>${t.claim}</h2>
  <div class="row">
    <div class="col"><div class="k">${t.claimType}</div><div class="v">${esc(extracted.claimType || '—')}</div></div>
    <div class="col"><div class="k">${t.claimValue}</div><div class="v">${extracted.claimValueEstimate ? esc(extracted.claimValueEstimate) + ' ' + esc(extracted.claimValueCurrency || '') : '—'}</div></div>
  </div>

  <h2>${t.relief}</h2>
  <div class="v">${esc(reliefText)}</div>

  <h2>${t.timeline}</h2>
  ${dates.length === 0 ? `<p class="v">${t.noDates}</p>` : dates.map(d => `
    <div class="date-row">
      <div class="d">${esc(d.date)} — ${esc(d.context)}</div>
      <div class="anchor">${t.source}: &ldquo;${esc(d.sourceAnchor)}&rdquo;</div>
    </div>`).join('')}

  <h2>${t.keyFacts}</h2>
  <div class="v">
    ${lang === 'ar' ? 'الأطراف' : 'Parties'}: ${parties.map(p => esc(p.name)).join(', ') || '—'}<br>
    ${t.claimType}: ${esc(extracted.claimType || '—')}<br>
    ${t.jurisdiction}: ${esc(extracted.jurisdictionSignal || '—')}<br>
    ${routing.status === 'ok' ? `${lang === 'ar' ? 'المحكمة' : 'Court'}: ${esc(routing.court)} (${routing.fee} ${esc(routing.feeCurrency)})<br>` : ''}
  </div>

  <h2>${t.citations}</h2>
  ${citationRows.length === 0 ? `<p class="v">${t.noCitations}</p>` : citationRows.map(c => `
    <div class="cite-row">
      <div><div class="v" style="margin:0">${esc(c.citation)}</div><div class="note">${esc(c.note)}</div></div>
      <div class="status-pill mono" style="border:1px solid ${c.statusColor}; color:${c.statusColor};">${esc(c.statusLabel)}</div>
    </div>`).join('')}

  <h2>${t.flags}</h2>
  ${tier1Issues.length === 0
    ? `<div class="ok-box">${t.noIssues}</div>`
    : tier1Issues.map(iss => `<div class="issue">${esc(iss)}</div>`).join('')}
  ${factCheck.tier3Note ? `<div class="tier3-box"><strong>${t.tier3}:</strong> ${esc(factCheck.tier3Note)}</div>` : ''}

  ${approvedDate ? `<div class="approved-box">${t.approvedNote} ${approvedDate}.</div>` : ''}

  <p class="stub-note">${t.stubWarning}</p>

  <div class="footer-disclaimer">${t.footerDisclaimer}</div>

</body>
</html>`;
}
