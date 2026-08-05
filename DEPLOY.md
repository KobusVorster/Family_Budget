# Putting the budget online

Two free accounts, about 20 minutes. When you're done you and Liz each have a
login, and you both see the same numbers.

**Before you start:** open the app, go to **Settings → Save a copy**, and keep
that file. It's your only backup, and step 6 uses it.

---

## 1. Make the database — Supabase

1. Go to **supabase.com** and sign up (free).
2. **New project**. Any name. Pick a region — **eu-west-1 (Ireland)** is a fair
   middle between you and Liz. Choose a database password and save it somewhere;
   you won't need it often but you can't see it again.
3. Wait about two minutes for it to finish setting up.

## 2. Create the tables

1. In Supabase, open **SQL Editor** in the left menu.
2. Open `supabase/schema.sql` from this repo, copy the whole file, paste it in.
3. Press **Run**. You should see "Success. No rows returned."

That one file creates every table and locks them down so only members of your
household can read or write anything.

## 3. Get your two keys

In Supabase go to **Settings → API** and copy:

- **Project URL** — looks like `https://abcdefgh.supabase.co`
- **anon public** key — a long string

Both are safe to publish. What protects your data is the rules from step 2,
which the database enforces on every request. The **service_role** key on that
same page is the dangerous one — never put it anywhere near the app.

## 4. Turn off the email confirmation (optional but easier)

By default Supabase emails you a link before your login works, and its free
email sending is slow and sometimes lands in spam. For two people it's simpler
to skip it:

**Authentication → Sign In / Providers → Email → turn off "Confirm email"**.

Leave it on if you'd rather, just expect to check your inbox when signing up.

## 5. Put the site online — Cloudflare Pages

1. Go to **pages.cloudflare.com**, sign up, **Create → Pages → Connect to Git**.
2. Pick this repository.
3. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
4. **Environment variables** — add both, for Production *and* Preview:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon public key
5. **Save and Deploy**.

You'll get an address like `family-budget-abc.pages.dev`. Every push to the
branch rebuilds it automatically.

> The keys are read when the site is **built**, not when it runs. If you add or
> change them later, hit **Retry deployment** or they won't take effect.

## 6. Create the two logins and move your data across

1. Open your new address. You'll see the sign-in screen.
2. Press **Create a login**, use your email, pick a password. You're in — with
   an empty budget.
3. Go to **Settings → Open a saved copy** and pick the file you saved at the
   start. Your budget uploads.
4. Send Liz the address. She presses **Create a login** with her own email.
5. She goes to **Settings → Your login** and sends you her **user ID**.
6. You add her to your household. In Supabase → **SQL Editor**, run this with
   her ID pasted in:

   ```sql
   insert into household_members (household_id, user_id, role)
   select household_id, 'PASTE-HER-USER-ID-HERE', 'member'
   from household_members
   where user_id = auth.uid()
   limit 1;
   ```

   If that gives you trouble, find your `household_id` in the
   **Table Editor → household_members**, and insert her row by hand there.

7. She signs out and back in. She now sees your budget, and you both edit the
   same one.

## 7. On your phones

Open the address in your phone browser and choose **Add to Home Screen**. It
opens full screen like a normal app. Nothing to install.

---

## What it costs

Nothing, at your size. Supabase free gives 500 MB of database — you'll use a
fraction of one. Cloudflare Pages free is unlimited for this.

**One catch:** a free Supabase project goes to sleep after 7 days with nobody
using it, and takes about 30 seconds to wake up. You'll be in weekly so it
probably never happens. If it becomes annoying it's $25/month to stop it.

A web address of your own (like `ourbudget.com`) is about $12/year from any
registrar; add it in Cloudflare Pages under **Custom domains**.

## If something goes wrong

**"Your last change did not save"** — the bar at the top of the app. Usually the
connection dropped, or the Supabase project is asleep. Press **Try again**.

**Signed in, but the budget is empty** — the tables were probably not created.
Re-run step 2.

**Liz signs in and sees her own empty budget** — she hasn't been added to your
household yet. Do step 6.

**Nothing saves, no error** — check the two environment variables in Cloudflare
are spelled exactly right and that you redeployed after adding them.

## Running it on your own machine

```bash
cp .env.example .env     # then paste your two keys in
npm install
npm run dev
```

With no `.env` the app still runs, using this browser's storage and no login.
That's handy for trying things without touching the live data.
