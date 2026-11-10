import 'server-only';
import { db } from '@/lib/db';
import { renderEmail, type Block } from '@/lib/email-layout';

/**
 * All platform email goes through here.
 * EMAIL_MODE=ses sends through Amazon SES. Anything else (dev, test server) logs the email
 * instead of sending it, so no real mail leaves a test environment.
 */
export type Email = { to: string; trigger: string; subject: string; text?: string; html?: string; blocks?: Block[]; personId?: string };

/** Older plain-text emails get the branded layout too: paragraphs become text, links become buttons. */
function toBlocks(text: string): Block[] {
  return text.split(/\n{2,}/).flatMap((para): Block[] => {
    const m = /^(.*?):?\s*(https?:\/\/\S+)\s*$/s.exec(para.trim());
    if (m && !m[1].includes('\n')) return [{ type: 'button', label: (m[1] || 'Open').replace(/[.:]+$/, '').slice(0, 60), href: m[2] }];
    return [{ type: 'text', text: para.trim() }];
  });
}

export const emailLive = () => process.env.EMAIL_MODE === 'ses';

export async function sendEmail(input: Email): Promise<void> {
  const rendered = renderEmail(input.subject, input.blocks ?? toBlocks(input.text ?? ''));
  const e = { ...input, text: input.text ?? rendered.text, html: input.html ?? rendered.html };
  const from = process.env.EMAIL_FROM ?? 'bookings@eci-hub.co.uk';
  if (!emailLive()) {
    console.info(`[email:test] to=${e.to} trigger=${e.trigger} subject="${e.subject}"\n${e.text}`);
    await db.emailLog.create({ data: { to: e.to, trigger: e.trigger, status: 'TEST_NOT_SENT', personId: e.personId } });
    return;
  }
  try {
    const { SESv2Client, SendEmailCommand } = await import('@aws-sdk/client-sesv2');
    const ses = new SESv2Client({ region: process.env.AWS_REGION });
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: [e.to] },
        Content: { Simple: { Subject: { Data: e.subject }, Body: { Text: { Data: e.text }, ...(e.html ? { Html: { Data: e.html } } : {}) } } },
      }),
    );
    await db.emailLog.create({ data: { to: e.to, trigger: e.trigger, status: 'SENT', personId: e.personId } });
  } catch (err) {
    // Never fail silently: log it and raise a task for the admin team.
    await db.emailLog.create({ data: { to: e.to, trigger: e.trigger, status: 'FAILED', personId: e.personId } });
    await db.task.create({
      data: {
        type: 'INTEGRATION_FAILURE',
        title: `Email failed: ${e.subject}`,
        detail: `To ${e.to}. ${(err as Error).message}`,
        recordType: 'Person',
        recordId: e.personId ?? e.to,
      },
    });
    throw err;
  }
}
