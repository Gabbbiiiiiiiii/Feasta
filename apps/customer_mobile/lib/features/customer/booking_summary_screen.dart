import 'package:flutter/material.dart';

import '../../shared/models/event_customization_data.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'booking_submitted_screen.dart';

class BookingSummaryScreen extends StatefulWidget {
  final ProviderModel provider;
  final PackageModel eventPackage;
  final EventCustomizationData customization;

  const BookingSummaryScreen({
    super.key,
    required this.provider,
    required this.eventPackage,
    required this.customization,
  });

  @override
  State<BookingSummaryScreen> createState() => _BookingSummaryScreenState();
}

class _BookingSummaryScreenState extends State<BookingSummaryScreen> {
  final FeastaRepository repository = FeastaRepository();

  bool isSubmitting = false;

  List<Map<String, dynamic>> get cateringProviderAddOns {
  return widget.customization.selectedAddOns
      .where((addon) => addon['source'] == 'catering_provider')
      .toList();
  }

  List<Map<String, dynamic>> get marketplaceAddOns {
    return widget.customization.selectedAddOns
        .where((addon) => addon['source'] == 'feasta_addon_provider')
        .toList();
  }

  double get addOnsTotal {
    return widget.customization.selectedAddOns.fold<double>(
      0,
      (sum, addon) => sum + ((addon['price'] ?? 0) as num).toDouble(),
    );
  }

  double get totalAmount => widget.eventPackage.price + addOnsTotal;

  double get downPaymentAmount {
    return totalAmount * (widget.eventPackage.downPaymentPercentage / 100);
  }

  double get remainingBalance => totalAmount - downPaymentAmount;

  String get formattedDate {
    final date = widget.customization.eventDate;
    return '${date.month}/${date.day}/${date.year}';
  }

  Future<void> _submitBookingRequest() async {
    setState(() => isSubmitting = true);

    try {
      final customer = await repository.getCurrentCustomer();

      final bookingId = await repository.createBookingRequest(
        customer: customer,
        provider: widget.provider,
        package: widget.eventPackage,
        eventType: widget.customization.eventType,
        eventDate: widget.customization.eventDate,
        eventTime: widget.customization.eventTime,
        eventEndTime: widget.customization.eventEndTime,
        guestCount: widget.customization.guestCount,
        eventLocation: widget.customization.eventLocation,
        eventAddress: widget.customization.eventAddress,
        selectedFoods: widget.customization.selectedFoods,
        selectedDecorations: widget.customization.selectedDecorations,
        selectedFurniture: widget.customization.selectedFurniture,
        selectedAddOns: widget.customization.selectedAddOns,
        willArrangeOwnAddOns: widget.customization.willArrangeOwnAddOns,
        customerArrangedAddOnsNote:
            widget.customization.customerArrangedAddOnsNote,
        specialRequest: widget.customization.specialRequest,
      );

      if (!mounted) return;

      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(
          builder: (_) => BookingSubmittedScreen(
            bookingId: bookingId,
            providerName: widget.provider.businessName,
          ),
        ),
        (_) => false,
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e.toString().replaceAll('Exception: ', ''),
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Booking Summary'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _SummaryCard(
            title: 'Caterer',
            children: [
              _SummaryRow(
                label: 'Provider',
                value: widget.provider.businessName,
              ),
              _SummaryRow(
                label: 'Location',
                value: widget.provider.location,
              ),
              _SummaryRow(
                label: 'Status',
                value: widget.provider.isVerified ? 'Verified' : 'Pending',
              ),
            ],
          ),
          const SizedBox(height: 16),
          _SummaryCard(
            title: 'Selected Package',
            children: [
              _SummaryRow(
                label: 'Package',
                value: widget.eventPackage.name,
              ),
              _SummaryRow(
                label: 'Event Type',
                value: widget.customization.eventType,
              ),
              _SummaryRow(
                label: 'Good For',
                value: '${widget.eventPackage.guestCapacity} guests',
              ),
            ],
          ),
          const SizedBox(height: 16),
          _SummaryCard(
            title: 'Event Details',
            children: [
              _SummaryRow(
                label: 'Date',
                value: formattedDate,
              ),
              _SummaryRow(
                label: 'Time',
                value:
                    '${widget.customization.eventTime} - ${widget.customization.eventEndTime}',
              ),
              _SummaryRow(
                label: 'Guests',
                value: '${widget.customization.guestCount}',
              ),
              _SummaryRow(
                label: 'Location',
                value: widget.customization.eventLocation,
              ),
              _SummaryRow(
                label: 'Address',
                value: widget.customization.eventAddress,
              ),
            ],
          ),
          const SizedBox(height: 16),
          _ListSummaryCard(
            title: 'Selected Foods',
            items: widget.customization.selectedFoods,
          ),
          const SizedBox(height: 16),
          _ListSummaryCard(
            title: 'Selected Decorations',
            items: widget.customization.selectedDecorations,
          ),
          const SizedBox(height: 16),
          _ListSummaryCard(
            title: 'Selected Furniture',
            items: widget.customization.selectedFurniture,
          ),
          const SizedBox(height: 16),
          _AddOnGroupCard(
            title: 'Catering Provider Add-ons',
            emptyText: 'No catering provider add-ons selected.',
            addOns: cateringProviderAddOns,
          ),
          const SizedBox(height: 16),

          _AddOnGroupCard(
            title: 'Feasta Add-on Marketplace',
            emptyText: 'No marketplace add-ons selected.',
            addOns: marketplaceAddOns,
          ),
          const SizedBox(height: 16),

          if (widget.customization.willArrangeOwnAddOns)
            _SummaryCard(
              title: 'Customer-arranged Add-ons',
              children: [
                Text(
                  widget.customization.customerArrangedAddOnsNote.isEmpty
                      ? 'Customer will arrange their own add-ons.'
                      : widget.customization.customerArrangedAddOnsNote,
                  style: const TextStyle(
                    color: Colors.grey,
                    height: 1.4,
                  ),
                ),
              ],
            ),

          if (widget.customization.willArrangeOwnAddOns)
            const SizedBox(height: 16),
          if (widget.customization.specialRequest.isNotEmpty)
            _SummaryCard(
              title: 'Special Request',
              children: [
                Text(
                  widget.customization.specialRequest,
                  style: const TextStyle(
                    color: Colors.grey,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          const SizedBox(height: 16),
          _SummaryCard(
            title: 'Payment Summary',
            children: [
              _SummaryRow(
                label: 'Package Price',
                value: '₱${widget.eventPackage.price.toStringAsFixed(0)}',
              ),
              _SummaryRow(
                label: 'Add-ons Total',
                value: '₱${addOnsTotal.toStringAsFixed(0)}',
              ),
              const Divider(),
              _SummaryRow(
                label: 'Total Amount',
                value: '₱${totalAmount.toStringAsFixed(0)}',
                isBold: true,
              ),
              _SummaryRow(
                label:
                    'Down Payment (${widget.eventPackage.downPaymentPercentage.toStringAsFixed(0)}%)',
                value: '₱${downPaymentAmount.toStringAsFixed(0)}',
                valueColor: primary,
                isBold: true,
              ),
              _SummaryRow(
                label: 'Remaining Balance',
                value: '₱${remainingBalance.toStringAsFixed(0)}',
              ),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.orange.withOpacity(0.1),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.orange.withOpacity(0.4)),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, color: Colors.orange),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Your booking is not yet confirmed. The provider must accept your request first. After acceptance, you must complete the down payment to confirm the booking.',
                    style: TextStyle(height: 1.4),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 100),
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
            height: 56,
            width: double.infinity,
            child: ElevatedButton(
              onPressed: isSubmitting ? null : _submitBookingRequest,
              style: ElevatedButton.styleFrom(
                backgroundColor: primary,
                foregroundColor: Colors.white,
              ),
              child: isSubmitting
                  ? const CircularProgressIndicator(color: Colors.white)
                  : const Text(
                      'Submit Booking Request',
                      style: TextStyle(fontWeight: FontWeight.w900),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _SummaryCard({
    required this.title,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFE5E7EB)),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 14),
          ...children,
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;
  final bool isBold;
  final Color? valueColor;

  const _SummaryRow({
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
          const SizedBox(width: 16),
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

class _ListSummaryCard extends StatelessWidget {
  final String title;
  final List<String> items;

  const _ListSummaryCard({
    required this.title,
    required this.items,
  });

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return _SummaryCard(
        title: title,
        children: const [
          Text(
            'No selected items.',
            style: TextStyle(color: Colors.grey),
          ),
        ],
      );
    }

    return _SummaryCard(
      title: title,
      children: items.map((item) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(
            children: [
              const Icon(
                Icons.check_circle,
                color: Colors.green,
                size: 20,
              ),
              const SizedBox(width: 10),
              Expanded(child: Text(item)),
            ],
          ),
        );
      }).toList(),
    );
  }
}

class _AddOnGroupCard extends StatelessWidget {
  final String title;
  final String emptyText;
  final List<Map<String, dynamic>> addOns;

  const _AddOnGroupCard({
    required this.title,
    required this.emptyText,
    required this.addOns,
  });

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFE5E7EB)),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 12),
          if (addOns.isEmpty)
            Text(
              emptyText,
              style: const TextStyle(color: Colors.grey),
            )
          else
            ...addOns.map((addon) {
              final name = addon['name'] ?? '';
              final providerBusinessName =
                  addon['providerBusinessName'] ?? '';
              final category = addon['category'] ?? '';
              final price = ((addon['price'] ?? 0) as num).toDouble();

              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.add_circle_outline,
                      color: primary,
                      size: 22,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            name,
                            style: const TextStyle(
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            '$providerBusinessName • $category',
                            style: const TextStyle(
                              color: Colors.grey,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      '₱${price.toStringAsFixed(0)}',
                      style: const TextStyle(
                        color: primary,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }
}