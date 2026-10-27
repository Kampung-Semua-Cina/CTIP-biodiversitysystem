# DESIGN.md — Daun design language (v1)

One design language for both apps: the **Botanist Field App** (`apps/mobile`) and the
**Digital Plant Knowledge System** website (`apps/web`). Same fonts, same colours, same
components, each in a light and a dark theme.

This file explains **how and when** to use the design language. The **values** (hex
colours, sizes, spacing, timings) live in one place only:

> **`apps/shared/tokens.js` is the source of truth.** Change a value there and both apps
> follow. Never copy a hex value, font size or duration into a page or component.

The full visual reference (foundations, colour, components in both themes, and every
screen of both apps) is the team Design canvas, on its "Shared design system" page.

*Last checked against `main` (`3d53ca9`) on 27 Oct 2026. Section 15 lists what the
unmerged `rick3` branch would change here.*

---

## 1. Principles

1. **Field guide first.** Fraunces names things: headings, plant names, numbers.
   Scientific names are always Fraunces italic.
2. **Calm canopy.** Greens carry the brand, and one leaf accent marks the main action.
   Any other colour means a status, and always the same status.
3. **Readable in the forest.** 16px body text, nothing under 12px, 48px touch targets on
   phones (44px on the web), and every text and background pair at 4.5:1 contrast or better.
4. **Two themes, one set of names.** Light and dark share token names. Both apps follow
   the device setting by default, with a manual switch.

---

## 2. Where things live

| What | Shared | Web | Mobile |
|---|---|---|---|
| Values (colour, type, space, radius, motion) | `apps/shared/tokens.js` | turned into CSS variables by `src/theme.js` | read through `useTheme()` in `components/Theme.js` |
| Status colours and plain-language names | `STATUS_TONE`, `STATUS_TEXT` in `tokens.js` | `Chip` in `components/Bits.jsx` | `Chip`, `DotLabel` in `components/Bits.js` |
| Styles | – | `src/App.css` (uses only the CSS variables) | inline styles from `useTheme()` |
| UI kit | – | `components/Bits.jsx` (`Chip`, `Pills`, `Modal`, `Empty`, `Sparkline`, `Sci`, `Mono`, `Avatar`, `PasswordInput`), `PlantCard.jsx`, `Chrome.jsx` (header, footer, `ThemeSwitch`), `Shell.jsx` (staff sidebar) | `components/Bits.js`, `Chrome.js` |
| Photos, maps, tags | – | `PhotoEditor.jsx`, `PhotoGallery.jsx`, `MiniMap.jsx`, `TagPrint.jsx` (printable tag sheets), `Img.jsx` | `PhotoEditor.js`, `PhotoGallery.js` |
| Icons | – | `components/Icon.jsx` (Lucide paths) | `components/Icon.js` (`lucide-react-native`) |
| Fonts | – | one Google Fonts link in `index.html` | `@expo-google-fonts/*` loaded in `App.js`, bundled so they work offline |

Files in `apps/shared` are plain `.js` with **no JSX**: Vite does not compile JSX in
`.js` files.

---

## 3. Colour

### Roles

Every colour has a role name. Use the name, never the hex. The same names exist in both
themes (`palettes.light` and `palettes.dark`).

| Token | Use it for |
|---|---|
| `bg` | page background (the "ground") |
| `surface` | cards, sheets, popovers, popups |
| `raised` | table headers, hover and selected rows, label column of detail tables |
| `sunken` | inputs and search fields |
| `chrome` | header, footer, sidebar, bottom bar |
| `line` | borders and dividers |
| `ink` / `ink2` / `ink3` | main text / secondary text, labels, scientific names / placeholders, hints, timestamps |
| `accent`, `onAccent`, `accentPress` | the one main action, links, selected tab or pill; text on it; its pressed or hover state |
| `success`, `info`, `warning`, `danger`, `neutral` | statuses only (see below) |
| `onWarning`, `onDanger` | text on warning or danger fills |
| `mapTile`, `mapLine` | map ground; rivers and trails |
| `camera` | behind the camera preview (the same in both themes) |

Every tone also has a **`Soft`** fill and a **`Line`** border (for example `dangerSoft`
and `dangerLine`). Use them for chips, notices and selected rows. `colors(theme)` in
`tokens.js` makes them.

### One meaning per colour

A tone always means the same thing, on every screen and in both apps:

| Tone | Means | Examples |
|---|---|---|
| `success` | done, safe, published | Published, Least concern, Resolved, Online |
| `info` | waiting on someone else | Needs review, Assigned |
| `warning` | needs your attention | Returned, Acknowledged, Vulnerable, Near threatened |
| `danger` | at risk, rejected, destructive | Endangered, Rejected, Open alert, Faulty, Retired tag |
| `neutral` | not started or switched off | Draft, Waiting to sync, Unused tag, Offline, Unknown |

The mapping is `STATUS_TONE` in `tokens.js`. To add a status, add it there, not in a page.
Never show a status by colour alone: chips always carry a text label as well.

### Depth

- **Dark theme:** no shadows. Surfaces step up in lightness (`bg` → `surface` → `raised`),
  each with a 1px `line` border.
- **Light theme:** white surfaces on the paper-green ground, with one soft shadow.
- **No frosted glass or blur on content.** Surfaces are solid. (The web's `.glass` class
  name is kept for cards, but it is a solid card now.)

### Exceptions

- **Plant family colours** on maps come from `FAMILY_PALETTE`. They are categories, not
  statuses, so they sit outside the tones.
- **QR codes are always black on white** in both themes, so phone cameras can read them.
  The same goes for printed tag sheets.

---

## 4. Type

Three typefaces, each with one job:

| Font | Weights | Job |
|---|---|---|
| **Fraunces** (display) | 500, 600, 700, 500 italic | headings, plant names, stat numbers, the logo; **scientific names in 500 italic** |
| **Nunito** (text) | 400, 600, 700, 800 | everything you read or tap: body, labels, buttons, tables, chips |
| **JetBrains Mono** (data) | 500 | tag IDs, coordinates, sensor readings, audit entries: anywhere 0 and O must not be confused |

The type scale (`typeScale` in `tokens.js`) uses the same numbers in CSS (px) and React
Native (dp). Pick by role, not by size:

| Style | Use |
|---|---|
| `display` | home page hero (the web may grow it larger on wide screens) |
| `title1` | page title |
| `title2` | section heading |
| `title3` | card title, plant name in a list |
| `sci` | scientific name under a plant name |
| `bodyLg` | intro paragraphs |
| `body` | default text |
| `label` | buttons, field labels, menu items |
| `small` | supporting text, "recorded by …" lines |
| `caption` | chips, table headers, timestamps |
| `overline` | small caps headings such as "OFFICER TOOLS" or a plant's family |
| `mono` | tag IDs and readings |

Rules:

- **Scientific names:** always `<Sci>` (web and mobile), never plain `<i>`.
- **Tag IDs and coordinates:** always `<Mono>`, or the `.tagpill` tag shape when it stands
  alone (for example `NIAH-0004 · v1`).
- **Nothing smaller than 12px.**
- Capitals only for `overline`. Everything else is sentence case.

---

## 5. Space, shape and touch

| Token | Use |
|---|---|
| `space` 1–7 | 1 icon to text · 2 chip gaps, label to field · 3 list row gaps · 4 card padding (mobile), screen edge · 5 card padding (web), section gap · 6 between sections · 7 page bands (web) |
| `radius.tag` | tag ID shape |
| `radius.control` | buttons, inputs, thumbnails |
| `radius.card` | cards |
| `radius.sheet` | bottom sheets, popups, the home hero photo |
| `radius.pill` | chips, filter pills, avatars |
| `touch.phone` / `touch.web` | smallest tap target: 48 on phones, 44 on the web |

Use the five radii only. Chips and filters are pills on both platforms.

**Web page width:** the content column grows to `layout.pageMax` with a fluid side
gutter (`--gutter`). Paragraphs keep their own reading width (`.lede`, `.prose`), so text
never runs the full width of a large screen.

---

## 6. Icons

- **Lucide** line icons on both platforms. They sit on a 24px grid with a 1.75 stroke and
  round caps, at size 20 or 24, coloured by the text around them.
- **No emoji anywhere in the interface.**
- To add an icon, add the same Lucide icon to **both** `apps/web/src/components/Icon.jsx`
  and `apps/mobile/components/Icon.js` under the same name.
- Icon-only buttons need an `aria-label` (web) or `accessibilityLabel` (mobile).

---

## 7. Components

Each part is built once per platform from the same tokens.

| Part | Web | Mobile | Rules |
|---|---|---|---|
| Button | `.btn`, `.btn.ghost`, `.btn.danger`, `.btn.small-btn` | `Button kind="primary\|secondary\|quiet\|text\|danger\|dangerText"` | **One primary button per screen.** Main buttons carry an icon. Danger only for destructive actions. Disabled buttons look faded and stay in place. |
| Icon button | `.ic` (`.ic.boxed` for a border) | `IconButton` | always labelled for screen readers |
| Status chip | `Chip value="synced"` | `Chip`, `DotLabel` | dot plus plain-language text from `STATUS_TEXT` |
| Filter pills | `Pills` | `Pills` | one row per filter. The picked pill is filled with the accent. Show counts where they help. |
| Segmented | `.seg`, `ThemeSwitch` | `Segmented` | two or three choices that change the view |
| Field | `<label>` + input (`.search` for search) | `Field`, `Area`, `SearchField` | label above the field, hint in `ink3`, a 2px accent border on focus, error text under the field |
| Detail table | any `<dl>` | `KV` | label column on `raised`, value column on `surface` |
| Notice | `.callout` | `Notice` | soft tone fill and border; for returned records and warnings |
| Card | `.glass` (+ `.pad`) | `Screen` sections | solid surface. Clickable cards lift slightly on hover (web). |
| Plant card | `PlantCard` | `Row` + `Thumb` | photo, family (overline), name, scientific name, conservation status |
| Stat | `.tile` | `Stat` | Fraunces number with a short label |
| Empty state | `Empty` | `Empty` | icon plus one sentence saying what to do next |
| Popup | `Modal` | `Sheet` | the web closes on X, Escape or a click outside |
| Chart | `Sparkline` | `Spark` | accent line, with a dashed `danger` line for an alert limit |
| Map | `MiniMap`, map page | `MiniMap` | `mapTile` ground; family colours for dots; never shows an endangered plant's exact location to visitors. Plot points from `GET /distribution`, which already reduces endangered coordinates; never read specimen coordinates straight from the database. Full maps use Leaflet + OpenStreetMap (see section 15) |
| Loading | – | `SkeletonRow`, `LoadingMore`, `Spinner` | long mobile lists load page by page with a "Loading more" row |

---

## 8. Navigation

### Phone: five-slot bottom bar

The field app (and the website at phone width) uses a bottom bar with the role's main
job as a **raised centre button**. "More" opens everything else, plus the theme switch
and sign in or out.

Field app (`TABS` in `apps/mobile/App.js`):

| Role | 1 | 2 | Centre | 4 | 5 |
|---|---|---|---|---|---|
| Visitor | Home | Plants | **Scan** | Map | More |
| Botanist | Plants | My records | **Add plant** | Alerts | More |
| Officer | Plants | Monitor | **Review** | Alerts | More |
| Admin | Plants | Users | **Monitor** | Alerts | More |

Add plant starts with scanning a tag, so the botanist's centre button opens the scanner
straight into a new record. The website's phone bar comes from `bottomLinks()` in
`apps/shared/permissions.js`.

### Desktop web

- **Header:** logo; then Plants, Map, About us, Contact for visitors. Signed-in staff see
  Plants, Map and their own **Dashboard** (About us and Contact move to the footer). The
  right side holds the theme switch and either "Staff sign in" or the account menu.
- **Active link:** tinted with `accentSoft`, not a new colour.
- **Staff sidebar** (`Shell`): a "Library" group (Tagged plants, or "My plants" for botanists; Species catalogue), then
  the role's tools (`staffLinks()`) with count badges for work waiting.
- **Footer:** site links, and for staff their tools and waiting counts.

---

## 9. Themes

- Three choices on both platforms: **Light, Dark, Device**. Device is the default and
  follows the phone or computer setting, live.
- **Web:** the choice is remembered in the browser. Switching theme crossfades the whole
  page once. Native controls (selects, scrollbars) follow the theme through `color-scheme`.
- **Mobile:** the switch is under More, Appearance.
- Every screen must work in both themes. Check both before opening a PR.

---

## 10. Motion

Short and calm: things fade and settle into place. **Nothing bounces.**

| Token (`motion` in `tokens.js`) | Use |
|---|---|
| `fast` | hover, press, colour changes |
| `base` | popovers, menus, chips, theme change |
| `slow` | page and panel entrances (the longest anything takes) |
| `ease` | things settling into place (entrances) |
| `easeInOut` | colour and size changes |

What moves on the web: pages rise in section by section, cards in grids come in one after
another, clickable cards lift on hover, buttons press in, popups and menus fade in, the
selected review record and plant tabs fade when they change, report bars grow, and the
theme crossfades.

Rules:

- **Respect "reduce motion".** On the web, all motion sits inside
  `@media (prefers-reduced-motion: no-preference)`. On mobile, check
  `AccessibilityInfo.isReduceMotionEnabled()` before adding any animation.
- Entrance animations use fill-mode `backwards`, so a finished animation never blocks a
  hover effect or traps a popup inside a moving parent.
- Never animate to show information. The page must make sense with motion turned off.

---

## 11. Words

- **Plain language.** Show `STATUS_TEXT` names ("Needs review", "Published",
  "Waiting to sync"), never database values ("synced", "approved", "queued").
- **Sentence case** for everything except overlines.
- **Buttons say what happens:** "Approve & publish", "Return for changes", "Send for
  review", not "OK" or "Submit".
- **Required notes say why:** for example "Note to the botanist (needed to return or reject)".
- **Dates:** `5 Oct 2026`, and `5 Oct, 10:55 am` with a time. Use the formatters
  (`fmtDate` / `fmtDateTime` in `apps/shared/utils.js` on the web,
  `apps/mobile/components/format.js` on mobile), not ad-hoc formatting. Known gap: the
  web formatters use the browser's locale, which writes September as "Sept"; mobile uses
  fixed month names.
- **Endangered plants:** say "Location hidden to protect this plant." Never show their
  exact coordinates to visitors.

---

## 12. Accessibility checklist

- Text pairs at 4.5:1 contrast or better: the tokens already pass, so don't invent new pairs.
- Touch targets: 48 on phones, 44 on the web.
- Visible keyboard focus on the web (2px accent outline).
- Labels on every icon-only button and every field.
- Status is never colour alone.
- Motion off under "reduce motion".

---

## 13. Before you open a PR

- [ ] No hex values, font sizes or durations typed into a page; everything comes from tokens.
- [ ] Checked in **light and dark**, and on the web at **desktop and phone width**.
- [ ] Scientific names in `Sci`, tag IDs and coordinates in `Mono`.
- [ ] One primary button on the screen; destructive actions use danger.
- [ ] Statuses use `Chip` / `DotLabel` with `STATUS_TEXT` wording.
- [ ] New icons added to both icon files.
- [ ] Nothing moves when "reduce motion" is on.

## 14. Changing the design language

1. Change the value in `apps/shared/tokens.js`, not in an app.
2. Check both apps in both themes, since a token change reaches every screen.
3. Update the Design canvas and this file if a rule changed.
4. Say so in the PR description, because it affects everyone's pages.

## 15. Pending: what `rick3` changes

The `rick3` branch (Patrick, not merged as of 27 Oct 2026) reorganises some of the
files named above. The design rules don't change, but when it merges, update
sections 2, 7 and 8 to match:

- **Mobile UI kit:** `components/Bits.js` is split into `components/bits/`
  (`buttons.js`, `inputs.js`, `layout.js`, `lists.js`, `loading.js`, `status.js`,
  `text.js`, `charts.js`, `styles.js`). `Bits.js` stays and re-exports them, so
  imports from `components/Bits.js` keep working. A `Toast.js` is added.
- **Mobile navigation:** the bottom bar and `TABS` move out of `App.js` into
  `navigation/` (`TabBar.js`, `tabs.js`, `routes.js`, `AppNavigator.js`).
- **Maps:** a Leaflet + OpenStreetMap map (`LeafletMap.jsx` on the web,
  `LeafletMap.js` on mobile, with shared settings in `apps/shared/mapConfig.js`
  and `mapHtml.js`). Map colours must still come from the tokens (`mapTile`,
  `mapLine`, `FAMILY_PALETTE`), and both themes need checking.
- **Web:** the page frame moves into `components/Site.jsx` and `RouteView.jsx`,
  and a new logo (`public/logo.svg`).

`rick3` also has security problems to fix before it merges (CTIP-102, see
CLAUDE.md), so treat this list as a preview, not as merged design.
