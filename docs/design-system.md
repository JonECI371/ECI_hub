# Design system v2

Visual reference: `docs/design/DesignSystem.dc.html`. Tokens live in `tailwind.config.ts`; components in `src/components/ui.tsx`.

## Colour

| Token | Hex | Use |
| --- | --- | --- |
| ink | #242424 | Headings, dark bands, text on cyan |
| slate | #424652 | Body text (9:1 on white) |
| cyan | #2EC39B | Buttons, focus rings, highlights. Never as text on white. |
| page | #F3F4F6 | Page background behind cards |
| white | #FFFFFF | Cards, forms, tables |
| hairline | #E3E5E8 | Dividers only. Not for field borders. |
| field | #8A8D96 | Input and secondary button borders (3:1 on white) |

Status: success `cyan-soft` on ink, warning `#FFF1D6` / `#5C3B00`, error `#FDE4DC` / `#8A2400`, neutral `#E6E8EE`. Always text plus colour, never colour alone.

## Delivery types

| Type | Icon | Chip |
| --- | --- | --- |
| eLearning | laptop | `#E6E8EE`, ink text |
| Virtual classroom | video camera | `#D3F2E9`, ink text |
| In person | map pin | ink, white text |

Use `<DeliveryChip type=... />` everywhere: cards, calendar, dashboards, admin.

## Type (Mulish)

Display 40/800 · H1 30/800 · H2 22/800 · H3 17/700 · Body 15/400 · Small 13/400 · Label 12/800 uppercase, 0.1em tracking.

## Space, radius, elevation

- 8 px grid: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: 4 chips, 6 buttons and fields, 8 cards.
- Cards float on the page colour with `shadow-card`; hover lifts to `shadow-lift`. Borders are for fields only.

## Rules

- Dark hero bands (with the zone-hatch motif, `.hero-motif`) only on marketing and confirmation pages. Forms get a light header so the form is the focus.
- Cyan is for actions and focus. Text on cyan is always ink.
- Every interactive element shows a 3 px cyan focus ring.
- Touch targets at least 44 px. Every screen works at 390 px wide.
