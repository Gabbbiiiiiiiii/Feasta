/// Historical deposit records keep deposit wording when the stored upfront
/// amount is only part of the recorded total. New bookings are full payment.
bool isHistoricalDepositTerms({
  required double amount,
  required double upfrontAmount,
}) {
  return amount > 0 && upfrontAmount > 0 && upfrontAmount < amount;
}
