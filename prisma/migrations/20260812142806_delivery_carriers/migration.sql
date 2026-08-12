-- AlterEnum
ALTER TYPE "DeliveryMethod" ADD VALUE 'UKRPOSHTA_BRANCH';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryCityRef" TEXT,
ADD COLUMN     "deliveryWarehouseRef" TEXT;
