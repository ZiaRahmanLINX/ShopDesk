# ShopDesk Owner User Guide

Plain-language guide for the shop owner. No technical knowledge needed.
All amounts are in Pakistani Rupees (Rs).

## 1. Getting started

**First run — set up your shop.** The first time you open ShopDesk Owner
you will see the setup screen, in two steps:

1. **Your shop** — shop name, address and phone.
2. **Your owner account** — your name, a username and a password (6+
   characters). This is the only login the app has, and it has full access
   to everything.

There is no demo data and there are no demo or default logins — the owner
account you create during setup is the only way in. Keep its password
safe; there is no password reset inside the app (see section 12).

**Sign in.** Use the username and password you created during setup.

## 2. Daily selling (Point of Sale)

1. Open **Point of Sale**.
2. Type a product name or SKU, or scan a barcode, and press **Enter** to
   add it to the bill. **F2** jumps back to the search box at any time.
3. Change quantities with the + / − buttons. A discount can be entered on
   the whole bill.
4. Press **F9** (or the Complete button) to take payment. The customer can
   pay in more than one way at once — for example Rs 500 cash + Rs 500
   Easypaisa. If they pay by credit (Udhaar), pick the customer first.
5. Enter the cash received and the app shows the change to return.
6. The invoice number is created automatically (for example
   INV-20261110-0001). Print it, or reprint it later from **Invoices**.

**Refunds.** Find the sale in **Sales**, open it and choose Refund. The
stock goes back, the money movement is recorded, and the refund is written
in the audit log. Refunds cannot be hidden or deleted.

**Esc** clears the current bill before it is completed.

## 3. Buying stock (Purchases)

1. Open **Purchases → New Purchase**, pick the supplier and add the items
   with their buying cost and quantities.
2. Choose how it is paid:
   - **Paid in full** (cash, bank, Easypaisa or JazzCash).
   - **Part payment** — pay some now; the rest stays as an amount owed to
     the supplier.
   - **Full credit** — pay nothing now; the whole amount is owed.
3. Choose the **funding source** — where the money came from:
   - *Business cash* — paid from the shop's own money.
   - *Supplier credit* — the supplier is owed the money.
4. Buying stock does **not** reduce your profit. Stock is an asset; profit
   is only reduced when that stock is actually sold.

**Returning goods to a supplier.** Open the purchase and choose Supplier
Return. The stock and the amount owed are both reduced, and the return is
recorded.

## 4. Products and stock (Products / Inventory)

- **Products** is where you add, edit and price items. Each product has a
  name, SKU or barcode, category, buying price, selling price, unit (kg,
  packet, piece…) and a minimum stock level.
- **Inventory** shows the value of your stock (at buying cost), low-stock
  alerts, and the full movement history of every item — every purchase,
  sale, return and adjustment, with dates.
- **Adjust stock** is for damaged, expired or lost items. The quantity and
  value are reduced and the reason is recorded. Never delete stock silently.

## 5. Expenses

Open **Expenses** and record every shop cost with its category (rent,
electricity, water, internet, transport, packaging, repairs, cleaning,
tea, wages, other). Choose the account the money came out of. Expenses
reduce the month's profit — purchases do not.

**Owner drawings are never expenses.** Money you take out for personal
use is recorded on the **Owner** page, not in Expenses.

## 6. Customers, Udhaar and Suppliers

- **Customers** — add customers, see what each one owes, take a payment
  against their credit, and print a statement.
- **Udhaar** — the list of everyone who owes the shop money, oldest first.
  Open a customer to see every credit sale and payment.
- **Suppliers** — what the shop owes each supplier, with payments and
  statements. Paying a supplier reduces what is owed; it is not an expense.

## 7. Cashbook

- **Cashbook** shows your Cash, Bank, Easypaisa, JazzCash and other
  accounts with their current balances.
- **Transfer** moves money between your own accounts (for example, deposit
  cash into the bank). A transfer is never income or an expense.
- **Daily cash count** — count the cash in the drawer at closing and enter
  it. If the counted cash is more or less than the app expects, the
  difference is recorded as an overage or shortage. Never adjust the cash
  balance without a count.

## 8. Owner and monthly closing

### Owner

- **Capital** — money you put into the business. Record it as *initial*
  capital when you start, or *additional* capital any time you top it up.
  It increases business cash.
- **Drawings** — money you take out for personal use. A drawing is
  **never** an expense and never reduces profit; it reduces cash only.
- The **Owner** page shows your totals: capital in, drawings out, and
  the net owner balance.

### Monthly closing (end of every month)

1. Open **Month Close**. The app shows a preview: total sales, cost of
   goods sold, gross profit, expenses and net profit, plus closing
   inventory, customer credit, supplier payables and cash balance.
2. Check the numbers. If they look right, confirm the close. The month is
   then **locked** — no one can quietly change a sale, purchase or expense
   in that month afterwards.
3. The month's net profit stays in the business as retained earnings.
4. If a mistake is found after closing, do **not** edit the old entry.
   Record a correction entry (adjustment or reversal) so the history stays
   honest. The audit log keeps every change.

**Profit & Loss** shows the month's P&L and Balance Sheet any time; the
Balance Sheet always balances because retained earnings are carried
forward.

## 9. Backup & Restore

- The app makes an **automatic backup every day** and keeps the last 30.
- **Backup & Restore → Create backup** makes one now; **Export** copies it
  to a USB stick or another folder.
- **Verify** checks a backup file is not corrupt before you rely on it.
- **Restore** replaces the current database with a backup. The app first
  saves a copy of the current database, so a mistaken restore can be
  undone.

**Your data file** lives in the app's user data folder on the computer.
Updating ShopDesk Owner never touches it, but keep a USB backup anyway.

## 10. Reports

**Reports** has sales, product profit, purchases, expenses, cash flow and
the audit log, all with date filters. Export any of them to PDF, Excel or
CSV from the same page.

## 11. Settings

- **Shop** — shop name, address, phone, thank-you note on invoices.
- **Owner account** — your name and username, and change your password
  (you need the current password).
- **Invoice** — paper size defaults (thermal 58mm / 80mm / A4) and
  branding.
- **Backup** — automatic backup on/off and retention.

## 12. If something goes wrong

- **"Paid amount cannot exceed the total"** — the payment entered on a
  purchase or sale is more than the bill. Check the amounts.
- **"Insufficient stock"** — you are selling more than the recorded stock.
  Check the product quantity in Inventory, or record the missing purchase
  first.
- **"Month is locked"** — the month has been closed. Record a correction
  entry instead of editing the old one.
- **"No active account"** — the payment method chosen has no account set
  up. Add it in **Cashbook**.
- **The app will not open** — restart the computer and try again. If it
  still will not open, take a backup copy of your data file first, then
  reinstall ShopDesk Owner — your data file is separate from the app
  and survives a reinstall.
- **Lost password** — there is no password reset inside the app by design.
  If the owner password is lost, the database must be reset by someone
  technical (all shop data will need to be re-entered).
