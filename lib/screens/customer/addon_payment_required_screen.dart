import 'package:flutter/material.dart';

import '../../models/feasta_models.dart';
import '../../repositories/feasta_repository.dart';

class AddonPaymentRequiredScreen extends StatefulWidget {
  final BookingModel booking;
  final AddonRequestModel addonRequest;

  const AddonPaymentRequiredScreen({
    super.key,
    required this.booking,
    required this.addonRequest,
  });

  @override
  State<AddonPaymentRequiredScreen> createState() =>
      _AddonPaymentRequiredScreenState();
}

class _AddonPaymentRequiredScreenState
    extends State<AddonPaymentRequiredScreen> {
  final FeastaRepository repository = FeastaRepository();

  String selectedPaymentMethod = 'gcash';
  bool isProcessing = false;

  Future<void> _payAddon() async {
    setState(() => isProcessing = true);

    try {
      final paymentId = await repository.createAddonPaymentRecord(
        booking: widget.booking,
        addonRequest: widget.addonRequest,
        paymentMethod: selectedPaymentMethod,
      );

      await repository.markAddonPaymentPaid(
        booking: widget.booking,
        addonRequest: widget.addonRequest,
        paymentId: paymentId,
        paymongoReferenceNumber:
            'ADDON-${DateTime.now().millisecondsSinceEpoch}',
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Add-on payment completed.'),
        ),
      );

      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => isProcessing = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Pay Add-on Service',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: const Color(0xFFE5E7EB)),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'External Add-on Payment',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 16),
                _RowItem(
                  label: 'Provider',
                  value: widget.addonRequest.addonProviderBusinessName,
                ),
                _RowItem(
                  label: 'Service',
                  value: widget.addonRequest.addonName,
                ),
                _RowItem(
                  label: 'Category',
                  value: widget.addonRequest.category,
                ),
                _RowItem(
                  label: 'Amount',
                  value: '₱${widget.addonRequest.price.toStringAsFixed(0)}',
                  isBold: true,
                  valueColor: primary,
                ),
                const Divider(height: 28),
                const Text(
                  'This payment is separate from your catering down payment.',
                  style: TextStyle(
                    color: Colors.grey,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: const Color(0xFFE5E7EB)),
              borderRadius: BorderRadius.circular(18),
            ),
            child: DropdownButtonFormField<String>(
              initialValue: selectedPaymentMethod,
              decoration: const InputDecoration(
                labelText: 'Payment Method',
              ),
              items: const [
                DropdownMenuItem(
                  value: 'gcash',
                  child: Text('GCash'),
                ),
                DropdownMenuItem(
                  value: 'maya',
                  child: Text('Maya'),
                ),
                DropdownMenuItem(
                  value: 'cash',
                  child: Text('Cash / Manual Confirmation'),
                ),
              ],
              onChanged: (value) {
                if (value == null) return;
                setState(() => selectedPaymentMethod = value);
              },
            ),
          ),
        ],
      ),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.all(18),
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(
            top: BorderSide(color: Color(0xFFE5E7EB)),
          ),
        ),
        child: SafeArea(
          child: SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton(
              onPressed: isProcessing ? null : _payAddon,
              style: ElevatedButton.styleFrom(
                backgroundColor: primary,
                foregroundColor: Colors.white,
              ),
              child: isProcessing
                  ? const CircularProgressIndicator(color: Colors.white)
                  : const Text(
                      'Pay Add-on Service',
                      style: TextStyle(fontWeight: FontWeight.w900),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _RowItem extends StatelessWidget {
  final String label;
  final String value;
  final bool isBold;
  final Color? valueColor;

  const _RowItem({
    required this.label,
    required this.value,
    this.isBold = false,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(color: Colors.grey),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                color: valueColor ?? Colors.black,
                fontWeight: isBold ? FontWeight.w900 : FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}