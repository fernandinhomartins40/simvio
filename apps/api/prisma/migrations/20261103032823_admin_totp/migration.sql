-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totpLastStep" INTEGER,
ADD COLUMN     "totpRecoveryDigests" TEXT[] DEFAULT ARRAY[]::TEXT[];
