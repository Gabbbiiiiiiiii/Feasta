import 'package:flutter/material.dart';

import '../../models/verification/provider_verification.dart';

class RejectProviderDialog extends StatefulWidget {
  final ProviderVerificationApplication application;

  const RejectProviderDialog({
    super.key,
    required this.application,
  });

  static Future<String?> show({
    required BuildContext context,
    required ProviderVerificationApplication application,
  }) {
    return showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (_) => RejectProviderDialog(
        application: application,
      ),
    );
  }

  @override
  State<RejectProviderDialog> createState() =>
      _RejectProviderDialogState();
}

class _RejectProviderDialogState
    extends State<RejectProviderDialog> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _reasonController =
      TextEditingController();

  String? _selectedReason;
  bool _confirmAcknowledgement = false;

  static const List<String> _commonReasons = [
    'Required documents are missing',
    'One or more documents are invalid',
    'Business information could not be verified',
    'Documents are expired',
    'Duplicate provider application',
    'Other',
  ];

  bool get _isOtherReason {
    return _selectedReason == 'Other';
  }

  String get _finalReason {
    final typedReason = _reasonController.text.trim();

    if (_isOtherReason) {
      return typedReason;
    }

    if (_selectedReason == null) {
      return typedReason;
    }

    if (typedReason.isEmpty) {
      return _selectedReason!;
    }

    return '${_selectedReason!}: $typedReason';
  }

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    if (!_confirmAcknowledgement) {
      setState(() {});
      return;
    }

    Navigator.of(context).pop(_finalReason);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      insetPadding: const EdgeInsets.all(20),
      titlePadding: const EdgeInsets.fromLTRB(24, 22, 24, 0),
      contentPadding: const EdgeInsets.fromLTRB(24, 18, 24, 8),
      actionsPadding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
      title: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: const Color(0xFFFEF2F2),
              borderRadius: BorderRadius.circular(11),
            ),
            child: const Icon(
              Icons.cancel_outlined,
              color: Color(0xFFDC2626),
              size: 21,
            ),
          ),
          const SizedBox(width: 11),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Reject provider application',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF111827),
                  ),
                ),
                SizedBox(height: 3),
                Text(
                  'A clear reason is required.',
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w400,
                    color: Color(0xFF6B7280),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      content: SizedBox(
        width: 520,
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _ProviderSummary(
                  application: widget.application,
                ),
                const SizedBox(height: 18),
                DropdownButtonFormField<String>(
                  value: _selectedReason,
                  decoration: const InputDecoration(
                    labelText: 'Primary rejection reason',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(
                      Icons.report_problem_outlined,
                    ),
                  ),
                  items: _commonReasons.map((reason) {
                    return DropdownMenuItem<String>(
                      value: reason,
                      child: Text(reason),
                    );
                  }).toList(),
                  onChanged: (value) {
                    setState(() {
                      _selectedReason = value;
                    });
                  },
                  validator: (value) {
                    if (value == null) {
                      return 'Select a rejection reason.';
                    }

                    return null;
                  },
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _reasonController,
                  minLines: 4,
                  maxLines: 7,
                  maxLength: 500,
                  decoration: InputDecoration(
                    labelText: _isOtherReason
                        ? 'Detailed reason'
                        : 'Additional details',
                    hintText: _isOtherReason
                        ? 'Explain why the provider application is being rejected.'
                        : 'Explain what the provider needs to correct or resubmit.',
                    alignLabelWithHint: true,
                    border: const OutlineInputBorder(),
                    helperText:
                        'This message may be shown to the provider.',
                  ),
                  validator: (value) {
                    final text = value?.trim() ?? '';

                    if (_isOtherReason && text.isEmpty) {
                      return 'Enter a detailed rejection reason.';
                    }

                    if (text.isNotEmpty && text.length < 10) {
                      return 'Provide a more detailed explanation.';
                    }

                    if (_finalReason.length < 10) {
                      return 'The rejection reason is too short.';
                    }

                    return null;
                  },
                ),
                CheckboxListTile(
                  value: _confirmAcknowledgement,
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  title: const Text(
                    'I confirm that this rejection reason is accurate and suitable for provider notification.',
                    style: TextStyle(
                      fontSize: 12,
                      height: 1.4,
                    ),
                  ),
                  onChanged: (value) {
                    setState(() {
                      _confirmAcknowledgement = value ?? false;
                    });
                  },
                ),
                if (!_confirmAcknowledgement)
                  const Padding(
                    padding: EdgeInsets.only(left: 12, top: 2),
                    child: Text(
                      'Confirmation is required before rejecting.',
                      style: TextStyle(
                        color: Color(0xFFDC2626),
                        fontSize: 11.5,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton.icon(
          onPressed: _submit,
          icon: const Icon(
            Icons.close_rounded,
            size: 17,
          ),
          label: const Text('Reject Application'),
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFFDC2626),
            foregroundColor: Colors.white,
          ),
        ),
      ],
    );
  }
}

class _ProviderSummary extends StatelessWidget {
  final ProviderVerificationApplication application;

  const _ProviderSummary({
    required this.application,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: const Color(0xFFF9FAFB),
        borderRadius: BorderRadius.circular(11),
        border: Border.all(
          color: const Color(0xFFE5E7EB),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: const Color(0xFFFFF1EC),
              borderRadius: BorderRadius.circular(11),
            ),
            child: const Icon(
              Icons.storefront_rounded,
              color: Color(0xFFFF6333),
              size: 21,
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  application.businessName,
                  style: const TextStyle(
                    color: Color(0xFF1F2937),
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${application.ownerName} · ${application.id}',
                  style: const TextStyle(
                    color: Color(0xFF6B7280),
                    fontSize: 11.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}