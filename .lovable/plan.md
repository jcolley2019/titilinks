

## Plan: Add Light/Dark Mode Toggle with Light Default

### Current State
- The app is hardcoded to dark mode via `className="... dark"` on root containers in `DashboardLayout.tsx`, `Login.tsx`, and likely the landing page.
- CSS variables for both `:root` (light) and `.dark` (dark) themes already exist in `index.css`.
- The `next-themes` package is already installed but unused.

### Approach
Use `next-themes` ThemeProvider to manage the theme globally, defaulting to light mode.

### Changes

**1. `src/App.tsx`** — Wrap the app with `ThemeProvider` from `next-themes`, set `defaultTheme="light"` and `attribute="class"`.

**2. `src/components/DashboardLayout.tsx`** — Remove the hardcoded `dark` class from the root div (`className="min-h-screen bg-background dark"` → `className="min-h-screen bg-background"`).

**3. `src/pages/Login.tsx`** — Remove hardcoded `dark` class from both root divs.

**4. `src/pages/Settings.tsx`** — Add a new "Appearance" card with a Sun/Moon toggle using `useTheme()` from `next-themes`. Place it between Language and Notifications cards.

**5. Landing page (`src/pages/Index.tsx` or Navbar)** — Check for and remove any hardcoded `dark` classes so the landing page also respects the theme.

### Settings UI for the toggle

```text
┌─────────────────────────────────────┐
│ ☀ Appearance                        │
│ Choose between light and dark mode  │
│                                     │
│ Light mode          [☀]───[🌙]     │
│ Toggle between...                   │
└─────────────────────────────────────┘
```

The switch will use `setTheme('dark')` / `setTheme('light')` from `next-themes`, with the preference persisted to localStorage automatically.

