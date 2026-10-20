# Update 1: web changes to port to mobile

**Branch:** `rick2` · **Web source:** `apps/web/src/` · **Status:** working on sample data, no API yet

These features were added to the web prototype. The mobile app does not have them yet.

Mobile reads its store, permissions and sample data from `apps/shared/`, and **none of these changes are in `apps/shared/` yet**. Port each feature in two steps:

1. **Shared logic:** copy the data, permission and store changes into `apps/shared/`. These are plain JS and can be copied almost line for line.
2. **Screens:** rebuild the UI in React Native. The web uses DOM and CSS, so only the behaviour carries over, not the code.

Everything runs on in-memory sample data. Each store action has a `// Supabase:` comment showing what the real call should be once the API exists.

---

## Contents

1. [Each role has its own dashboard](#1-each-role-has-its-own-dashboard)
2. [Navbar changes for staff](#2-navbar-changes-for-staff)
3. [Delete and restore species safely (CTIP-28 split)](#3-delete-and-restore-species-safely)
4. [Account settings](#4-account-settings)
5. [Profile dropdown with the notification count](#5-profile-dropdown-with-the-notification-count)
6. [QR tags: view, share, delete](#6-qr-tags-view-share-delete)
7. [QR tags: print at a chosen size](#7-qr-tags-print-at-a-chosen-size)
8. [Smaller fixes](#8-smaller-fixes)
9. [Footer redesign and Account page layout](#9-footer-redesign-and-account-page-layout)
10. [Captioned species photos (CTIP-28 split)](#10-captioned-species-photos)
11. [Checklist for mobile](#11-checklist-for-mobile)

---

## 1. Each role has its own dashboard

**Rule:** each staff role sees only its own dashboard. Visitors have no dashboard.

| Role | What `#/dashboard` shows |
|---|---|
| Visitor | The species catalogue (no dashboard). |
| Botanist | **Only plants they recorded** (`registered_by === me.id`). Views: My records, Returned, Not visited in 6 months, No photos, Endangered, Has a sensor. No "Recorded by" filter. |
| Officer | Every tagged plant. Opens on the **Needs review** view. |
| Admin | Every tagged plant. |

The page header shows the role's name, e.g. "Botanist dashboard".

**Shared changes (`permissions.js`):**

```js
// new permission: the dashboard lists everyone's records (botanists only get their own)
officer: [..., "pending", "allPlants", ...],
admin:   [..., "pending", "allPlants", ...],

export const DASHBOARD_LABEL = { botanist: "Botanist dashboard", officer: "Officer dashboard", admin: "Admin dashboard" };
```

**Filtering** (in `pages/Dashboard.jsx`):

```js
const all = can(role, "allPlants");
const rows = visiblePlants(db, role).filter((p) => all || p.registered_by === me?.id);
```

The "All tagged plants" and "Needs review" views are limited to `roles: ["officer", "admin"]`. "My records" is limited to `["botanist"]`.

**Labels:** in the staff sidebar, the first link says "My plants" for botanists and "Tagged plants" for everyone else.

> ⚠️ **This only controls what the screen shows.** The real restriction has to come from Supabase RLS or the API. Right now all plants are loaded and the screen just hides some of them.

---

## 2. Navbar changes for staff

| | Visitor | Staff |
|---|---|---|
| Top navbar links | Plants · Map · About us · Contact | Plants · Map · **Dashboard** (last, next to the theme button) |
| Footer "Staff sign in" | Shown | Hidden |
| Side menu (web's phone menu) | Home · **Plants** · Map · Contact · Staff sign in | Home · **"Botanist dashboard"** (etc.) · Map · Contact · Account settings |

- Staff never see "Staff sign in" anywhere.
- On the dashboard page, staff see "Dashboard" highlighted; visitors see "Plants" highlighted.

**Mobile:** wherever mobile has a menu or tab bar, apply the same rules. Staff get a dashboard entry named after their role, visitors don't, and "Staff sign in" only shows to visitors.

---

## 3. Delete and restore species safely

User story: *"As a conservation officer, I want to remove a species record safely, so mistakes can be undone and history is kept."*

| Criterion | How it's done |
|---|---|
| Delete asks for confirmation | A confirmation box that also says how many tagged plants use the species. |
| Soft delete (`is_deleted`) | Sets `is_deleted: true`. Nothing is removed. |
| Hidden from lists and the public page | Every list already filters out `is_deleted`. |
| Only Officer and Admin can delete | **Admin now has the `species` permission** and a "Species" link. The store action refuses other roles. |
| Can be undone | A new **Recently deleted** table under the species list, with a **Restore** button on each row. |

**Shared changes:**

```js
// permissions.js
admin: [..., "species", ...]
STAFF_LINKS.admin: add { to: "/species", label: "Species", icon: "leaf" }

// StoreProvider: replaces the old deleteSpecies
const setSpeciesDeleted = (id, is_deleted) => {
  if (!can(role, "species")) return false;               // API must enforce this too
  const sp = db.species.find((s) => s.id === id);
  const row = auditRow("species", id, is_deleted ? "delete" : "restore",
    { scientific_name: sp.scientific_name, is_deleted: !is_deleted }, { is_deleted });
  setDb((d) => ({ ...d, species: d.species.map((s) => (s.id === id ? { ...s, is_deleted } : s)), audit: [row, ...d.audit] }));
  return true;
};
const deleteSpecies = (id) => setSpeciesDeleted(id, true);
const restoreSpecies = (id) => setSpeciesDeleted(id, false);   // add to the context value
```

- **Restore is refused** if an active species already has the same scientific name, compared without case.
- **Where the history is:** Admin → **Audit log**. Look for rows where the Table is `species` and the Action is `delete` or `restore`. Only admins can see the audit log.

---

## 4. Account settings

**Route:** `#/account`, staff only. It uses the existing `pending` permission, which means "is staff".

**Opened from:** the profile dropdown (section 5), the side menu, and the footer.

The page has four cards:

| Card | Fields | Rules |
|---|---|---|
| Profile photo | Upload, change, remove | Images only, **2 MB maximum**. Without a photo, the person's initials show. |
| Profile | Full name, **username**, phone (optional) | Name required, extra spaces removed. Username: `^[a-z0-9._]{3,20}$`, saved in lowercase, and **unique across all staff, ignoring case**. Phone: optional, `^\+?[0-9 -]{7,15}$`. |
| Password | Current, new, confirm | The current password must be correct. The new one must be at least 8 characters, different from the current one, and typed the same twice. |
| Account details (read-only) | Email, role, status, member since | "Managed by an admin". Staff cannot change their own email or role. |

**Sign-in:** the login screen now accepts **an email or a username**. The label is "Email or username".

### Shared changes

**`data.js`:** every profile gets three new fields:

```js
{ id: "u2", full_name: "Siti Aminah", username: "siti.aminah", phone: "", avatar_url: null, ... }
// u1 ahmad.faizal · u2 siti.aminah · u3 jonathan · u4 dayang · u5 cheewei
```

**`StoreProvider`:** new actions, both added to the context value:

```js
const USERNAME = /^[a-z0-9._]{3,20}$/;
const usernameTaken = (name, exceptId) =>
  db.profiles.some((p) => p.id !== exceptId && p.username?.toLowerCase() === name.toLowerCase());

// updateProfile(patch) -> { ok, message?, unchanged? }
//   patch can hold full_name, username, phone, avatar_url. It validates as in the table above,
//   saves only the fields that changed, and writes an audit row
//   (avatar_url is logged as "photo"/null, never the image data).

// changeMyPassword(current, next) -> { ok, message? }
//   Checks that current matches, next is 8+ characters and next !== current.
//   Writes the audit row { password: "changed" }.
```

**`login()`** also matches `p.username`:

```js
const key = email.trim().toLowerCase();
const user = db.profiles.find((p) => p.email.toLowerCase() === key || p.username?.toLowerCase() === key);
```

**`addUser()`** (admin creating an account) gives the new account a starting username. It takes the part of the email before "@", keeps only letters, numbers, dots and underscores, and limits it to 16 characters. If that's shorter than 3 characters, it adds "user". If the name is taken, it adds 2, 3 and so on until it's unique. New accounts also get `phone: ""` and `avatar_url: null`.

The full code is in `apps/web/src/StoreProvider.jsx`. Search for `own account` and `freeUsername`.

### Shared UI pieces (web `components/Bits.jsx`)

- **`Avatar({ user, large })`:** shows the photo if there is one, otherwise the initials. Mobile needs its own version of this, used everywhere a person is shown.
- **`PasswordInput`:** the password box with an eye button, moved here from Login so both screens share it. Mobile already has an eye button from commit `094114f`; reuse that.

### Mobile notes

- **Photo:** use an image picker, check the 2 MB limit, then call `updateProfile({ avatar_url: uri })`. Once Supabase is connected, upload the photo to Storage and save the public link.
- **Expo versions:** read the Expo v57 docs before choosing a package (see `apps/mobile/AGENTS.md`).
- **Layout:** stack the four cards in one column.

### Database change (once the API exists)

- **`profiles` table:** needs new columns `username text unique` (ideally a unique index on `lower(username)`), `phone text` and `avatar_url text`.

---

## 5. Profile dropdown with the notification count

- **No bell icon in the navbar** any more. There is also no separate sign-out icon.
- **Profile button:** for staff, the photo + name + role area is a button. Tapping it opens a dropdown that slides down and fades in (0.18 s). It contains:
  - a header with the photo, the name and `@username · Role`
  - **Account settings** → `#/account`
  - **Notifications** → `#/notifications`, with "N unread" on the right
  - **Sign out**, in red
- **Closing:** the dropdown closes on a tap outside it, on Escape, or when moving to another page.

**The unread count moves when the dropdown opens:**

| Dropdown | Where the unread count shows |
|---|---|
| Closed | An amber badge on the **profile photo** |
| Open | The badge fades off the photo and pops onto the **bell next to Notifications** |
| Closed again | Back on the profile photo |
| 0 unread | No badge anywhere |

- **Screen readers:** the count is part of the button's name, e.g. "Account menu for Siti Aminah, 3 unread notifications".
- **Reduce motion:** the animations are turned off when the device asks for less motion.
- **On phones:** the button shrinks to just the photo.
- **Unread count:** `db.notifications.filter((n) => n.user_id === me.id && !n.is_read).length`.

**Mobile:** put the avatar with its badge in the header. Tapping it opens a small menu (a popover or bottom sheet) with the same three items, and the badge moves from the avatar to the Notifications item while the menu is open. The web bottom bar's "Alerts" button with its own count was left as it is.

---

## 6. QR tags: view, share, delete

**Screen:** QR tags (`#/tags`). Officers and admins can open it.

### View and share

Every row has a **QR** button. It opens a popup with:
- a large QR code on white with the tag ID underneath
- the status, the batch and the tag link (`…#/dashboard/NIAH-0007`)
- these buttons:

| Button | What it does |
|---|---|
| **Share** | Shares the QR as a picture (a 600×680 PNG with the ID underneath). If the device can't share files, it shares the link. If it can't share at all, it copies the link. Cancelling the share sheet shows no error. |
| **Print…** | Opens the print setup (section 7) with just this tag ticked. |
| **Save PNG** | Downloads the same picture. |
| **Copy link** | Copies the tag link. |

**Mobile:** use the native share sheet with the PNG. A QR library for React Native can produce the image, and an Expo sharing package can open the share sheet. Check both against the Expo v57 docs.

### Delete unassigned tags

- **Only tags with status `unused`** get a 🗑 delete button, which asks for confirmation first. Assigned and retired tags can't be deleted.
- **Store:** `deleteTag(qr_id)` refuses if the tag isn't `unused` or the role lacks the `tags` permission. It writes an audit row with table `qr_tags` and action `delete`.
- **Deleted numbers are never reused.** `generateTags` also counts deleted IDs (read from the audit log) when it works out the next number. Without this, a deleted `NIAH-0009` would be created again next batch and clash with a sticker that may already be printed. With Supabase, use a database **sequence** instead.

```js
const deleted = db.audit
  .filter((a) => a.table_name === "qr_tags" && a.action === "delete")
  .map((a) => ({ qr_id: a.record_id }));
const ids = nextTagIds([...db.tags, ...deleted], count);
```

---

## 7. QR tags: print at a chosen size

"Print unused" is now **Print tags**. It used to print a copy of what was on screen. Now it opens a **print setup** popup (`components/TagPrint.jsx`), and the printed tags are drawn at real sizes in millimetres.

| Setting | Options (**default in bold**) |
|---|---|
| Tags | A checklist of every tag that isn't retired. **All unused tags are ticked.** It has Select all, Clear and a batch filter. Assigned tags can be ticked to reprint a damaged one. |
| Size (width of the QR code) | **Medium 40 mm (recommended, listed first)**, Tiny 20, Small 30, Large 60, Signpost 90, Custom 15–150 mm |
| Layout | **One tag per label (label printer), recommended**, or A4 sheet to cut out by hand |
| Copies of each tag | **1** (1–20) |
| Tag ID under the code | **On** |
| Dashed cut lines (A4 sheet only) | **On** |

The popup also shows:
- an actual-size preview of one tag
- the tag's size in mm, e.g. "44 × 51 mm"
- a summary, e.g. "12 tags · 20 per A4 page · 1 page"
- a warning if the tag is too big for A4, which also turns off the Print button
- a tip to print at **100% scale**, not "Fit to page"

**Size maths** (copy this as-is, all in mm):

```js
const PAD = 2;                                            // white border around each tag
const A4 = { w: 210, h: 297, margin: 10, gap: 4 };
const tagBox = (mm, caption) => {
  const font = Math.max(2.4, mm * 0.11);
  return { w: mm + PAD * 2, h: mm + PAD * 2 + (caption ? font * 1.6 : 0), font };
};
const perPage = (box) => {
  const fit = (room, size) => Math.max(0, Math.floor((room + A4.gap) / (size + A4.gap)));
  return fit(A4.w - A4.margin * 2, box.w) * fit(A4.h - A4.margin * 2, box.h);
};
```

**How the web prints:**
- **Separate sheet:** the sheet is rendered outside the app (a portal on `<body>`), and print CSS hides everything else.
- **Page size:** `@page` is set to the tag's own size with no margin for labels, or to A4 with a 10 mm margin for sheets.
- **Labels:** each tag starts a new page.

**Mobile:** build the same layout as HTML using the same mm sizes, then send it to an Expo print package (or export a PDF and share it). Check the Expo v57 docs. Phones can't print to every label printer, so a PDF export is the safe fallback.

The single-tag popup's "Print…" button opens this same setup with just that tag ticked.

**Botanists use it too.** On **Add plant** (`#/add`), the **Print tag…** button under the chosen QR opens this same print setup, listing only that tag. It works for a scanned, picked or newly generated tag. It used to call `window.print()` on a fixed-size copy of the code; that sheet (`.printsheet` / `.print-only`) and its print CSS have been removed. Botanists still can't open the QR tags page; they only get the print popup for the tag they are binding.

**Mobile:** the Add plant screen should open the same print or PDF export (see above) for its one tag.

---

## 8. Smaller fixes

- **Popups are solid.** They sat inside `main`, whose card colour is see-through, so the page behind showed through. The fix is `main .glass.pop { background: var(--solid) }`, which applies to every popup.
- **The print-setup popup is wider:** `Modal` accepts `wide="xl"` (up to 980 px), and the tag list rows are taller (52 px).
- **Action buttons in table rows** have a 6 px gap between them. This applies to every table.
- **Restore label:** the `restore` audit action shows as a green label.
- **New icons** in `components/Icon.jsx`: `chevD` (chevron down) and `settings` (gear).

---

## 9. Footer redesign and Account page layout

**Files:** `components/Chrome.jsx` (`Footer`, `FootCol`, `useMedia`), `site.js`, `App.css`, `pages/Account.jsx`

### Footer

The old footer was one line: copyright, About us, Contact, Staff sign in, and a dark/light text link. It is now a full footer in three parts.

**1. Wave edge.** A thin SVG wave sits along the top. It's filled with the page's frosted background colour, with a leaf-green line along its edge.

**2. Four columns:**

| Column | Content |
|---|---|
| **Brand** (widest) | Logo + "Daun Sense"; the line "Tagging and monitoring the plant life of Niah National Park, one QR tag at a time."; a 📍 "Niah National Park, Miri, Sarawak ↗" link that opens Google Maps (`PARK_MAP`); count pills (see below) |
| **Explore** | Home · Plant catalogue · Plant map |
| **About** | About us · Contact · Sarawak Forestry ↗ (`FORESTRY`, opens in a new tab) |
| **Third column (depends on role)** | **Visitor:** a column titled "Park staff" with Staff sign in. **Staff:** a column named after their tools (e.g. "Officer tools") with their role's dashboard, every staff tool link for that role (the same list as the sidebar), Notifications and Account settings. |

**Count pills** (live counts from the store; the numbers are shown in green):

| Pill | Visitor | Staff |
|---|---|---|
| Plants | "N plants to explore" (public plants only) | "N plants tagged" (every plant they can see) |
| Species | Published species | Every species that isn't deleted |
| Endangered | Endangered plants they can see | Same |
| **Needs your attention** (amber border when above 0, links to the page) | none | **Botanist:** N returned to you → `/records`. **Officer:** N awaiting review → `/review`, N open alerts → `/monitoring`. **Admin:** N open alerts → `/monitoring` |

The plant and species pills link to `/plants`.

```js
const staff = !!DASHBOARD_LABEL[role];
const plants = visiblePlants(db, role);
const species = db.species.filter((s) => !s.is_deleted && (staff || s.is_published)).length;
const endangered = plants.filter((p) => p.endangered).length;
const counts = staffCounts(db, me); // { returned, review, alerts, ... }
```

**3. Bottom bar:**
- **Left:** "© 2026 Daun Sense · A CTIP project", plus "· Signed in as **Name** (Role)" for staff.
- **Right:** a **sun/moon toggle** (two segments, with the active one filled green; it replaces the old text link) and a **Back to top** button that scrolls smoothly to the top.

**Phones (≤ 800 px):**
- **Stacking:** the columns stack.
- **Link columns** become **tap-to-open sections** (`<details>`), closed at first, with a chevron that flips when open. On wide screens they're always open and can't be closed.
- **Spacing:** extra space at the bottom so the bottom bar doesn't cover the footer.

`useMedia(query)` is a small hook that watches `window.matchMedia` and decides whether the columns can fold.

**`site.js`** gets two new constants:

```js
export const PARK_MAP = "https://maps.app.goo.gl/H8QrxBi3oWgya7Tk7";
export const FORESTRY = "https://sarawakforestry.com/";
```

> The mobile app reads `apps/shared/site.js`, so add both constants there too.

**Mobile:** mobile usually has no footer. The useful parts to bring over are:
- **The "needs your attention" counts** (returned / awaiting review / open alerts), as a strip on the home or profile screen.
- **The About links** (About us, Contact, Sarawak Forestry, park location), in a settings or about screen.
- **The sun/moon toggle**, if mobile has a theme switch.

### Account page layout

- **No sidebar:** `pages/Account.jsx` no longer wraps itself in `Shell`, the staff layout with the sidebar.
- **Page width:** Account settings now fill the page width with no sidebar on the left. The route and its access (`account: "pending"`, staff only) are unchanged.
- **Mobile:** nothing to change. Account settings is a normal full screen.

---

## 10. Captioned species photos

User story: *"As a conservation officer, I want to upload several captioned photos for a species, so the knowledge base shows what the plant looks like."*

Before this change, a species page only borrowed photos from its tagged plants. A species had no photos of its own, photos had no captions, and uploads were not checked.

| Criterion | How it's done | Status |
|---|---|---|
| Several photos per species, each with a caption | A species now has its own photos (`species_media`). Officers and admins open the photo editor from the 📷 button on the Species list, or the ✏️ button on the species page gallery. Every photo needs a caption (up to 200 characters), and Save is refused until each one has a caption. | ✅ on sample data |
| File type and size are checked | Only **JPG, PNG or WebP, up to 10 MB each**, the same limits as the `species-media` bucket and `UploadRequest` in the API contract. Files that break the rules are left out and named in a red line in the popup, and the other files are still added. The store action checks the files again. | ✅ in the app (API and Storage still need to check too) |
| Stored in Supabase Storage through the API (CTIP-46) | **Not done yet.** `POST /v1/species/:id/media` is in the route table but still answers **501**, because the CTIP-46 handler hasn't been built. The store action has an `// API (CTIP-46):` comment with the exact calls to use. | ❌ waiting for CTIP-46 |

**How it looks:**
- **Species page:** the gallery shows the species' own photos with the caption under each slide, and the caption is also the image's alt text. A species with no photos of its own still falls back to photos from its tagged plants.
- **Cover photo:** the first photo is the cover photo, used in the catalogue and in the "Related plants" links.
- **Photo editor:** the editor is reused, with two new props: `captions` (adds a caption box under each card, outside the drag area) and `min` (the fewest photos allowed; `0` for species, so every photo can be removed).
- **Plant photos:** the type and size check also applies to plant photos (the `Specimen` editor), because it lives in the shared editor.

### Shared changes

**`utils.js`:**

```js
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PHOTO_MAX_MB = 10;
export const CAPTION_MAX = 200;
export const photoProblem = (file) => /* message, or null if the file is fine */;
```

**`data.js`:** a new `species_media` table, shaped like the real one:

```js
species_media: [
  { id: "m1", species_id: "sp1", url, caption: "Cluster of rounded ground pitchers…", credit: null,
    is_primary: true, sort_order: 0, uploaded_by: "u4", created_at: "…" },
  // m2 (sp1), m3 (sp3)
],
```

**`selectors.js`:** `speciesMedia(db, speciesId)` returns the photos sorted by `sort_order`. `speciesCatalogue` adds `media` to each species, and its `photo` now uses the first species photo before falling back to plant photos.

**`StoreProvider`:** `setSpeciesMedia(speciesId, list) -> { ok, message? }`, added to the context value. It refuses roles without `species`, re-checks new files with `photoProblem`, requires a caption on every photo, then saves `sort_order` and `is_primary` (the first photo is the cover) and writes an audit row with table `species_media`.

### Hooking up the API (when CTIP-46 is done)

For each new photo (it has a `file`), call `POST /v1/species/:id/media` with `{ content_type, size_bytes, caption, is_primary, sort_order }`. Then `PUT` the file to the returned `upload.url`, which stores it at `species-media/{species_id}/{media_id}`. The bucket is public, so visitors can see the photos.

The API needs to check:
- **Role:** officer or admin.
- **File:** the content type and size, with HEIC refused, because the contract allows it but the `species-media` bucket does not.
- **Caption:** present on every photo.

The contract has **no endpoint to edit or delete a species photo** (only list and create). Changing a caption, reordering or removing a photo needs a `PATCH` / `DELETE /species/:id/media/:mediaId`, so add those to CTIP-46 or a new ticket.

### Mobile notes

- **Picking photos:** use an image picker with several photos allowed. Check `mimeType` and `fileSize` with `photoProblem` before adding them, and put a caption `TextInput` under each thumbnail. Check the Expo v57 docs first.
- **Species screen:** show the caption under the photo.

---

## 11. Checklist for mobile

**Shared (`apps/shared/`):**

- [ ] `permissions.js`: `allPlants` (officer and admin), `species` for admin plus a Species link, `DASHBOARD_LABEL`
- [ ] `data.js`: `username`, `phone` and `avatar_url` on every profile
- [ ] `site.js`: `PARK_MAP` and `FORESTRY`
- [ ] `StoreProvider.js`:
  - [ ] login by email or username
  - [ ] `updateProfile` and `changeMyPassword`
  - [ ] default username in `addUser`
  - [ ] `restoreSpecies`, plus role checks on delete and restore
  - [ ] `deleteTag`
  - [ ] `generateTags` skips deleted numbers
  - [ ] `setSpeciesMedia`
- [ ] `data.js`: `species_media` table
- [ ] `utils.js`: `PHOTO_TYPES`, `PHOTO_MAX_MB`, `CAPTION_MAX`, `photoProblem`
- [ ] `selectors.js`: `speciesMedia`, plus `media` and the cover `photo` in `speciesCatalogue`

**Screens:**

- [ ] Dashboard is limited by role (botanists see only their own plants)
- [ ] Menu and tab bar: a dashboard entry named after the role for staff, none for visitors, "Staff sign in" only for visitors
- [ ] Species: delete confirmation, Recently deleted list with Restore, admins can open it
- [ ] Account settings screen: photo, name, username, phone, password, read-only details
- [ ] Header avatar menu: badge moves from the avatar to Notifications while the menu is open, and the bell is removed
- [ ] QR tags: view and share each tag, delete unused tags
- [ ] QR tags: print setup with size, layout and copies (or a PDF export), also opened from Add plant for the chosen tag
- [ ] Species photos: upload several with a caption each, checking type and size; captions shown on the species screen
- [ ] "Needs your attention" counts by role, plus About links (About us, Contact, Sarawak Forestry, park location on Google Maps)

**Before going live, with the API:**

- [ ] RLS or API checks: delete and restore species (officer and admin only), delete tags, read plants (botanists see only their own)
- [ ] Database: `profiles.username` (unique, ignoring case), `phone` and `avatar_url` columns, a QR tag number sequence
- [ ] Profile photos uploaded to Supabase Storage
- [ ] CTIP-46: build `POST /species/:id/media` (and edit or delete endpoints), and connect `setSpeciesMedia` to it
