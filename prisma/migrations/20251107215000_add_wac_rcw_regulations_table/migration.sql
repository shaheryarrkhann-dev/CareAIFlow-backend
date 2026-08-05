-- CreateTable
CREATE TABLE "wac_rcw_regulations" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "citeCode" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "effectiveDate" TEXT,
    "version" TEXT,
    "source" TEXT,
    "lastFetched" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "totalChunks" INTEGER NOT NULL DEFAULT 1,
    "embedding" vector NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wac_rcw_regulations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wac_rcw_regulations_type_idx" ON "wac_rcw_regulations"("type");

-- CreateIndex
CREATE INDEX "wac_rcw_regulations_citeCode_idx" ON "wac_rcw_regulations"("citeCode");

-- CreateIndex
CREATE INDEX "wac_rcw_regulations_type_citeCode_idx" ON "wac_rcw_regulations"("type", "citeCode");
