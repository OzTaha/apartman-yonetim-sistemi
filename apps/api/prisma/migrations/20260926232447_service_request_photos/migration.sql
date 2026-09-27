ALTER TABLE "attachments" DROP CONSTRAINT "attachments_single_target";
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_single_target" CHECK (
  num_nonnulls("transactionId", "workId", "paymentId", "announcementId", "requestId") = 1
);
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_number_positive" CHECK ("number" > 0);
