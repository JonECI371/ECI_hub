/** Round profile picture, or initials when there is none. Pictures are served to the right people only by /profile-photo. */
export function Avatar({ person, size = 40 }: { person: { id: string; firstName: string; lastName: string; photoKey?: string | null; photoUpdatedAt?: Date | null }; size?: number }) {
  const initials = `${person.firstName[0] ?? ''}${person.lastName !== '-' ? person.lastName[0] ?? '' : ''}`.toUpperCase();
  const style = { width: size, height: size };
  return person.photoKey ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/profile-photo/${person.id}?v=${person.photoUpdatedAt?.getTime() ?? 0}`} alt={`${person.firstName} ${person.lastName === '-' ? '' : person.lastName}`.trim()} width={size} height={size} style={style} className="shrink-0 rounded-full object-cover" />
  ) : (
    <span aria-hidden style={style} className="inline-flex shrink-0 items-center justify-center rounded-full bg-card2 text-xs font-bold text-ink">{initials}</span>
  );
}
