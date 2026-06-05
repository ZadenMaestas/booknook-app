# BookNook Styles

Source: https://booknook.zaden.dev/styles.css

---

## Fonts

```
Newsreader       — serif, italic accents, headings (weights 300–800, optical size 6–72)
Space Grotesk    — sans-serif, body/UI (weights 300–700)
JetBrains Mono   — monospace, labels/prices/meta (weights 400, 500)
```

Google Fonts import:
```
https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300..800;1,6..72,300..800&family=Space+Grotesk:wght@300..700&family=JetBrains+Mono:wght@400;500&display=swap
```

---

## Color Palette

| Token    | Value     | Usage                        |
|----------|-----------|------------------------------|
| `--ink`  | `#1a1d29` | Dark base, text, backgrounds |
| `--cream`| `#f5efe4` | Light base, text-on-dark     |
| `--amber`| `#c47a3b` | Primary accent, CTAs, icons  |
| `--rust` | `#8b3a2f` | Amber hover state            |
| `--sage` | `#5d6b4a` | Defined but not visibly used |

---

## Semantic Tokens

### Light mode (default)

| Token                    | Value                          |
|--------------------------|--------------------------------|
| `--bg`                   | `#f5efe4` (cream)              |
| `--bg-alt`               | `rgba(196,122,59, 0.07)`       |
| `--bg-inverse`           | `#1a1d29` (ink)                |
| `--text`                 | `#1a1d29` (ink)                |
| `--text-muted`           | `rgba(26,29,41, 0.65)`         |
| `--text-on-inverse`      | `#f5efe4` (cream)              |
| `--text-on-inverse-muted`| `rgba(245,239,228, 0.72)`      |
| `--footer-bg`            | `#1a1d29` (ink)                |
| `--footer-text`          | `#f5efe4` (cream)              |

### Dark mode (`[data-theme="dark"]`)

| Token                    | Value                          |
|--------------------------|--------------------------------|
| `--bg`                   | `#1a1d29` (ink)                |
| `--bg-alt`               | `rgba(196,122,59, 0.06)`       |
| `--bg-inverse`           | `#252837`                      |
| `--text`                 | `#f5efe4` (cream)              |
| `--text-muted`           | `rgba(245,239,228, 0.6)`       |
| `--text-on-inverse`      | `#f5efe4` (cream)              |
| `--text-on-inverse-muted`| `rgba(245,239,228, 0.68)`      |
| `--footer-bg`            | `#0f1119`                      |
| `--footer-text`          | `rgba(245,239,228, 0.85)`      |

Theme transition: `background-color 250ms ease, color 250ms ease`

---

## Typography

### h1
- Font: Newsreader, serif, weight 700
- Size: 56px (40px mobile)
- Line-height: 1.1
- Letter-spacing: -0.02em
- Margin-bottom: 24px
- Accent (`.text`): amber, italic

### h2
- Font: Space Grotesk, sans-serif, weight 400
- Size: 32px (26px mobile)
- Color: `--text-muted`
- Margin-bottom: 32px

### `.section__title`
- Font: Newsreader, serif, weight 700
- Size: 36px
- Margin-bottom: 40px

### `.purple` (italic accent class)
- Color: `--amber`
- Font: Newsreader, serif, italic

### Body / default
- Font: Space Grotesk, sans-serif
- `p` line-height: 1.5

---

## Spacing & Layout

- Max content width: `1200px` (`.row`)
- Narrow content width: `720px` (`.header__container`)
- Container padding: `56px 0`
- Nav height: `80px`
- Page horizontal padding: `24px`

---

## Buttons

### `.btn` (primary CTA)
- Background: `--amber` (#c47a3b)
- Color: `--cream`
- Padding: `12px 24px`
- Font: Space Grotesk, weight 600, 20px (18px mobile)
- Letter-spacing: 0.01em
- Border-radius: `4px`
- Border: none
- Hover: background `--rust` (#8b3a2f)
- Active: `translateY(1px)`

### `.nav__link--primary`
- Color: `--amber`
- Border: `2px solid --amber`
- Border-radius: `4px`
- Hover: background `--amber`, color `--cream`

### `.btn__theme` (theme toggle)
- Size: `36x36px`
- Border: `1.5px solid rgba(196,122,59, 0.45)`
- Border-radius: `4px`
- Color: `--amber`
- Hover: background `--amber`, color `--cream`
- Transition: `200ms ease`

---

## Nav

- Height: `80px`
- Background: `--bg`
- `.nav__link`: Space Grotesk, weight 600, 20px, letter-spacing -0.01em
- Links centered absolutely: `left: 50%; transform: translateX(-50%)`
- Logo: 36px tall, max-width 140px

---

## Mobile Menu (full-screen overlay)

- Background: `--ink`
- Border-top: `3px solid --amber`
- `z-index: 100`
- Transition: `opacity 280ms ease, visibility 280ms ease`
- `.menu__link`: Newsreader, weight 300, 52px, letter-spacing -0.03em
- `.menu__link-index`: JetBrains Mono, 11px, amber, opacity 0.65, letter-spacing 0.06em
- Hover: color amber, `padding-left: 10px` (200ms ease slide)
- Dividers: `1px solid rgba(245,239,228, 0.08)`

---

## Sections

### Header / Hero
- Height: `calc(100vh - 80px)`
- `.header__eyebrow`: JetBrains Mono, 12px, uppercase, letter-spacing 0.08em, amber, opacity 0.8

### Highlights (`#highlights`)
- Background: `--bg-inverse`
- Three-column flex wrap (100% on mobile)
- `.highlight__img`: 100x100px, border `2px solid rgba(196,122,59, 0.35)`, border-radius 4px, amber, font-size 32px

### Features (`#features`)
- Background: `--bg-alt`
- Four-column book grid (50% on ≤768px)
- Book image hover: `scale(1.03)`, transition 300ms ease
- `.book__price`: JetBrains Mono, 14px, weight 500
- Strikethrough price: `--text-muted`, `text-decoration: line-through`

### Footer
- Background: `--footer-bg`
- `.footer__copyright`: JetBrains Mono, 13px, opacity 0.45
- `.footer__link` hover: amber

---

## Border Radii

All interactive elements use `border-radius: 4px`.

---

## Breakpoints

| Breakpoint | Changes                                              |
|------------|------------------------------------------------------|
| ≤ 768px    | h1 → 40px, h2 → 26px, books → 2-col, btn → 18px   |
| ≤ 550px    | Nav links hidden, hamburger shown, highlights → 1-col|

---

## Dev Banner

- Background: `--amber`
- Color: `--cream`
- Font: Space Grotesk, 14px, weight 500
- Label badge: JetBrains Mono, 11px, uppercase, letter-spacing 0.08em, background `rgba(26,29,41, 0.2)`, border-radius 3px
