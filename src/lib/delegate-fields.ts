/**
 * Which delegate details each course asks for. Agreed with Jon on 27 Nov 2026 (docs/delegate-fields.md).
 * Stored on Course.delegateFields; when that is null the template for the course's subject and delivery applies.
 * First name, last name and email are always required and are not listed here.
 * No server-only import: the Admin course form uses this too.
 */
export type FieldMode = 'REQUIRED' | 'OPTIONAL' | 'OFF';
export const MODES: FieldMode[] = ['REQUIRED', 'OPTIONAL', 'OFF'];

export const FIELD_KEYS = ['phone', 'dob', 'employer', 'jobTitle', 'address', 'skillguard', 'uln', 'eusrId', 'photo', 'photoId', 'emergency', 'dietary', 'access'] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export const FIELD_INFO: Record<FieldKey, { label: string; group: string; hint?: string }> = {
  phone: { label: 'Telephone', group: 'About the delegate' },
  dob: { label: 'Date of birth', group: 'About the delegate', hint: 'For awarding bodies and SkillGuard matching' },
  employer: { label: 'Employer', group: 'About the delegate' },
  jobTitle: { label: 'Job title', group: 'About the delegate' },
  address: { label: 'Postal address', group: 'About the delegate', hint: 'Only if a physical card or certificate is posted' },
  skillguard: { label: 'SkillGuard number', group: 'Scheme numbers' },
  uln: { label: 'CompEx Unique Learner Number (ULN)', group: 'Scheme numbers' },
  eusrId: { label: 'EUSR ID', group: 'Scheme numbers' },
  photo: { label: 'Photo (selfie)', group: 'Documents', hint: 'Uploaded by the delegate on the registration form' },
  photoId: { label: 'Copy of photo ID', group: 'Documents', hint: 'Deleted after 30 days' },
  emergency: { label: 'Emergency contact', group: 'On the day' },
  dietary: { label: 'Dietary requirements', group: 'On the day' },
  access: { label: 'Accessibility or support needs', group: 'On the day' },
};

export type DelegateFields = { fields: Record<FieldKey, FieldMode>; certificate: FieldKey[] };

const all = (over: Partial<Record<FieldKey, FieldMode>>): Record<FieldKey, FieldMode> =>
  Object.fromEntries(FIELD_KEYS.map((k) => [k, over[k] ?? 'OFF'])) as Record<FieldKey, FieldMode>;

export const TEMPLATES: { id: string; label: string; df: DelegateFields }[] = [
  { id: 'thames', label: 'Thames Water style', df: { fields: all({ phone: 'OPTIONAL', dob: 'REQUIRED', employer: 'OPTIONAL', skillguard: 'OPTIONAL' }), certificate: ['skillguard'] } },
  { id: 'compex-in-person', label: 'CompEx in person', df: { fields: all({ phone: 'REQUIRED', dob: 'REQUIRED', employer: 'REQUIRED', uln: 'REQUIRED', dietary: 'OPTIONAL', access: 'OPTIONAL' }), certificate: [] } },
  { id: 'compex-elearning', label: 'CompEx eLearning', df: { fields: all({ phone: 'REQUIRED', dob: 'REQUIRED', employer: 'OPTIONAL', uln: 'OPTIONAL' }), certificate: [] } },
  { id: 'eusr', label: 'EUSR eLearning', df: { fields: all({ phone: 'REQUIRED', dob: 'REQUIRED', employer: 'OPTIONAL', uln: 'OPTIONAL', eusrId: 'OPTIONAL', photo: 'REQUIRED', photoId: 'REQUIRED' }), certificate: [] } },
  { id: 'awareness', label: 'Awareness course', df: { fields: all({ phone: 'OPTIONAL', employer: 'OPTIONAL' }), certificate: [] } },
];

/** The template that applies when a course has no settings of its own. */
export function templateIdFor(registrationSet: string | null | undefined, delivery: string): string {
  if (registrationSet === 'thames-water') return 'thames';
  if (registrationSet === 'compex') return delivery === 'ELEARNING' ? 'compex-elearning' : 'compex-in-person';
  if (registrationSet === 'eusr') return 'eusr';
  return 'awareness';
}
export const templateById = (id: string): DelegateFields => (TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[TEMPLATES.length - 1]).df;

/** Reads stored settings, ignoring anything unknown. Null when nothing valid is stored. */
export function parseDelegateFields(raw: unknown): DelegateFields | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { fields?: Record<string, unknown>; certificate?: unknown };
  if (!r.fields || typeof r.fields !== 'object') return null;
  const fields = all({});
  for (const k of FIELD_KEYS) { const v = r.fields[k]; if (MODES.includes(v as FieldMode)) fields[k] = v as FieldMode; }
  const certificate = (Array.isArray(r.certificate) ? r.certificate : []).filter((k): k is FieldKey => (FIELD_KEYS as readonly string[]).includes(k as string) && fields[k as FieldKey] !== 'OFF');
  return { fields, certificate };
}

export function effectiveFields(course: { delegateFields: unknown; deliveryType: string; subject: { registrationSet: string } }): DelegateFields {
  return parseDelegateFields(course.delegateFields) ?? templateById(templateIdFor(course.subject.registrationSet, course.deliveryType));
}

/** Photo and photo ID are uploaded files, so those courses keep the registration form (the booker cannot upload for others). */
export const asksForFiles = (df: DelegateFields) => df.fields.photo !== 'OFF' || df.fields.photoId !== 'OFF';

type PersonLike = { mobile: string | null; dateOfBirth: Date | null; employer: string | null; jobTitle: string | null; address: string | null; schemeIds: unknown };
const SCHEME_KEY: Partial<Record<FieldKey, string>> = { skillguard: 'skillguard', uln: 'compex', eusrId: 'eusr' };
const ANSWER_KEY: Partial<Record<FieldKey, string>> = { emergency: 'emergencyContact', dietary: 'dietary', access: 'accessNeeds' };

/** The value held for a field, from the person's record or the registration answers; empty when none. */
export function heldValue(key: FieldKey, person: PersonLike, answers: Record<string, unknown> | null | undefined): string {
  const scheme = (person.schemeIds ?? {}) as Record<string, unknown>;
  switch (key) {
    case 'phone': return (person.mobile ?? '').trim();
    case 'dob': return person.dateOfBirth ? 'yes' : '';
    case 'employer': return (person.employer ?? '').trim();
    case 'jobTitle': return (person.jobTitle ?? '').trim();
    case 'address': return (person.address ?? '').trim();
    case 'photo': case 'photoId': return '';
    default: {
      const s = SCHEME_KEY[key];
      if (s) return String(scheme[s] ?? '').trim();
      return String((answers ?? {})[ANSWER_KEY[key] ?? key] ?? '').trim();
    }
  }
}
export { SCHEME_KEY, ANSWER_KEY };

/** Fields the course needs on record before a certificate is issued, and are still missing. Files cannot be checked here. */
export function certificateMissing(df: DelegateFields, person: PersonLike, answers: Record<string, unknown> | null | undefined): FieldKey[] {
  return df.certificate.filter((k) => k !== 'photo' && k !== 'photoId' && !heldValue(k, person, answers));
}
export const labelList = (keys: FieldKey[]) => keys.map((k) => FIELD_INFO[k].label).join(' and ');
