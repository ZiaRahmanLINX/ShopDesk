// First-run setup: a clean shop setup with the user's own logins.
// (The old demo-data path was removed in v1.1.2 — every user creates
// their own account. The `demo` flag in meta/setup status is kept only so
// databases set up with demo data before v1.1.2 still report correctly.)
// Existing databases (already set up) are untouched: they already have
// users, so getSetupStatus reports needsSetup: false.
import { getPrisma, getSetting, setSetting, DEFAULT_SETTINGS } from './db';
import { wipeAll, BASE_EXPENSE_CATEGORIES, BASE_PRODUCT_CATEGORIES } from './seed';
import { createUser } from './services/auth';
import { createPartner } from './services/partners';
import { setupSchema } from '../shared/schemas';

export interface SetupStatus {
  needsSetup: boolean;
  demoMode: boolean;
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const db = getPrisma();
  const users = await db.user.count();
  const meta = await getSetting<{ demo?: boolean } | null>('meta', null);
  return { needsSetup: users === 0, demoMode: meta?.demo === true };
}

/** Empty structure every shop needs: cash accounts + category lists.
 *  No products, suppliers, customers or transactions — the user adds those. */
async function createBaseStructure(): Promise<void> {
  const db = getPrisma();
  const accounts: { kind: 'CASH' | 'BANK' | 'EASYPAISA' | 'JAZZCASH'; name: string }[] = [
    { kind: 'CASH', name: 'Shop Cash' },
    { kind: 'BANK', name: 'Bank Account' },
    { kind: 'EASYPAISA', name: 'Easypaisa' },
    { kind: 'JAZZCASH', name: 'JazzCash' },
  ];
  for (const a of accounts) {
    await db.cashAccount.create({ data: { kind: a.kind, name: a.name, openingBalance: 0, currentBalance: 0 } });
  }
  for (const name of BASE_EXPENSE_CATEGORIES) {
    await db.expenseCategory.create({ data: { name } });
  }
  for (const name of BASE_PRODUCT_CATEGORIES) {
    await db.category.create({ data: { name } });
  }
}

/** Clean setup from the wizard: shop, partners, logins. Nothing demo. */
export async function completeSetup(input: unknown): Promise<{ ok: true }> {
  const data = setupSchema.parse(input);
  const meta = await getSetting<{ setupCompleted?: boolean } | null>('meta', null);
  if (meta?.setupCompleted) throw new Error('Shop is already set up');
  const db = getPrisma();
  const users = await db.user.count();
  if (users > 0) {
    // A previous setup attempt stopped midway — wipe the partial data and
    // start over. Only ever runs before any real business activity exists.
    await wipeAll();
  }
  await createBaseStructure();
  await setSetting('shop', {
    ...DEFAULT_SETTINGS,
    shopName: data.shopName,
    shopAddress: data.shopAddress || '',
    shopPhone: data.shopPhone || '',
    reservePct: data.reservePct,
  });
  for (const p of data.partners) {
    await createPartner({ name: p.name, type: p.type, profitSharePct: p.profitSharePct }, null);
  }
  await createUser(
    { name: data.admin.name, username: data.admin.username, password: data.admin.password, role: 'ADMIN' },
    null,
  );
  if (data.partnerUser) {
    await createUser(
      {
        name: data.partnerUser.name,
        username: data.partnerUser.username,
        password: data.partnerUser.password,
        role: 'WORKING_PARTNER',
      },
      null,
    );
  }
  await setSetting('meta', { setupCompleted: true, demo: false });
  return { ok: true };
}
