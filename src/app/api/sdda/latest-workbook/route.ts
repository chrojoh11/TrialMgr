import { NextResponse } from 'next/server';

const SDDA_FORMS_URL = 'https://www.sdda.ca/sdda-forms/';

export async function GET() {
  try {
    const page = await fetch(SDDA_FORMS_URL, { cache: 'no-store', headers: { 'user-agent': 'SDDA-TrialDesk/1.0' } });
    if (!page.ok) throw new Error(`SDDA Forms page returned ${page.status}.`);
    const html = await page.text();
    const candidates = [...html.matchAll(/href=["']([^"']*TrialWorkbook-[^"']+\.xlsx)["']/gi)]
      .map((match) => new URL(match[1], SDDA_FORMS_URL))
      .filter((url) => url.protocol === 'https:' && (url.hostname === 'www.sdda.ca' || url.hostname === 'sdda.ca'));
    const source = candidates.at(-1);
    if (!source) throw new Error('No current Trial Workbook link was found on the SDDA Forms page.');
    const response = await fetch(source, { cache: 'no-store', redirect: 'follow', headers: { 'user-agent': 'SDDA-TrialDesk/1.0' } });
    if (!response.ok) throw new Error(`The official workbook returned ${response.status}.`);
    return new NextResponse(await response.arrayBuffer(), { headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${source.pathname.split('/').pop() || 'SDDA-TrialWorkbook.xlsx'}"`,
      'x-sdda-source': source.href,
    } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to retrieve the official SDDA workbook.' }, { status: 502 });
  }
}
