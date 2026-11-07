-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "asaasCustomerId" TEXT,
ADD COLUMN     "asaasSubscriptionId" TEXT,
ADD COLUMN     "billingEndsAt" TIMESTAMP(3),
ADD COLUMN     "billingInvoiceUrl" TEXT,
ADD COLUMN     "billingOverdueSince" TIMESTAMP(3),
ADD COLUMN     "billingPlanCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_asaasSubscriptionId_key" ON "Organization"("asaasSubscriptionId");
