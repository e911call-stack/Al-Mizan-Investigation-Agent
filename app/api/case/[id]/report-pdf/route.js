import { getSupabase, logAudit } from '../../../../../lib/supabase';
import { buildReportHtml } from '../../../../../lib/pdf-report';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

// Puppeteer + chromium cold start plus rendering can take longer than
// Vercel's default. This requires Vercel Pro (or Fluid Compute) to take
// effect for real — on Hobby, functions are hard-capped at 10s and this
// route may time out. See README.
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const caseId = params.id;
  const { searchParams } = new URL(request.url);
  const lang = searchParams.get('lang') === 'ar' ? 'ar' : 'en';

  let supabase;
  try { supabase = getSupabase(); } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }

  // NOTE: no auth system exists yet (see README known limitations) — this
  // fetches by id only. Once auth is added, this is where a real
  // ownership/firm check belongs, before the case row is ever read.
  const { data: caseRow, error } = await supabase.from('cases').select('*').eq('id', caseId).single();
  if (error || !caseRow) {
    return Response.json({ error: 'Case not found.' }, { status: 404 });
  }

  const html = buildReportHtml(caseRow, lang);

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '22mm', bottom: '24mm', left: '18mm', right: '18mm' }
    });

    await browser.close();

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `CaseCraft-Report-${caseId}-${dateStr}.pdf`;

    await logAudit(supabase, caseId, 'Report', `PDF case report generated (${lang}).`);

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (e) {
    if (browser) { try { await browser.close(); } catch (_) {} }
    return Response.json({ error: 'PDF generation failed: ' + e.message }, { status: 500 });
  }
}
