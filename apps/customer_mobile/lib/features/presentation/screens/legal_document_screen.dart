import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';

enum FeastaLegalDocument { termsOfService, privacyPolicy }

typedef LegalDocumentLoader =
    Future<Map<String, dynamic>?> Function(FeastaLegalDocument document);

Future<Map<String, dynamic>?> loadCurrentLegalDocument(
  FeastaLegalDocument document,
) async {
  final result = await FirebaseFunctions.instanceFor(region: 'asia-southeast1')
      .httpsCallable('getCurrentLegalAgreement')
      .call<Map<String, dynamic>>({
        'purpose': document == FeastaLegalDocument.termsOfService
            ? 'platform_terms'
            : 'privacy_notice',
      });
  final agreement = result.data['agreement'];
  return agreement is Map ? Map<String, dynamic>.from(agreement) : null;
}

class LegalDocumentScreen extends StatefulWidget {
  const LegalDocumentScreen({
    required this.document,
    this.loader = loadCurrentLegalDocument,
    super.key,
  });

  final FeastaLegalDocument document;
  final LegalDocumentLoader loader;

  @override
  State<LegalDocumentScreen> createState() => _LegalDocumentScreenState();
}

class _LegalDocumentScreenState extends State<LegalDocumentScreen> {
  late Future<Map<String, dynamic>?> _agreement;

  bool get _isTerms => widget.document == FeastaLegalDocument.termsOfService;
  String get _title => _isTerms ? 'Terms of Service' : 'Privacy Policy';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant LegalDocumentScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.document != widget.document ||
        oldWidget.loader != widget.loader) {
      _load();
    }
  }

  void _load() {
    _agreement = Future.sync(() => widget.loader(widget.document));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.mainText,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          tooltip: 'Close $_title',
          onPressed: () => Navigator.pop(context),
          icon: const Icon(Icons.close_rounded),
        ),
        title: Text(_title),
      ),
      body: SafeArea(
        child: FutureBuilder<Map<String, dynamic>?>(
          future: _agreement,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            final agreement = snapshot.data;
            if (snapshot.hasError || !_validAgreement(agreement)) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.xl),
                  child: Text(
                    _isTerms
                        ? 'Terms of Service are currently unavailable.'
                        : 'Privacy Policy is currently unavailable.',
                  ),
                ),
              );
            }
            return SelectionArea(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(AppSpacing.xl),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 720),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          agreement!['name'] as String,
                          style: AppTypography.pageTitle,
                        ),
                        const SizedBox(height: AppSpacing.md),
                        if (agreement['summary'] is String &&
                            (agreement['summary'] as String).isNotEmpty) ...[
                          Text(
                            agreement['summary'] as String,
                            style: AppTypography.body,
                          ),
                          const SizedBox(height: AppSpacing.md),
                        ],
                        Text('Version ${agreement['version']}'),
                        Text('Effective date: ${agreement['effectiveDate']}'),
                        for (final section
                            in agreement['sections'] as List) ...[
                          const SizedBox(height: AppSpacing.xl),
                          Text(
                            section['title'] as String,
                            style: AppTypography.sectionTitle,
                          ),
                          for (final paragraph
                              in section['paragraphs'] as List) ...[
                            const SizedBox(height: AppSpacing.md),
                            Text(
                              paragraph as String,
                              style: AppTypography.body,
                            ),
                          ],
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

bool _validAgreement(Map<String, dynamic>? agreement) {
  if (agreement == null ||
      agreement['name'] is! String ||
      agreement['version'] is! String ||
      agreement['effectiveDate'] is! String ||
      agreement['sections'] is! List) {
    return false;
  }
  final sections = agreement['sections'] as List;
  return sections.isNotEmpty &&
      sections.every(
        (section) =>
            section is Map &&
            section['title'] is String &&
            section['paragraphs'] is List &&
            (section['paragraphs'] as List).every(
              (paragraph) => paragraph is String,
            ),
      );
}
