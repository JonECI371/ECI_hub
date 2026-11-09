'use server';

import { z } from 'zod';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/integrations/email';

export type EnquiryState = { ok?: boolean; error?: string; fields?: Record<string, string>; values?: Record<string, string> };

const PIPELINE: Record<string, string> = { team: 'COMPEX', onsite: 'COMPEX', consult: 'CONSULTANCY', other: 'GENERAL' };
const TOPIC: Record<string, string> = { team: 'Training for my team', onsite: 'Training at our site', consult: 'Consultancy', other: 'Something else' };

export async function sendEnquiry(_prev: EnquiryState, form: FormData): Promise<EnquiryState> {
  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string' && !k.startsWith('$')) values[k] = v.trim().slice(0, 2000);
  // Bots fill the hidden field; people never see it.
  if (values.website) return { ok: true };
  const topic = TOPIC[values.topic] ? values.topic : 'other';
  const fields: Record<string, string> = {};
  if (!values.name) fields.name = 'Enter your name';
  if (!z.string().email().safeParse(values.email).success) fields.email = 'Enter a valid email address';
  if (values.phone && !/^[0-9 +()-]{7,20}$/.test(values.phone)) fields.phone = 'Enter a phone number, like 01932 963463';
  if (topic === 'onsite' && !values.location) fields.location = 'Enter the site town or postcode';
  if (Object.keys(fields).length) return { error: 'Check the highlighted fields.', fields, values };

  // Rate limit: 3 enquiries an hour from one email address.
  const recent = await db.deal.count({ where: { source: 'ENQUIRY', email: values.email.toLowerCase(), createdAt: { gt: new Date(Date.now() - 3600000) } } });
  if (recent >= 3) return { error: 'You have sent several enquiries in the last hour. Please call us on +44 (0) 1932 963463.', values };

  const notes = [
    `Topic: ${TOPIC[topic]}`,
    values.course && `Course: ${values.course}`,
    values.people && `People: ${values.people}`,
    values.location && `Site: ${values.location}`,
    values.dates && `Preferred dates: ${values.dates}`,
    values.service && `Service: ${values.service}`,
    values.message && `Message: ${values.message}`,
    `Marketing opt-in: ${values.marketing === 'on' ? 'yes' : 'no'}`,
  ].filter(Boolean).join('\n');
  const deal = await db.deal.create({
    data: { pipeline: PIPELINE[topic], stage: 'Enquiry', company: values.company || values.name, contact: values.name, email: values.email.toLowerCase(), phone: values.phone || null, notes, source: 'ENQUIRY' },
  });
  await db.auditLog.create({ data: { action: 'ENQUIRY_RECEIVED', recordType: 'Deal', recordId: deal.id, after: { pipeline: deal.pipeline, topic } } });
  await sendEmail({ to: values.email, trigger: 'ENQUIRY_RECEIVED', subject: 'Thanks for getting in touch with ECI-Hub', text: `Hello ${values.name.split(' ')[0]},\n\nThanks for your enquiry about ${TOPIC[topic].toLowerCase()}. We reply within one working day, usually by phone.\n\nECI-Hub\n+44 (0) 1932 963463` });
  await sendEmail({ to: process.env.ENQUIRY_INBOX ?? 'support@eci-hub.co.uk', trigger: 'ENQUIRY_INTERNAL', subject: `New enquiry: ${TOPIC[topic]} from ${values.company || values.name}`, text: `${values.name} <${values.email}> ${values.phone ?? ''}\n\n${notes}` });
  return { ok: true };
}
