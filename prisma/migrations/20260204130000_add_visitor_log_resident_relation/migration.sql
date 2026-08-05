-- AddForeignKey
ALTER TABLE "visitor_logs" ADD CONSTRAINT "visitor_logs_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "residents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
