-- PurchaseLot.purchaseId becomes nullable. Opening stock, stock adjustments
-- and sale refunds create lots with no purchase behind them; the old code
-- wrote fake ids ('OPENING' / 'ADJUSTMENT' / 'REFUND') which violate the
-- foreign key and crash product creation with opening stock (and refunds /
-- adjustments). Existing lots keep their real purchaseId; any legacy rows
-- carrying a fake id are re-pointed to NULL.
-- SQLite cannot alter a column to nullable in place, so recreate the table
-- (same shape as 0001, only purchaseId loses NOT NULL). Dropping the child
-- table is safe: nothing references PurchaseLot.
CREATE TABLE "new_PurchaseLot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "qtyRemaining" REAL NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseLot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseLot_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PurchaseLot" ("id", "productId", "purchaseId", "qtyRemaining", "unitCost", "createdAt")
  SELECT "id", "productId",
    CASE WHEN "purchaseId" IN ('OPENING', 'ADJUSTMENT', 'REFUND') THEN NULL ELSE "purchaseId" END,
    "qtyRemaining", "unitCost", "createdAt" FROM "PurchaseLot";
DROP TABLE "PurchaseLot";
ALTER TABLE "new_PurchaseLot" RENAME TO "PurchaseLot";
CREATE INDEX "PurchaseLot_productId_createdAt_idx" ON "PurchaseLot"("productId", "createdAt");
