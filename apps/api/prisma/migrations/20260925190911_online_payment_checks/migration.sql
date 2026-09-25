ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_amounts" CHECK (
  "amountKurus" > 0
  AND "appliedKurus" BETWEEN 0 AND "amountKurus"
  AND "refundedKurus" BETWEEN 0 AND "amountKurus"
);
