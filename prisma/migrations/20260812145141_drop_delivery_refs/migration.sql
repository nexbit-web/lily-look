/*
  Warnings:

  - You are about to drop the column `deliveryCityRef` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `deliveryWarehouseRef` on the `Order` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Order" DROP COLUMN "deliveryCityRef",
DROP COLUMN "deliveryWarehouseRef";
