# Family Budget

A budget app for a family split across two countries. Will is in the United
States and earns dollars. Liz is in South Africa and earns rand. They each have
their own bills, and they share the costs of the South African house.

This app is the record. Everything lives here.

```bash
npm install
npm run dev      # open http://localhost:5173
npm run build    # static site in dist/
npm test         # checks the maths
```

`npm run build:single` makes one self-contained HTML file you can email to
someone or open straight from disk.

## The pages

| Page | What it does |
| --- | --- |
| Overview | What is left each month, and how the rest of the app is doing |
| Money in | Salaries, child support, and the daily gig earnings log |
| Money out | Every bill, filtered by whose it is |
| Shared | The South African house costs, and who owes who |
| Debt | Every loan, what is left, and when it is paid off |
| Checklist | Tick off each bill as you pay it, month by month |
| Settings | Exchange rate, display, and saving your data |

## Amounts marked "guess"

Some amounts have not been confirmed by anyone yet. They show a small **guess**
label wherever they appear, and Settings lists every one with the page it is on.

To fix one: open the page shown, press Edit, type the real amount, press Save.
The label disappears and the item drops off the list.

Liz's 22 personal bills are each a guess, but together they add up to exactly
R34,323.09, which is a real total. So correcting them one at a time only moves
money between groups — the bottom line stays right the whole way through.

## Rules the app follows

**Everything becomes a monthly amount.** A weekly bill is multiplied by 4.33,
not 4, because that is how many weeks are actually in a month. Using 4 loses
about 8% of every weekly bill — roughly one extra month of it a year.

**The exchange rate is typed in by hand.** There is no live feed. Settings shows
when it was last changed and warns after 30 days.

**Who pays and who owes are separate.** A shared bill records whose account it
leaves and what share each person should carry. The gap between the two is what
one owes the other, worked out on the Shared page.

**Numbers that depend on each other are linked, not copied.** The South African
rent split is derived from the full rent and Daddy's share. A loan that paid off
an older loan reads that loan's balance live. Neither can drift out of step.

## Saving and sharing

Data is stored in the browser under `family-budget:data` and is not sent
anywhere. Two people cannot edit the same copy.

To share changes: **Save a copy** in Settings, send the file, and the other
person uses **Open a saved copy**.

If shared editing matters more than having no server, `lib/storage.ts` is the
one file a backend would replace — the rest of the app talks to the store, not
to storage.

## Code layout

```
src/
  types.ts              the data model
  data/seed.ts          the numbers a fresh install starts with
  lib/money.ts          currency and frequency conversion, formatting
  lib/calc.ts           every worked-out figure — totals, who owes who, payoff
  lib/calc.test.ts      28 tests
  lib/palette.ts        which colour belongs to which person or category
  store/BudgetContext   state, saving, upgrading old saves
  components/           buttons, cards, charts, icons
  pages/                one file per page
```

`lib/calc.ts` has no React in it, so the money maths is tested on its own.

## Colour and charts

The chart colours are checked by script, not by eye. Every neighbouring pair is
far enough apart to stay distinct for colourblind readers, in both light and
dark mode. The **order** of the colours is what makes that true, so do not
reorder or swap them without re-running the check.

Will is always colour 1 and Liz is always colour 2, everywhere in the app, so a
filter can never repaint someone.

Every chart has a **Table** button, and all text meets WCAG AA at the size it is
actually drawn. Two rules follow from that and are enforced in code:

- Text may only be tinted `good` or `critical`. Amber measures 1.79:1 on the
  light background — unreadable at any size — so amber state is carried by a
  meter or a label instead. The `TextTone` type makes this a compile error.
- Base styles that set page colour live **outside** `@layer base`. Unlayered CSS
  beats layered CSS, so a host page's own reset would otherwise override them
  and every element that inherits its colour would get the wrong one.
