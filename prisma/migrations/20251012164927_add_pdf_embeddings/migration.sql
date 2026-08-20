-- DropForeignKey
ALTER TABLE "pdf_embeddings" DROP CONSTRAINT "pdf_embeddings_tenantId_fkey";

-- DropIndex
DROP INDEX "pdf_embeddings_embedding_ivfflat_idx";

-- AddForeignKey
ALTER TABLE "pdf_embeddings" ADD CONSTRAINT "pdf_embeddings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
