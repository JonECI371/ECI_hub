// Legal documents. The wording is a placeholder until ECI-Hub supplies text reviewed by a solicitor
// (spec: Open decisions). Versions are listed so older ones can be shown when they exist.
export type LegalDoc = { slug: string; title: string; version: string; effective: string; sections: { heading: string; body?: string; table?: string[][] }[]; previous?: string[] };

const P = '[Legal text supplied by ECI-Hub and reviewed by a solicitor. This placeholder shows where it goes.]';

export const LEGAL: Record<string, LegalDoc> = {
  terms: {
    slug: 'terms', title: 'Terms & Conditions', version: '3.0', effective: '1 October 2026',
    sections: ['About these terms', 'Booking and payment', 'Credit accounts', 'Changing a date', 'Cancellations and refunds', 'Your responsibilities', 'Liability', 'Contact us'].map((h) => ({ heading: h, body: P })),
    previous: ['Version 2.1 (1 March 2026 to 30 September 2026)', 'Version 2.0 (1 January 2026 to 28 February 2026)'],
  },
  privacy: {
    slug: 'privacy', title: 'Privacy notice', version: '2.2', effective: '1 October 2026',
    sections: [
      { heading: 'Who we are', body: 'ECFIO Engineering Ltd, trading as ECI-Hub. Company number 09147227. Summit House, 33 Hanworth Road, Sunbury-on-Thames TW16 5DA.' },
      ...['What we collect', 'Why we use it', 'Who we share it with'].map((h) => ({ heading: h, body: P })),
      { heading: 'Identity documents', body: 'Photo ID and passport photos you upload for registration are deleted automatically one month after we send your registration to the awarding body.' },
      ...['How long we keep it', 'Your rights'].map((h) => ({ heading: h, body: P })),
    ],
  },
  cookies: {
    slug: 'cookies', title: 'Cookie policy', version: '1.3', effective: '1 October 2026',
    sections: [
      { heading: 'What cookies are', body: 'Small files a website stores in your browser so it can remember things between pages, such as that you are logged in.' },
      { heading: 'Cookies we use', table: [['Cookie', 'Purpose', 'Type', 'Lasts'], ['eci_session', 'Keeps you logged in', 'Strictly necessary', '12 hours, or 30 days if you choose'], ['eci_login', 'Remembers which code we sent you', 'Strictly necessary', '15 minutes'], ['eci_mfa', 'Second sign-in step for staff', 'Strictly necessary', '10 minutes'], ['eci_checkout', 'Remembers the booking you are paying for', 'Strictly necessary', '24 hours']] },
      { heading: 'Managing your choice', body: 'We only use strictly necessary cookies today, so there is nothing to switch on or off. If we add analytics, we will ask first.' },
      { heading: 'Changes to this policy', body: P },
    ],
  },
  accessibility: {
    slug: 'accessibility', title: 'Accessibility statement', version: '1.0', effective: '1 October 2026',
    sections: [
      { heading: 'Our commitment', body: 'We want everyone to be able to book and attend our courses. This site aims to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA.' },
      { heading: 'How accessible this site is', body: 'You should be able to use every page with a keyboard, zoom to 400% without losing content, and use a screen reader. Text contrast meets 4.5:1 and buttons are at least 44 pixels high.' },
      { heading: 'Known issues', body: P },
      { heading: 'Contact us', body: 'If something does not work for you, call +44 (0) 1932 963463 or email support@eci-hub.co.uk and we will help you book another way.' },
    ],
  },
};
