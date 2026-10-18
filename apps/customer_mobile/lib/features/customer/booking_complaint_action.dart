import 'package:flutter/material.dart';

import '../../core/widgets/widgets.dart';
import '../../shared/models/booking_complaint.dart';

typedef SubmitBookingComplaint =
    Future<void> Function({
      required String providerRequestId,
      required String category,
      required String description,
    });

class BookingComplaintAction extends StatefulWidget {
  const BookingComplaintAction({
    required this.loadServices,
    required this.submit,
    super.key,
  });
  final Future<List<BookingComplaintService>> Function() loadServices;
  final SubmitBookingComplaint submit;

  @override
  State<BookingComplaintAction> createState() => _BookingComplaintActionState();
}

class _BookingComplaintActionState extends State<BookingComplaintAction> {
  bool _opening = false;
  bool _submitted = false;

  Future<void> _open() async {
    if (_opening) return;
    setState(() => _opening = true);
    final submitted = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _ComplaintDialog(
        loadServices: widget.loadServices,
        submit: widget.submit,
      ),
    );
    if (!mounted) return;
    setState(() {
      _opening = false;
      if (submitted == true) _submitted = true;
    });
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      if (_submitted)
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 8),
          child: Text(
            'Issue reported. FEASTA Admin will review your report.',
            semanticsLabel:
                'Issue reported. FEASTA Admin will review your report.',
          ),
        ),
      FeastaSecondaryButton(
        label: 'Report an Issue',
        icon: const Icon(Icons.report_problem_outlined),
        onPressed: _opening ? null : _open,
      ),
    ],
  );
}

class _ComplaintDialog extends StatefulWidget {
  const _ComplaintDialog({required this.loadServices, required this.submit});
  final Future<List<BookingComplaintService>> Function() loadServices;
  final SubmitBookingComplaint submit;

  @override
  State<_ComplaintDialog> createState() => _ComplaintDialogState();
}

class _ComplaintDialogState extends State<_ComplaintDialog> {
  final _description = TextEditingController();
  late Future<List<BookingComplaintService>> _services;
  String? _serviceId;
  String? _category;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _services = widget.loadServices();
  }

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy) return;
    final error = _serviceId == null
        ? 'Choose the affected service.'
        : validateBookingComplaint(_category, _description.text);
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.submit(
        providerRequestId: _serviceId!,
        category: _category!,
        description: _description.text.trim(),
      );
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: AlertDialog(
      title: const Text('Report an Issue'),
      content: SizedBox(
        width: double.maxFinite,
        child: SingleChildScrollView(
          child: FutureBuilder<List<BookingComplaintService>>(
            future: _services,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snapshot.hasError ||
                  snapshot.data == null ||
                  snapshot.data!.isEmpty) {
                return Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      snapshot.error?.toString().replaceFirst(
                            'Exception: ',
                            '',
                          ) ??
                          'No reportable services are available.',
                    ),
                    TextButton(
                    onPressed: () {
                      final services = widget.loadServices();
                      setState(() { _services = services; });
                    },
                      child: const Text('Retry'),
                    ),
                  ],
                );
              }
              return Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Tell FEASTA Admin about an issue with this booked service.',
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    initialValue: _serviceId,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Affected service',
                    ),
                    items: snapshot.data!
                        .map(
                          (service) => DropdownMenuItem(
                            value: service.id,
                            child: Text(
                              service.name,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: _busy
                        ? null
                        : (value) => setState(() => _serviceId = value),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _category,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Category'),
                    items: bookingComplaintCategories.entries
                        .map(
                          (entry) => DropdownMenuItem(
                            value: entry.key,
                            child: Text(entry.value),
                          ),
                        )
                        .toList(),
                    onChanged: _busy
                        ? null
                        : (value) => setState(() => _category = value),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _description,
                    enabled: !_busy,
                    minLines: 3,
                    maxLines: 6,
                    maxLength: 4000,
                    decoration: const InputDecoration(
                      labelText: 'Description',
                      helperText: '10 to 4,000 characters',
                    ),
                  ),
                  if (_error != null)
                    Text(
                      _error!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                ],
              );
            },
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: _busy
              ? const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                    SizedBox(width: 8),
                    Text('Submitting report'),
                  ],
                )
              : const Text('Submit report'),
        ),
      ],
    ),
  );
}
