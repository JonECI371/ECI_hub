import type { DeliveryType } from '@prisma/client';

/** One extra question on the registration form, beyond the "About you" fields every set has. */
export type Question =
  | { key: string; kind: 'text'; label: string; hint?: string; optional?: boolean; scheme?: 'skillguard' | 'compex' | 'eusr' }
  | { key: string; kind: 'textarea'; label: string; hint?: string; optional?: boolean }
  | { key: string; kind: 'file'; label: string; hint: string };

export type QuestionSet = { minutes: number; intro?: string; questions: Question[]; note?: string };

const access: Question = { key: 'accessNeeds', kind: 'textarea', label: 'Accessibility or support needs', hint: 'For example captions or extra breaks.', optional: true };
const dietary: Question = { key: 'dietary', kind: 'textarea', label: 'Dietary requirements', optional: true };
const emergency: Question = { key: 'emergencyContact', kind: 'text', label: 'Emergency contact name and number' };
const photo: Question = { key: 'photo', kind: 'file', label: 'Passport-style photo', hint: 'Face on a plain background. JPEG, PNG or PDF, up to 10MB.' };
const photoId: Question = { key: 'photoId', kind: 'file', label: 'Photo ID', hint: 'Passport or driving licence. JPEG, PNG or PDF, up to 10MB.' };

/** Question set by the subject's registrationSet, falling back to sensible defaults for the delivery type. */
export function questionSet(set: string, delivery: DeliveryType, approvalRequired: boolean, subjectName: string): QuestionSet {
  if (set === 'thames-water') {
    return { minutes: 2, questions: [{ key: 'skillguard', kind: 'text', label: 'SkillGuard number', hint: "Add it later from your dashboard if you don't have it yet.", optional: true, scheme: 'skillguard' }, access] };
  }
  if (set === 'compex') {
    const q: Question[] = [{ key: 'compexId', kind: 'text', label: 'CompEx ID', hint: 'If you already hold one.', optional: true, scheme: 'compex' }];
    if (delivery === 'ELEARNING') return { minutes: 3, intro: 'Have your photo and photo ID ready.', questions: [...q, photo, photoId], note: `${subjectName} needs these to register you. We delete your photo ID one month after we send your registration.` };
    return {
      minutes: 3,
      questions: [...q, emergency, dietary, access],
      note: approvalRequired ? 'This course checks registrations before the first day, so we may contact you. The venue address follows once your registration is approved.' : undefined,
    };
  }
  if (set === 'eusr') {
    return {
      minutes: 3,
      intro: 'Have your photo and photo ID ready.',
      questions: [{ key: 'eusrId', kind: 'text', label: 'EUSR ID', hint: 'If you already hold one.', optional: true, scheme: 'eusr' }, photo, photoId],
      note: 'EUSR needs these to register you. We delete your photo ID one month after we send your registration.',
    };
  }
  if (delivery === 'IN_PERSON') return { minutes: 3, questions: [emergency, dietary, access] };
  return { minutes: 2, questions: [access] };
}

export const FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
