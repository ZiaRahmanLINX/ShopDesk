-- DropTable (children first: Partner must go last, its rows are referenced
-- by PartnerCapital / PartnerLoan / PartnerWithdrawal / ProfitDistribution.
-- runMigrations runs the whole file inside one transaction, where
-- PRAGMA foreign_keys is a no-op, so drop order -- not the pragma -- is
-- what keeps this safe on a populated v1.1.2 database.)
PRAGMA foreign_keys=off;
DROP TABLE "BusinessReserve";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ProfitDistribution";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PartnerCapital";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PartnerLoan";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PartnerWithdrawal";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Partner";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "OwnerCapital" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "cashAccountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OwnerDrawing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amount" INTEGER NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "cashAccountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AlterTable: MonthlyClosing loses the partnership / reserve columns.
-- Plain ALTER TABLE ... DROP COLUMN (SQLite 3.35+) instead of Prisma's
-- table-recreate: the recreate would DROP TABLE "Purchase"/"User" while
-- PurchaseItem / PurchaseLot / AuditLog rows reference them, which fails
-- under foreign-key enforcement on a populated database.
ALTER TABLE "MonthlyClosing" DROP COLUMN "reservePct";
ALTER TABLE "MonthlyClosing" DROP COLUMN "reserveAmount";
ALTER TABLE "MonthlyClosing" DROP COLUMN "distributable";
ALTER TABLE "MonthlyClosing" DROP COLUMN "partner1Share";
ALTER TABLE "MonthlyClosing" DROP COLUMN "partner2Share";

-- AlterTable: Purchase loses its partner funding columns.
ALTER TABLE "Purchase" DROP COLUMN "partnerId";
ALTER TABLE "Purchase" DROP COLUMN "loanId";

-- Data cleanup: a v1.1.2 purchase funded by partner capital/loan keeps that
-- string in fundingSource after the partner columns are gone; re-point it
-- at business cash (the only remaining non-credit source).
UPDATE "Purchase" SET "fundingSource" = 'BUSINESS_CASH' WHERE "fundingSource" NOT IN ('BUSINESS_CASH', 'SUPPLIER_CREDIT');

-- AlterTable: User loses the role column (single owner, no roles).
ALTER TABLE "User" DROP COLUMN "role";
