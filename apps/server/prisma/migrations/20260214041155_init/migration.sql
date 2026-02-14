-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'live',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "djKeyHash" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "activeDjSessionId" TEXT,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DjSession" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DjSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongRequest" (
    "id" TEXT NOT NULL,
    "seqNo" INTEGER NOT NULL,
    "partyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "appleMusicUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Party_code_key" ON "Party"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Party_activeDjSessionId_key" ON "Party"("activeDjSessionId");

-- CreateIndex
CREATE INDEX "Party_ownerId_idx" ON "Party"("ownerId");

-- CreateIndex
CREATE INDEX "DjSession_partyId_active_idx" ON "DjSession"("partyId", "active");

-- CreateIndex
CREATE INDEX "SongRequest_partyId_createdAt_idx" ON "SongRequest"("partyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SongRequest_partyId_seqNo_key" ON "SongRequest"("partyId", "seqNo");

-- CreateIndex
CREATE INDEX "IdempotencyKey_requestId_idx" ON "IdempotencyKey"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_partyId_key_key" ON "IdempotencyKey"("partyId", "key");

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_activeDjSessionId_fkey" FOREIGN KEY ("activeDjSessionId") REFERENCES "DjSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DjSession" ADD CONSTRAINT "DjSession_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongRequest" ADD CONSTRAINT "SongRequest_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SongRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
