# Family Budget

A dashboard for a household split across two countries and two currencies: Willem
in the United States earning dollars, Lizanne in South Africa earning rand, each
with their own income and bills, plus a block of South African household costs
they carry together.

It replaces a five-tab Excel workbook. Everything runs in the browser — no
server, no account, no data leaving the machine.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
npm test         # the money maths
```

The build output is a plain static site with relative asset paths, so `dist/`
can be dropped on GitHub Pages, Netlify, or any static host without
configuration.

## What each page does

**Overview** leads with one number: what the household has left at the end of a
month, once every commitment on both sides is counted. Below it, each person's
position, how much of their income is already spoken for, where the money goes
by category, the gig-income trend, and every debt's progress.

**Income** holds the recurring lines — salaries, child support — and the daily
gig log. The log is one row per day per source, replacing a sheet where every
day was its own column, and it rolls up into the totals live.

**Expenses** lists every committed cost, filtered by whose it is. Weekly,
fortnightly and monthly bills are all normalised to a monthly figure so they can
actually be compared, and each line shows both the reporting currency and the
currency it was entered in.

**Shared** is the South African household block: what it costs, who carries
each part, who actually pays it, and the single transfer that would square the
month up. The rent split lives here — set the total and Daddy's contribution and
Will's portion follows.

**Debt** tracks each loan against its repayment schedule: what is left, what
percentage is cleared, when the plan finishes, and what is due next. Ticking a
payment off updates everything above it.

**Monthly check** is the month-end grid: tick each bill as it clears, for any
month, with a running total of what is still to pay.

**Settings** holds the exchange rate, display preferences, the review queue, and
backup import/export.

## The numbers it shipped with

The app starts loaded rather than blank, because an empty dashboard tells you
nothing about whether the design works. Two kinds of figure are in there and the
app distinguishes them everywhere.

**From the workbook.** These are exact:

| Figure | Value | Source |
| --- | --- | --- |
| Liz's salary | R25,000 / month | `SA!B3` |
| Katy-Anne child support | R6,954 / month | `SA!B4` |
| Liz's total monthly expenses | R34,323.09 | derived from `SA!C7` |
| Liz's monthly shortfall | R2,369.09 | `SA!C7` |
| Total South African rent | R14,373 | `SA!E2` |
| Daddy support | R1,500 / week | `Will Debt and Expenses!C12` |
| Oom Fanus loan | R13,070 borrowed | `Liz Debt And Expenses!B2` |
| First work loan | R37,500 borrowed | `Liz Debt And Expenses!B17` |
| Current work loan | R230,000 over 33 months | `Liz Debt And Expenses!B32` |
| UR shares payback | R130,208 outstanding | `UR shares pay back!A2` |
| USD/ZAR rate | 16.4612 | the frozen fallback both sheets carried |

**Placeholders.** The workbook summary named a lot of lines without carrying
their amounts through — Liz's 22 individual expense rows, Will's US bills, the
domestic-help and internet figures, Daddy's share of the rent. Those are filled
with plausible values, marked `est.` in the interface, counted in the sidebar
badge, and listed on the Settings page. Editing one clears its flag.

Liz's 22 lines are individually guessed but chosen to sum to **exactly
R34,323.09** — the total her sheet does pin down. Correcting them moves money
between categories without changing the household bottom line, so the dashboard
stays honest while the detail is being filled in.

A banner says all of this until the first edit.

## What the workbook got wrong, and what changed

Rebuilding surfaced six real defects. Each is fixed rather than carried over:

**The income link was dead.** Will's bottom line pulled his DoorDash and Lyft
totals from the daily sheet, but `L2:L4` and `M2` had gone to `#REF!` — the
"remaining amount" the whole sheet built towards was unusable. The daily log now
feeds the totals directly.

**Both exchange-rate cells were fake.** `SA!G2` and `Will Debt and
Expenses!I2` each called `GOOGLEFINANCE`, a Google Sheets function Excel does
not have, wrapped in `IFERROR`. Both had silently returned the hardcoded
fallback 16.4612 for as long as the file had been in Excel — and being two
independent cells, they could drift apart. There is now one rate, entered by
hand, shown with the date it was set, with a warning once it goes stale.

**A hardcoded number where a reference belonged.** `Liz Debt And
Expenses!B34` computed the current work loan's balance as `B32-15000` instead of
`B32-B33`. The values happened to agree, but paying the first loan down would
have left the second one wrong. Consolidation is now a live link between the two
debts, and there is a test for it.

**A sign error on Liz's shortfall.** Row 13 of Will's sheet *added* `SA!C7` to
his costs. That cell is negative, so adding it subtracted roughly R2,369 a month
from what Will was budgeting to send — the error ran the wrong way, understating
his obligation. Covering the shortfall is counted as a cost here.

**Weekly bills were under-counted by 8%.** Column H multiplied weekly amounts
by 4. A month averages 4.33 weeks, so every weekly line was short — about a
month of that spend a year. Normalisation now uses 52/12.

**Structures that no longer earned their place.** `Table_1` claimed 29 generic
columns out to row 1001 for a 14-column, 17-row dataset; `SA` rows 41-49 were an
empty forward tracker; the `Will Income` expense rows were unused labels. None
were carried across. The seven-column TRUE/FALSE month-end grid became the
Monthly check page, which works for any month rather than January to July.

## How it is built

Vite, React and TypeScript, with Tailwind v4 for styling. No charting library —
the charts are a few hundred lines of SVG and HTML, which is smaller than a
dependency and gives exact control over the mark specifications below.

```
src/
  types.ts              the domain model
  data/seed.ts          the workbook, transcribed
  lib/money.ts          currency and frequency conversion, formatting
  lib/calc.ts           every derived figure — totals, settlement, debt payoff
  lib/calc.test.ts      28 tests, including the workbook reconciliations
  lib/palette.ts        entity-to-colour assignment
  store/BudgetContext   state, persistence, migration
  components/           ui primitives, charts, icons
  pages/                one file per view
```

`lib/calc.ts` holds all the arithmetic and has no React in it, so the money
maths is testable on its own. The tests pin the seed to the workbook: if
Liz's expense lines stop summing to R34,323.09, or the consolidated loan stops
tracking the loan it cleared, the suite fails.

### Colour and charts

The series palette is validated rather than chosen by eye. Every adjacent pair
clears the colourblind-separation and normal-vision floors in both light and
dark mode, and the slot *ordering* is what makes that true — re-ordering the
hues breaks it. Slots 1 and 2 belong to Will and Liz across the whole app and
are never reassigned, so a filter can never repaint a person's colour.

Three light-mode slots sit below 3:1 contrast against the light surface. The
rule for those is that no value may depend on the fill alone, so every chart
carries visible labels *and* a table view, reachable from the toggle in its
header. Dark mode is a separately chosen set of steps against the dark surface,
not an inverted copy.

Bars cap at 24px with a 4px rounded data-end; lines are 2px; stacked segments
are separated by a 2px gap in the surface colour rather than a border; grids are
solid hairlines. Where the data is a single ratio it gets a meter, and where it
is a single number it gets a stat tile, rather than being forced into a chart.

### Storage and sharing

Everything lives in this browser's `localStorage` under `family-budget:data`,
and nothing is transmitted anywhere. Saves are debounced, and a corrupt or
outdated blob is migrated or replaced rather than left to break the app.

That means **two people on two continents cannot both edit the same data.** To
stay in sync, whoever makes changes exports a backup from Settings and sends the
file; the other imports it. If shared editing matters more than
zero-infrastructure, the place to add a backend is `lib/storage.ts` — the rest
of the app talks to the store, not to storage.
