import type {
  BudgetData,
  Debt,
  DebtPayment,
  Expense,
  IncomeSource,
  LedgerEntry,
  Person,
  Saving,
  Settings,
} from '../types';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

/* Reading and writing the shared budget.
 *
 * Every bill, loan and payment is its own row. The alternative — keeping the
 * whole budget as one lump of text — is less code, but with two people editing
 * it means whoever saves last silently wipes the other's change. For money
 * that is not acceptable, so each change touches only its own row. */

/** The invite code is the household's id. It is a random UUID, so it cannot be
 *  guessed — which is what makes it safe to pass around as the way in. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Tidy up a pasted code, or return null if it could never be one.
 *
 *  Checked here rather than at the database so a typo comes back as plain
 *  English instead of a Postgres error about invalid input syntax for uuid. */
export function cleanInviteCode(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  return UUID.test(trimmed) ? trimmed : null;
}

/** The message shown when a code is well-formed but matches no household.
 *  Postgres reports this as a foreign-key violation, code 23503. */
const NO_SUCH_HOUSEHOLD = 'That code does not match a budget. Check it and try again.';

/** Shown when the device holds a login but the database is not accepting it. */
export const STALE_SESSION =
  'Your sign-in on this device has expired. Sign out and sign in again.';

/** Postgres codes worth telling apart. */
const RLS_VIOLATION = '42501';
const FOREIGN_KEY_VIOLATION = '23503';

export function isRlsFailure(error: unknown): boolean {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  return code === RLS_VIOLATION || /row-level security/i.test(message ?? '');
}

/** Replace a database error with the plain-English one, keeping its code.
 *
 *  The wording is for the reader; the code is for whoever has to work out why,
 *  and dropping it turns two different faults into the same screen. */
function staleSession(cause: unknown): Error {
  const error = new Error(STALE_SESSION);
  const code = (cause as { code?: string } | null)?.code;
  if (code) Object.assign(error, { code });
  return error;
}

/** The signed-in user, but only once the database will actually accept them.
 *
 *  A device can hold a session whose access token has expired and failed to
 *  refresh. `getUser()` still answers from what is stored, so the app looks
 *  signed in, while every query reaches Postgres as the anonymous role. Under
 *  the anonymous role `auth.uid()` is null, so a membership lookup returns no
 *  rows — which reads exactly like "this person has no household yet".
 *
 *  Pass the session in wherever one is already to hand. Asking for it again
 *  costs an auth call, and from inside an auth callback that call is worse than
 *  wasteful — see `ensureHousehold`. */
async function signedInUserId(
  db: ReturnType<typeof supabase>,
  known?: Session | null,
): Promise<string> {
  let session = known ?? null;
  if (!session) {
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    session = data.session;
  }

  if (!session?.access_token || !session.user) throw new Error('Not signed in.');
  // `expires_at` is in seconds.
  if (session.expires_at && session.expires_at * 1000 <= Date.now()) {
    throw new Error(STALE_SESSION);
  }
  return session.user.id;
}

/** Which household the signed-in person belongs to.
 *
 *  With no code, the first sign-in creates a household of their own. With one,
 *  they join the household it names instead — that is how the second person
 *  ends up looking at the same numbers rather than an empty budget.
 *
 *  Never call this from inside `onAuthStateChange`. That callback runs while
 *  the auth lock is held, and a query started there goes out with no access
 *  token — anonymous, whatever the session says. The membership lookup then
 *  matches nothing and the insert is refused by row-level security, on a device
 *  that has just signed in perfectly well. */
export async function ensureHousehold(
  inviteCode?: string,
  session?: Session | null,
): Promise<string> {
  const db = supabase();
  const userId = await signedInUserId(db, session);

  const existing = await db
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  // Already in one. Being handed a code afterwards does not move you; that is
  // what `joinHousehold` is for.
  if (existing.data) return existing.data.household_id as string;

  if (inviteCode) return joinHousehold(inviteCode);

  /* Nothing found. That is either a genuinely new person or a session the
     database is refusing, and the two are indistinguishable from here — both
     return no rows. Creating a household on the wrong guess is the expensive
     mistake: it leaves someone with a second, empty budget and their real one
     apparently gone. So a refused insert is reported as the stale session it
     almost certainly is, rather than passed on as Postgres policy wording. */
  const created = await db.from('households').insert({ name: 'Our budget' }).select('id').single();
  if (created.error) {
    throw isRlsFailure(created.error) ? staleSession(created.error) : created.error;
  }

  const joined = await db
    .from('household_members')
    .insert({ household_id: created.data.id, user_id: userId, role: 'owner' });
  if (joined.error) {
    throw isRlsFailure(joined.error) ? staleSession(joined.error) : joined.error;
  }

  return created.data.id as string;
}

/** Put the signed-in person into the household a code names.
 *
 *  Safe to call when they are already in another one — the row is keyed on
 *  (household_id, user_id), so this adds a membership rather than moving them,
 *  and the household they land in is the one returned. */
export async function joinHousehold(inviteCode: string): Promise<string> {
  const code = cleanInviteCode(inviteCode);
  if (!code) throw new Error('That does not look like a code. Copy the whole thing and try again.');

  const db = supabase();
  const userId = await signedInUserId(db);

  const { error } = await db
    .from('household_members')
    .upsert({ household_id: code, user_id: userId, role: 'member' });

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) throw new Error(NO_SUCH_HOUSEHOLD);
    if (isRlsFailure(error)) throw staleSession(error);
    throw error;
  }
  return code;
}


/* -- reading --------------------------------------------------------------- */

type Row = Record<string, unknown>;

const num = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Pull the whole budget down in one go. Small enough that paging would be
 *  more code than it saves. */
export async function fetchBudget(householdId: string): Promise<Partial<BudgetData>> {
  const db = supabase();
  const table = (name: string) => db.from(name).select('*').eq('household_id', householdId);

  const [people, income, expenses, debts, payments, ledger, savings, checklist, settings] =
    await Promise.all([
      table('people'),
      table('income'),
      table('expenses'),
      table('debts'),
      table('debt_payments'),
      table('ledger'),
      table('savings'),
      table('checklist'),
      table('settings').maybeSingle(),
    ]);

  for (const result of [people, income, expenses, debts, payments, ledger, savings, checklist]) {
    if (result.error) throw result.error;
  }
  if (settings.error) throw settings.error;

  const paymentsByDebt = new Map<string, DebtPayment[]>();
  for (const row of (payments.data ?? []) as Row[]) {
    const list = paymentsByDebt.get(String(row.debt_id)) ?? [];
    list.push({
      id: String(row.id),
      date: String(row.date),
      amount: num(row.amount),
      paid: Boolean(row.paid),
      fromPlan: Boolean(row.from_plan),
      note: (row.note as string) ?? undefined,
    });
    paymentsByDebt.set(String(row.debt_id), list);
  }

  const ticked: Record<string, number> = {};
  for (const row of (checklist.data ?? []) as Row[]) {
    const amount = num(row.amount);
    // Rows written before part payments existed only carried a yes/no.
    if (amount > 0) ticked[String(row.key)] = amount;
    else if (row.paid && amount === 0) ticked[String(row.key)] = 0;
  }

  const settingsRow = settings.data as Row | null;

  return {
    people: ((people.data ?? []) as Row[]).map(
      (row): Person => ({
        id: String(row.id),
        name: String(row.name),
        fullName: String(row.full_name),
        currency: row.currency as Person['currency'],
        country: String(row.country ?? ''),
        slot: num(row.slot, 1),
        initials: String(row.initials ?? ''),
      }),
    ),
    income: ((income.data ?? []) as Row[]).map(
      (row): IncomeSource => ({
        id: String(row.id),
        personId: String(row.person_id),
        label: String(row.label ?? ''),
        amount: num(row.amount),
        currency: row.currency as IncomeSource['currency'],
        frequency: row.frequency as IncomeSource['frequency'],
        kind: row.kind as IncomeSource['kind'],
        active: Boolean(row.active),
        verified: Boolean(row.verified),
        note: (row.note as string) ?? undefined,
      }),
    ),
    expenses: ((expenses.data ?? []) as Row[]).map(
      (row): Expense => ({
        id: String(row.id),
        label: String(row.label ?? ''),
        category: row.category as Expense['category'],
        amount: num(row.amount),
        currency: row.currency as Expense['currency'],
        frequency: row.frequency as Expense['frequency'],
        owner: String(row.owner),
        paidBy: String(row.paid_by),
        split: (row.split as Expense['split']) ?? undefined,
        dueDay: row.due_day === null ? undefined : num(row.due_day, 1),
        account: (row.account as string) ?? undefined,
        active: Boolean(row.active),
        verified: Boolean(row.verified),
        note: (row.note as string) ?? undefined,
      }),
    ),
    debts: ((debts.data ?? []) as Row[]).map(
      (row): Debt => ({
        id: String(row.id),
        label: String(row.label ?? ''),
        personId: String(row.person_id),
        lender: String(row.lender ?? ''),
        currency: row.currency as Debt['currency'],
        principal: num(row.principal),
        payments: (paymentsByDebt.get(String(row.id)) ?? []).sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
        plan: (row.plan as Debt['plan']) ?? undefined,
        verified: Boolean(row.verified),
        note: (row.note as string) ?? undefined,
      }),
    ),
    ledger: ((ledger.data ?? []) as Row[]).map(
      (row): LedgerEntry => ({
        id: String(row.id),
        date: String(row.date),
        personId: String(row.person_id),
        label: String(row.label ?? ''),
        amount: num(row.amount),
        currency: row.currency as LedgerEntry['currency'],
        type: row.type as LedgerEntry['type'],
      }),
    ),
    savings: ((savings.data ?? []) as Row[]).map(
      (row): Saving => ({
        id: String(row.id),
        personId: String(row.person_id),
        label: String(row.label ?? ''),
        amount: num(row.amount),
        currency: row.currency as Saving['currency'],
        note: (row.note as string) ?? undefined,
      }),
    ),
    checklist: ticked,
    settings: settingsRow
      ? ({
          usdZarRate: num(settingsRow.usd_zar_rate, 16.4612),
          rateUpdatedAt: String(settingsRow.rate_updated_at),
          autoRate: Boolean(settingsRow.auto_rate),
          rateSource: settingsRow.rate_source as Settings['rateSource'],
          dataMode: settingsRow.data_mode as Settings['dataMode'],
          saTotalRent: num(settingsRow.sa_total_rent),
          saRentFromDaddy: num(settingsRow.sa_rent_from_daddy),
          saRentExpenseId: String(settingsRow.sa_rent_expense_id),
        } as Settings)
      : undefined,
  };
}

/* -- writing --------------------------------------------------------------- */

const withHousehold = <T extends object>(householdId: string, row: T) => ({
  ...row,
  household_id: householdId,
});

export const rowFor = {
  person: (p: Person) => ({
    id: p.id,
    name: p.name,
    full_name: p.fullName,
    currency: p.currency,
    country: p.country,
    slot: p.slot,
    initials: p.initials,
  }),
  income: (i: IncomeSource) => ({
    id: i.id,
    person_id: i.personId,
    label: i.label,
    amount: i.amount,
    currency: i.currency,
    frequency: i.frequency,
    kind: i.kind,
    active: i.active,
    verified: i.verified,
    note: i.note ?? null,
  }),
  expense: (e: Expense) => ({
    id: e.id,
    label: e.label,
    category: e.category,
    amount: e.amount,
    currency: e.currency,
    frequency: e.frequency,
    owner: e.owner,
    paid_by: e.paidBy,
    split: e.split ?? null,
    due_day: e.dueDay ?? null,
    account: e.account ?? null,
    active: e.active,
    verified: e.verified,
    note: e.note ?? null,
  }),
  debt: (d: Debt) => ({
    id: d.id,
    label: d.label,
    person_id: d.personId,
    lender: d.lender,
    currency: d.currency,
    principal: d.principal,
    verified: d.verified,
    plan: d.plan ?? null,
    note: d.note ?? null,
  }),
  payment: (debtId: string, p: DebtPayment) => ({
    id: p.id,
    debt_id: debtId,
    date: p.date,
    amount: p.amount,
    paid: p.paid,
    from_plan: p.fromPlan ?? false,
    note: p.note ?? null,
  }),
  ledger: (l: LedgerEntry) => ({
    id: l.id,
    date: l.date,
    person_id: l.personId,
    label: l.label,
    amount: l.amount,
    currency: l.currency,
    type: l.type,
  }),
  saving: (s: Saving) => ({
    id: s.id,
    person_id: s.personId,
    label: s.label,
    amount: s.amount,
    currency: s.currency,
    note: s.note ?? null,
  }),
  settings: (s: Settings) => ({
    usd_zar_rate: s.usdZarRate,
    rate_updated_at: s.rateUpdatedAt,
    auto_rate: s.autoRate,
    rate_source: s.rateSource,
    data_mode: s.dataMode,
    sa_total_rent: s.saTotalRent,
    sa_rent_from_daddy: s.saRentFromDaddy,
    sa_rent_expense_id: s.saRentExpenseId,
  }),
};

export async function upsert(householdId: string, table: string, row: object): Promise<void> {
  const { error } = await supabase()
    .from(table)
    .upsert(withHousehold(householdId, row), { onConflict: 'household_id,id' });
  if (error) throw error;
}

export async function remove(householdId: string, table: string, id: string): Promise<void> {
  const { error } = await supabase()
    .from(table)
    .delete()
    .eq('household_id', householdId)
    .eq('id', id);
  if (error) throw error;
}

export async function saveSettings(householdId: string, settings: Settings): Promise<void> {
  const { error } = await supabase()
    .from('settings')
    .upsert({ household_id: householdId, ...rowFor.settings(settings) }, { onConflict: 'household_id' });
  if (error) throw error;
}

export async function setChecklist(
  householdId: string,
  key: string,
  amount: number,
): Promise<void> {
  const db = supabase();
  // Nothing paid means no row, so the table only ever holds real payments.
  const { error } =
    amount > 0
      ? await db
          .from('checklist')
          .upsert({ household_id: householdId, key, amount, paid: true })
      : await db.from('checklist').delete().eq('household_id', householdId).eq('key', key);
  if (error) throw error;
}

/** Replace everything in the household with the budget given. Used to move an
 *  existing budget into the cloud the first time, and by "Start over". */
export async function replaceBudget(householdId: string, data: BudgetData): Promise<void> {
  const db = supabase();

  for (const table of [
    'debt_payments',
    'income',
    'expenses',
    'debts',
    'ledger',
    'savings',
    'checklist',
    'people',
  ]) {
    const { error } = await db.from(table).delete().eq('household_id', householdId);
    if (error) throw error;
  }

  const push = async (table: string, rows: object[]) => {
    if (rows.length === 0) return;
    const { error } = await db
      .from(table)
      .insert(rows.map((row) => withHousehold(householdId, row)));
    if (error) throw error;
  };

  await push('people', data.people.map(rowFor.person));
  await push('income', data.income.map(rowFor.income));
  await push('expenses', data.expenses.map(rowFor.expense));
  await push('debts', data.debts.map(rowFor.debt));
  await push(
    'debt_payments',
    data.debts.flatMap((debt) => debt.payments.map((payment) => rowFor.payment(debt.id, payment))),
  );
  await push('ledger', data.ledger.map(rowFor.ledger));
  await push('savings', data.savings.map(rowFor.saving));
  await push(
    'checklist',
    Object.entries(data.checklist)
      .filter(([, amount]) => amount > 0)
      .map(([key, amount]) => ({ key, amount, paid: true })),
  );

  await saveSettings(householdId, data.settings);
}

/** Call `onChange` whenever the other person edits anything. */
export function watchBudget(householdId: string, onChange: () => void): () => void {
  const db = supabase();
  const channel = db.channel(`budget:${householdId}`);

  for (const table of [
    'people',
    'income',
    'expenses',
    'debts',
    'debt_payments',
    'ledger',
    'savings',
    'checklist',
    'settings',
  ]) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
      onChange,
    );
  }

  channel.subscribe();
  return () => {
    void db.removeChannel(channel);
  };
}
