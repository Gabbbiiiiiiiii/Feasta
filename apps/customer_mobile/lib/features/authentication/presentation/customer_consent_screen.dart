import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../presentation/screens/legal_document_screen.dart';

/// Acceptance is local to this onboarding screen and starts unchecked.
class CustomerConsentScreen extends StatefulWidget {
  const CustomerConsentScreen({
    required this.onAccept,
    required this.onDecline,
    this.loader = loadCurrentLegalDocument,
    this.policiesOutdated = false,
    super.key,
  });
  final Future<void> Function(String termsVersion, String privacyVersion)
  onAccept;
  final Future<void> Function() onDecline;
  final LegalDocumentLoader loader;
  final bool policiesOutdated;

  @override
  State<CustomerConsentScreen> createState() => _CustomerConsentScreenState();
}

class _CustomerConsentScreenState extends State<CustomerConsentScreen> {
  late Future<List<Map<String, dynamic>?>> _documents;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant CustomerConsentScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.loader != widget.loader) _load();
  }

  void _load() {
    _terms = false;
    _privacy = false;
    _documents = Future.wait([
      Future.sync(() => widget.loader(FeastaLegalDocument.termsOfService)),
      Future.sync(() => widget.loader(FeastaLegalDocument.privacyPolicy)),
    ]);
  }

  static bool _validAgreement(Map<String, dynamic>? document) {
    bool text(Object? value) => value is String && value.trim().isNotEmpty;
    if (document == null ||
        !text(document['version']) ||
        !text(document['name']) ||
        document['sections'] is! List) {
      return false;
    }
    final sections = document['sections'] as List;
    return sections.isNotEmpty &&
        sections.every(
          (section) =>
              section is Map &&
              text(section['title']) &&
              section['paragraphs'] is List &&
              (section['paragraphs'] as List).isNotEmpty &&
              (section['paragraphs'] as List).every(text),
        );
  }

  String _loadFailure(Object? error) {
    if (error is FirebaseFunctionsException &&
        (error.code == 'permission-denied' ||
            error.code == 'unauthenticated')) {
      return 'Policy access could not be authorized. Retry or cancel sign-in. If this continues, contact support.';
    }
    return 'Current policies could not be verified. Retry or cancel sign-in.';
  }

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
            snapshot.connectionState == ConnectionState.done &&
            !snapshot.hasError &&
            documents != null &&
            documents.length == 2 &&
            documents.every(_validAgreement);
        final termsVersion = available
            ? documents[0]!['version'] as String
            : null;
        final privacyVersion = available
            ? documents[1]!['version'] as String
            : null;
        return ListView(
          padding: const EdgeInsets.all(24),
          children: [
            if (widget.policiesOutdated)
              const Text(
                'Policies have changed. Review both current agreements and accept them again to continue.',
              ),
            if (snapshot.connectionState != ConnectionState.done)
              const Center(child: CircularProgressIndicator()),
            if (snapshot.connectionState == ConnectionState.done && !available)
              Text(_loadFailure(snapshot.error)),
            if (snapshot.connectionState == ConnectionState.done && !available)
              TextButton(
                onPressed: _busy ? null : () => setState(_load),
                child: const Text('Retry policies'),
              ),
            if (available) ...[
              for (var index = 0; index < documents.length; index++) ...[
                Text(
                  documents[index]!['name'] as String,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                Text('Version ${index == 0 ? termsVersion : privacyVersion}'),
                if (documents[index]!['summary'] is String &&
                    (documents[index]!['summary'] as String).trim().isNotEmpty)
                  Text(documents[index]!['summary'] as String),
                if (documents[index]!['effectiveDate'] is String)
                  Text('Effective date: ${documents[index]!["effectiveDate"]}'),
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
                        try {
                          await widget.onAccept(termsVersion!, privacyVersion!);
                        } catch (_) {
                          // Unconfirmed submission failures never imply consent.
                          if (mounted) setState(_load);
                        } finally {
                          if (mounted) setState(() => _busy = false);
                        }
                      },
                child: const Text('Accept and continue'),
              ),
            ],
            TextButton(
              onPressed: _busy
                  ? null
                  : () async {
                      setState(() => _busy = true);
                      try {
                        await widget.onDecline();
                      } finally {
                        if (mounted) setState(() => _busy = false);
                      }
                    },
              child: const Text('Cancel sign-in'),
            ),
          ],
        );
      },
    ),
  );
}
