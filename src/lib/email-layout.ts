import { SITE_URL } from '@/lib/format';

/**
 * Branded email from blocks (docs/design/EmailTemplate.dc.html): heading, text, booking summary,
 * code, button, footer. Produces HTML (table layout and inline styles, so it renders in Outlook)
 * and a plain-text version.
 */
export type Block =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'summary'; rows: [string, string][] }
  | { type: 'code'; label: string; code: string }
  | { type: 'button'; label: string; href: string }
  | { type: 'note'; text: string };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const abs = (href: string) => (href.startsWith('http') ? href : `${SITE_URL}${href}`);
const FONT = "font-family:Mulish,Avenir,'Segoe UI',Arial,sans-serif";

export function renderEmail(preheader: string, blocks: Block[], opts: { marketing?: boolean } = {}): { html: string; text: string } {
  const body = blocks
    .map((b) => {
      switch (b.type) {
        case 'heading':
          return `<h1 style="margin:0 0 12px;${FONT};font-size:24px;line-height:1.25;color:#242424;font-weight:800">${esc(b.text)}</h1>`;
        case 'text':
          return `<p style="margin:0 0 16px;${FONT};font-size:15px;line-height:1.6;color:#424652">${esc(b.text)}</p>`;
        case 'note':
          return `<p style="margin:0 0 16px;padding:12px 14px;background:#FFF1D6;border-radius:6px;${FONT};font-size:14px;line-height:1.5;color:#5C3B00">${esc(b.text)}</p>`;
        case 'summary':
          return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#F3F4F6;border-radius:8px">${b.rows
            .map(([k, v]) => `<tr><td style="padding:10px 16px;${FONT};font-size:13px;color:#424652;width:110px;vertical-align:top">${esc(k)}</td><td style="padding:10px 16px;${FONT};font-size:14px;color:#242424;font-weight:700">${esc(v)}</td></tr>`)
            .join('')}</table>`;
        case 'code':
          return `<p style="margin:0 0 6px;${FONT};font-size:13px;color:#424652">${esc(b.label)}</p><p style="margin:0 0 20px;${FONT};font-size:32px;letter-spacing:8px;font-weight:800;color:#242424">${esc(b.code)}</p>`;
        case 'button':
          return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px"><tr><td style="background:#2EC39B;border-radius:4px"><a href="${esc(abs(b.href))}" style="display:inline-block;padding:14px 26px;${FONT};font-size:15px;font-weight:700;color:#242424;text-decoration:none">${esc(b.label)}</a></td></tr></table>`;
      }
    })
    .join('\n');

  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(preheader)}</title></head>
<body style="margin:0;padding:0;background:#F3F4F6">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="background:#242424;border-radius:8px 8px 0 0;padding:18px 28px"><img src="${SITE_URL}/logo.png" alt="ECI-Hub" width="120" style="display:block;height:auto;border:0"></td></tr>
<tr><td style="background:#ffffff;padding:28px">${body}</td></tr>
<tr><td style="padding:18px 28px;${FONT};font-size:12px;line-height:1.6;color:#424652">ECFIO Engineering Ltd, trading as ECI-Hub · Company number 09147227<br>support@eci-hub.co.uk · +44 (0) 1932 963463<br>${opts.marketing ? 'You are getting this because you opted in to news from ECI-Hub.' : 'You are getting this email because of your booking or account with us.'} <a href="${SITE_URL}/legal/privacy" style="color:#242424">Privacy notice</a></td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    ...blocks.map((b) => {
      switch (b.type) {
        case 'heading': return b.text.toUpperCase();
        case 'text': case 'note': return b.text;
        case 'summary': return b.rows.map(([k, v]) => `${k}: ${v}`).join('\n');
        case 'code': return `${b.label}: ${b.code}`;
        case 'button': return `${b.label}: ${abs(b.href)}`;
      }
    }),
    '--\nECFIO Engineering Ltd, trading as ECI-Hub. support@eci-hub.co.uk · +44 (0) 1932 963463',
  ].join('\n\n');
  return { html, text };
}
