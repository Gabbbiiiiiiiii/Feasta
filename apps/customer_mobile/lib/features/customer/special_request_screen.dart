import 'dart:convert';
import 'dart:math';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

import '../../shared/models/feasta_models.dart';
import 'booking_details_screen.dart';

FirebaseFunctions get _functions =>
    FirebaseFunctions.instanceFor(region: 'asia-southeast1');

num? specialRequestDropOffPrice(PackageModel package) {
  final option = package.serviceOptions['drop_off'];
  final price = option?['price'];
  return option?['enabled'] != false &&
          price is num &&
          price.isFinite &&
          price > 0
      ? price
      : null;
}

String _money(num amount) => '₱${amount.toStringAsFixed(2)}';

class SpecialRequestForm extends StatefulWidget {
  const SpecialRequestForm({super.key, required this.package});

  final PackageModel package;

  @override
  State<SpecialRequestForm> createState() => _SpecialRequestFormState();
}

class _SpecialRequestFormState extends State<SpecialRequestForm> {
  final _form = GlobalKey<FormState>();
  final _quantity = TextEditingController(text: '1');
  final _address = TextEditingController();
  final _instructions = TextEditingController();
  final _deliveryInstructions = TextEditingController();
  final _random = Random.secure();
  String? _lastPayload;
  String? _submissionId;
  DateTime? _date;
  TimeOfDay? _start;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _quantity.dispose();
    _address.dispose();
    _instructions.dispose();
    _deliveryInstructions.dispose();
    super.dispose();
  }

  String _clock(TimeOfDay time) =>
      '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    final date = _date;
    final start = _start;
    if (date == null || start == null) {
      setState(() => _error = 'Choose an event date and a valid time.');
      return;
    }

    final data = {
      'packageId': widget.package.id,
      'quantity': int.parse(_quantity.text.trim()),
      'eventDate': date.toIso8601String().split('T').first,
      'eventTime': _clock(start),
      'address': _address.text.trim(),
      'instructions': _instructions.text.trim(),
      'deliveryInstructions': _deliveryInstructions.text.trim(),
    };
    final payload = jsonEncode(data);
    if (_lastPayload != payload) {
      _lastPayload = payload;
      _submissionId = List.generate(
        24,
        (_) => _random.nextInt(256),
      ).map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _functions.httpsCallable('submitSpecialRequest').call({
        ...data,
        'submissionId': _submissionId,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Special request submitted.')),
      );
      await Navigator.of(context).pushReplacement<void, void>(
        MaterialPageRoute(builder: (_) => const SpecialRequestTracker()),
      );
    } on FirebaseFunctionsException catch (error) {
      if (mounted)
        setState(() => _error = error.message ?? 'Unable to submit request.');
    } catch (_) {
      if (mounted) setState(() => _error = 'Unable to submit request.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickTime() async {
    final value = await showTimePicker(
      context: context,
      initialTime: _start ?? TimeOfDay.now(),
    );
    if (mounted && value != null) setState(() => _start = value);
  }

  @override
  Widget build(BuildContext context) {
    final package = widget.package;
    final unitPrice = specialRequestDropOffPrice(package);
    final quantityText = _quantity.text.trim();
    final quantity = RegExp(r'^[0-9]+$').hasMatch(quantityText)
        ? int.tryParse(quantityText)
        : null;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Special Request'),
        actions: [
          TextButton(
            onPressed: _busy
                ? null
                : () => Navigator.of(context).push<void>(
                    MaterialPageRoute(
                      builder: (_) => const SpecialRequestTracker(),
                    ),
                  ),
            child: const Text('My requests'),
          ),
        ],
      ),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(package.name, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              TextFormField(
                controller: _quantity,
                enabled: !_busy,
                keyboardType: TextInputType.number,

                decoration: const InputDecoration(labelText: 'Quantity'),
                onChanged: (_) => setState(() {}),
                validator: (_) =>
                    quantity == null || quantity < 1 || quantity > 100
                    ? 'Enter a whole number from 1 to 100.'
                    : null,
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Event date'),
                trailing: Text(
                  _date?.toIso8601String().split('T').first ?? 'Choose',
                ),
                onTap: _busy
                    ? null
                    : () async {
                        final now = DateTime.now();
                        final date = await showDatePicker(
                          context: context,
                          initialDate: _date ?? now,
                          firstDate: DateUtils.dateOnly(now),
                          lastDate: DateTime(now.year + 3, 12, 31),
                        );
                        if (mounted && date != null)
                          setState(() => _date = date);
                      },
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Drop-Off Time'),
                trailing: Text(_start?.format(context) ?? 'Choose'),
                onTap: _busy ? null : _pickTime,
              ),
              TextFormField(
                controller: _address,
                enabled: !_busy,
                maxLength: 500,
                decoration: const InputDecoration(
                  labelText: 'Delivery address',
                ),
                validator: (value) => value == null || value.trim().isEmpty
                    ? 'Enter the delivery address.'
                    : null,
              ),
              TextFormField(
                controller: _deliveryInstructions,
                enabled: !_busy,
                maxLength: 1000,
                decoration: const InputDecoration(
                  labelText: 'Delivery instructions (optional)',
                ),
              ),
              TextFormField(
                controller: _instructions,
                enabled: !_busy,
                maxLength: 2000,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Special instructions (optional)',
                ),
              ),
              const SizedBox(height: 16),
              if (unitPrice != null)
                Text('Published unit price ${_money(unitPrice)}'),
              if (unitPrice != null &&
                  quantity != null &&
                  quantity >= 1 &&
                  quantity <= 100)
                Text(
                  'Estimated subtotal ${_money(unitPrice * quantity)}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              const Text(
                'Delivery is included. The provider will review your request.',
              ),
              if (_error != null)
                Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _busy || unitPrice == null ? null : _submit,
                child: Text(_busy ? 'Submitting…' : 'Submit Special Request'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class SpecialRequestTracker extends StatefulWidget {
  const SpecialRequestTracker({super.key});

  @override
  State<SpecialRequestTracker> createState() => _SpecialRequestTrackerState();
}

class _SpecialRequestTrackerState extends State<SpecialRequestTracker> {
  late Future<List<Map<String, dynamic>>> _requests = _fetch();
  bool _saving = false;

  Future<List<Map<String, dynamic>>> _fetch() async {
    final response = await _functions.httpsCallable('listSpecialRequests').call(
      {'view': 'customer'},
    );
    final data = Map<String, dynamic>.from(response.data as Map);
    return (data['requests'] as List)
        .map((row) => Map<String, dynamic>.from(row as Map))
        .toList();
  }

  void _refresh() => setState(() => _requests = _fetch());

  Future<void> _update(
    String id,
    String action, [
    String? message,
    int? offerVersion,
  ]) async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      final response = await _functions
          .httpsCallable('updateSpecialRequest')
          .call({
            'id': id,
            'action': action,
            'message': message,
            if (offerVersion != null) 'offerVersion': offerVersion,
          });
      if (!mounted) return;
      _refresh();
      final data = response.data;
      final bookingId = data is Map ? data['bookingId'] : null;
      if (action == 'accept' && bookingId is String) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Offer accepted. Complete payment before the deadline to confirm your booking.',
            ),
          ),
        );
        await Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => BookingDetailsScreen(bookingId: bookingId),
          ),
        );
      }
    } on FirebaseFunctionsException catch (error) {
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.message ?? 'Unable to update request.')),
        );
    } catch (_) {
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Unable to update request.')),
        );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _clarify(String id) async {
    var message = '';
    final reply = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reply to provider'),
        content: TextField(
          maxLines: 3,
          maxLength: 2000,
          onChanged: (value) => message = value,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Back'),
          ),
          FilledButton(
            onPressed: () {
              if (message.trim().isNotEmpty)
                Navigator.pop(context, message.trim());
            },
            child: const Text('Send'),
          ),
        ],
      ),
    );
    if (mounted && reply != null) await _update(id, 'clarify', reply);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('My Special Requests'),
      actions: [
        IconButton(
          onPressed: _refresh,
          tooltip: 'Refresh',
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: FutureBuilder(
      future: _requests,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Center(
            child: TextButton(
              onPressed: _refresh,
              child: const Text('Unable to load requests. Retry'),
            ),
          );
        }
        final rows = snapshot.data ?? [];
        if (rows.isEmpty)
          return const Center(child: Text('No special requests yet.'));
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: rows.length,
          itemBuilder: (context, index) {
            final row = rows[index];
            final id = row['id'] as String;
            final status = row['status'] as String;
            final offer = row['priceOffer'];
            final bookingId = row['bookingId'];
            final statusLabel = status == 'quotation_sent'
                ? 'Price offer received'
                : status == 'converted_to_booking'
                ? 'Offer accepted'
                : status.replaceAll('_', ' ');
            return Card(
              child: ExpansionTile(
                title: Text('${row['packageName']} × ${row['quantity']}'),
                subtitle: Text("${row['providerName']} • $statusLabel"),
                children: [
                  ListTile(
                    title: Text("${row['eventDate']} • ${row['eventTime']}"),
                    subtitle: Text(
                      'Estimated subtotal ${_money((row['subtotalInCentavos'] as num) / 100)}',
                    ),
                  ),
                  if (row['address'] is String &&
                      (row['address'] as String).isNotEmpty)
                    ListTile(
                      title: const Text('Delivery address'),
                      subtitle: Text(row['address'] as String),
                    ),
                  if (offer is Map) ...[
                    ListTile(
                      title: const Text('Provider Price Offer'),
                      subtitle: Text(
                        'Package subtotal ${_money((offer['subtotalInCentavos'] as num) / 100)}\n'
                        'Total offered ${_money((offer['totalInCentavos'] as num) / 100)}',
                      ),
                    ),
                    if (offer['deliveryIncluded'] == true)
                      const ListTile(
                        title: Text('Delivery included'),
                        subtitle: Text(
                          'The provider will deliver your order to the specified event address. Delivery is already included in the quoted price.',
                        ),
                      )
                    else
                      const ListTile(
                        subtitle: Text(
                          'This earlier offer keeps its original quoted total.',
                        ),
                      ),
                    if (offer['notes'] is String &&
                        (offer['notes'] as String).isNotEmpty)
                      ListTile(
                        title: const Text('Provider notes'),
                        subtitle: Text(offer['notes'] as String),
                      ),
                  ],
                  if (status == 'quotation_sent' &&
                      offer is Map &&
                      offer['version'] is int) ...[
                    if (offer['expiresAtMs'] is int &&
                        row['dropOffEligible'] != false)
                      FilledButton(
                        onPressed: _saving
                            ? null
                            : () => _update(
                                id,
                                'accept',
                                null,
                                offer['version'] as int,
                              ),
                        child: const Text('Accept Offer'),
                      ),
                    TextButton(
                      onPressed: _saving
                          ? null
                          : () => _update(
                              id,
                              'declineOffer',
                              null,
                              offer['version'] as int,
                            ),
                      child: const Text('Decline Offer'),
                    ),
                  ],
                  if (bookingId is String)
                    TextButton(
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) =>
                              BookingDetailsScreen(bookingId: bookingId),
                        ),
                      ),
                      child: const Text('View Booking & Payment'),
                    ),
                  ListTile(title: const Text('Reference'), subtitle: Text(id)),
                  for (final field in [
                    'requestClarificationMessage',
                    'declineMessage',
                  ])
                    if (row[field] is String)
                      ListTile(
                        title: const Text('Provider message'),
                        subtitle: Text(row[field] as String),
                      ),
                  if (status == 'needs_clarification')
                    TextButton(
                      onPressed: _saving ? null : () => _clarify(id),
                      child: const Text('Reply to provider'),
                    ),
                  if ([
                    'pending_review',
                    'needs_clarification',
                    'revision_requested',
                  ].contains(status))
                    TextButton(
                      onPressed: _saving ? null : () => _update(id, 'cancel'),
                      child: const Text('Cancel request'),
                    ),
                ],
              ),
            );
          },
        );
      },
    ),
  );
}
