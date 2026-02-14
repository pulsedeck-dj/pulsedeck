-- AlterTable
ALTER TABLE "SongRequest" ADD COLUMN     "playedAt" TIMESTAMP(3),
ADD COLUMN     "playedBy" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'queued';

-- CreateIndex
CREATE INDEX "SongRequest_partyId_status_seqNo_idx" ON "SongRequest"("partyId", "status", "seqNo");
