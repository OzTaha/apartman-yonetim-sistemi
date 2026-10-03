-- AlterTable
ALTER TABLE "service_requests" ADD COLUMN     "fromStaff" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "urgent" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "unitId" DROP NOT NULL;

ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_unit_or_staff" CHECK ("fromStaff" OR "unitId" IS NOT NULL);
