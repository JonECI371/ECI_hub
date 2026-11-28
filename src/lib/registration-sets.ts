import type { DeliveryType } from '@prisma/client';
import type { DelegateFields, FieldKey } from '@/lib/delegate-fields';

/** One extra question on the registration form, beyond the "About you" fields every set has. */
export type Question =
  | { key: string; kind: 'text'; label: string; hint?: string; optional?: boolean; scheme?: 'skillguard' | 'compex' | 'eusr' }
  | { key: string; kind: 'textarea'; label: string; hint?: string; optional?: boolean }
  | { key: string; kind: 'file'; label: string; hint: string };

export type QuestionSet = { minutes: number; intro?: string; questions: Question[]; note?: string };

const photo: Question = { key: 'photo', kind: 'file', label: 'Your photo (a selfie)', hint: 'A clear selfie of your face and shoulders, for your virtual card. This is not your passport or ID. JPEG, PNG or PDF, up to 10MB.' };
const photoId: Question = { key: 'photoId', kind: 'file', label: 'Copy of photo ID', hint: 'A clear copy or photo of your passport or driving licence showing your name and photo. JPEG, PNG or PDF, up to 10MB.' };

/**
 * The questions on the registration form, built from the course's delegate field settings (src/lib/delegate-fields.ts).
 * Telephone, date of birth and employer are the "About you" fields and are handled by the form itself.
 */
export function questionSet(df: DelegateFields, delivery: DeliveryType, approvalRequired: boolean, subjectName: string): QuestionSet {
  const m = df.fields;
  const opt = (k: FieldKey) => m[k] === 'OPTIONAL';
  const on = (k: FieldKey) => m[k] !== 'OFF';
  const questions: Question[] = [];
  if (on('jobTitle')) questions.push({ key: 'jobTitle', kind: 'text', label: 'Job title', optional: opt('jobTitle') });
  if (on('address')) questions.push({ key: 'address', kind: 'textarea', label: 'Postal address', hint: 'Where we post your card or certificate.', optional: opt('address') });
  if (on('skillguard')) questions.push({ key: 'skillguard', kind: 'text', label: 'SkillGuard number', hint: opt('skillguard') ? "Add it later from your dashboard if you don't have it yet." : undefined, optional: opt('skillguard'), scheme: 'skillguard' });
  if (on('uln')) questions.push({ key: 'compexId', kind: 'text', label: 'CompEx Unique Learner Number (ULN)', hint: opt('uln') ? 'If you already have one.' : undefined, optional: opt('uln'), scheme: 'compex' });
  if (on('eusrId')) questions.push({ key: 'eusrId', kind: 'text', label: 'EUSR ID', hint: opt('eusrId') ? 'If you already hold one.' : undefined, optional: opt('eusrId'), scheme: 'eusr' });
  if (on('emergency')) questions.push({ key: 'emergencyContact', kind: 'text', label: 'Emergency contact name and number', optional: opt('emergency') });
  if (on('dietary')) questions.push({ key: 'dietary', kind: 'textarea', label: 'Dietary requirements', optional: opt('dietary') });
  if (on('access')) questions.push({ key: 'accessNeeds', kind: 'textarea', label: 'Accessibility or support needs', hint: 'For example captions or extra breaks.', optional: opt('access') });
  if (on('photo')) questions.push(photo);
  if (on('photoId')) questions.push(photoId);
  const files = on('photo') || on('photoId');
  return {
    minutes: files || delivery === 'IN_PERSON' ? 3 : 2,
    intro: files ? 'Have your photo and photo ID ready.' : undefined,
    questions,
    note: on('photoId')
      ? `${subjectName} needs these to register you. We delete your photo ID one month after we send your registration.`
      : approvalRequired && delivery === 'IN_PERSON'
        ? 'This course checks registrations before the first day, so we may contact you. The venue address follows once your registration is approved.'
        : undefined,
  };
}

export const FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
