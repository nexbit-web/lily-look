
-- CreateEnum
CREATE TYPE "BotRole" AS ENUM ('MANAGER', 'COURIER');

-- CreateTable
CREATE TABLE "BotUser" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "role" "BotRole" NOT NULL DEFAULT 'MANAGER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotInvite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "role" "BotRole" NOT NULL DEFAULT 'MANAGER',
    "note" TEXT,
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotNotice" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "botUserId" TEXT,
    "chatId" BIGINT NOT NULL,
    "messageId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotUpdate" (
    "updateId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotUpdate_pkey" PRIMARY KEY ("updateId")
);

-- CreateIndex
CREATE UNIQUE INDEX "BotUser_telegramId_key" ON "BotUser"("telegramId");

-- CreateIndex
CREATE INDEX "BotUser_isActive_idx" ON "BotUser"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BotInvite_code_key" ON "BotInvite"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BotInvite_usedById_key" ON "BotInvite"("usedById");

-- CreateIndex
CREATE INDEX "BotInvite_usedAt_idx" ON "BotInvite"("usedAt");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "BotNotice_orderId_idx" ON "BotNotice"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "BotNotice_orderId_chatId_key" ON "BotNotice"("orderId", "chatId");

-- CreateIndex
CREATE INDEX "BotUpdate_createdAt_idx" ON "BotUpdate"("createdAt");

-- AddForeignKey
ALTER TABLE "BotInvite" ADD CONSTRAINT "BotInvite_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "BotUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "BotUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotNotice" ADD CONSTRAINT "BotNotice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotNotice" ADD CONSTRAINT "BotNotice_botUserId_fkey" FOREIGN KEY ("botUserId") REFERENCES "BotUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

