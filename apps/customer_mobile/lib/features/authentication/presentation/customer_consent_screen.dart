import 'package:flutter/material.dart';

import '../../presentation/screens/legal_document_screen.dart';

/// Acceptance is local to this onboarding screen and starts unchecked.
class CustomerConsentScreen extends StatefulWidget {
  const CustomerConsentScreen({
    required this.onAccept,
    required this.onDecline,
    this.loader = loadCurrentLegalDocument,
    super.key,
  });
  final Future<void> Function() onAccept;
  final Future<void> Function() onDecline;
  final LegalDocumentLoader loader;

  @override
  State<CustomerConsentScreen> createState() => _CustomerConsentScreenState();
}

class _CustomerConsentScreenState extends State<CustomerConsentScreen> {
  late final Future<List<Map<String, dynamic>?>> _documents = Future.wait([
    widget.loader(FeastaLegalDocument.termsOfService),
    widget.loader(FeastaLegalDocument.privacyPolicy),
  ]);
  bool _terms = false;
  bool _privacy = false;
  bool _busy = false;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Complete customer sign-in')),
    body: FutureBuilder<List<Map<String, dynamic>?>>(
      future: _documents,
      builder: (context, snapshot) {
        final documents = snapshot.data;
        final available =
            documents != null &&
            documents.every(
              (document) =>
                  document?['version'] == '2026-07-29' &&
                  document?['sections'] is List &&
                  (document!['sections'] as List).isNotEmpty &&
                  (document['sections'] as List).every(
                    (section) =>
                        section is Map &&
                        section['title'] is String &&
                        section['paragraphs'] is List &&
                        (section['paragraphs'] as List).every(
                          (paragraph) => paragraph is String,
                        ),
                  ),
            );
        return ListView(
          padding: const EdgeInsets.all(24),
          children: [
            if (snapshot.connectionState != ConnectionState.done)
              const Center(child: CircularProgressIndicator()),
            if (snapshot.connectionState == ConnectionState.done && !available)
              const Text(
                'Current policies could not be verified. Cancel and retry, or contact support.',
              ),
            if (available) ...[
              for (var index = 0; index < documents.length; index++) ...[
                Text(
                  index == 0 ? 'Terms of Service' : 'Privacy Policy',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                Text('Version ${documents[index]!['version']}'),
                for (final section
                    in documents[index]!['sections'] as List) ...[
                  Text('${section['title']}'),
                  for (final paragraph in section['paragraphs'] as List)
                    Text('$paragraph'),
                ],
              ],
              CheckboxListTile(
                title: const Text('I accept the Terms of Service'),
                value: _terms,
                onChanged: _busy
                    ? null
                    : (value) => setState(() => _terms = value == true),
              ),
              CheckboxListTile(
                title: const Text('I accept the Privacy Policy'),
                value: _privacy,
                onChanged: _busy
                    ? null
                    : (value) => setState(() => _privacy = value == true),
              ),
              FilledButton(
                onPressed: !_terms || !_privacy || _busy
                    ? null
                    : () async {
                        setState(() => _busy = true);
                        await widget.onAccept();
                        if (mounted) setState(() => _busy = false);
                      },
                child: const Text('Accept and continue'),
              ),
            ],
            TextButton(
              onPressed: _busy ? null : widget.onDecline,
              child: const Text('Cancel sign-in'),
            ),
          ],
        );
      },
    ),
  );
}
