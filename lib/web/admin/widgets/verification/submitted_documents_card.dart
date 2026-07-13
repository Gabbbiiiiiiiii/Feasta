import 'package:flutter/material.dart';

import '../../models/verification/provider_verification.dart';
import 'verification_document_tile.dart';

class SubmittedDocumentsCard extends StatelessWidget {
  final List<VerificationDocumentData> documents;
  final bool isProcessing;
  final ValueChanged<VerificationDocumentData> onPreview;
  final ValueChanged<VerificationDocumentData> onDownload;
  final ValueChanged<VerificationDocumentData> onVerify;
  final ValueChanged<VerificationDocumentData> onMarkInvalid;

  const SubmittedDocumentsCard({
    super.key,
    required this.documents,
    required this.onPreview,
    required this.onDownload,
    required this.onVerify,
    required this.onMarkInvalid,
    this.isProcessing = false,
  });

  int get _requiredCount {
    return documents.where((document) => document.isRequired).length;
  }

  int get _verifiedRequiredCount {
    return documents.where((document) {
      return document.isRequired &&
          document.status == VerificationDocumentStatus.verified;
    }).length;
  }

  int get _verifiedCount {
    return documents.where((document) {
      return document.status == VerificationDocumentStatus.verified;
    }).length;
  }

  int get _invalidCount {
    return documents.where((document) {
      return document.status == VerificationDocumentStatus.invalid;
    }).length;
  }

  int get _missingCount {
    return documents.where((document) {
      return document.status == VerificationDocumentStatus.missing;
    }).length;
  }

  bool get _allRequiredDocumentsVerified {
    if (_requiredCount == 0) {
      return true;
    }

    return _requiredCount == _verifiedRequiredCount;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(17),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: const Color(0xFFE5E7EB),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _DocumentsHeader(
            totalCount: documents.length,
            verifiedCount: _verifiedCount,
            invalidCount: _invalidCount,
            missingCount: _missingCount,
          ),
          const SizedBox(height: 15),
          _DocumentProgress(
            verifiedRequiredCount: _verifiedRequiredCount,
            requiredCount: _requiredCount,
            allRequiredDocumentsVerified:
                _allRequiredDocumentsVerified,
          ),
          const SizedBox(height: 16),
          if (documents.isEmpty)
            const _DocumentsEmptyState()
          else
            Column(
              children: [
                for (var index = 0;
                    index < documents.length;
                    index++) ...[
                  VerificationDocumentTile(
                    document: documents[index],
                    isProcessing: isProcessing,
                    onPreview: () => onPreview(documents[index]),
                    onDownload: () => onDownload(documents[index]),
                    onVerify: () => onVerify(documents[index]),
                    onMarkInvalid: () =>
                        onMarkInvalid(documents[index]),
                  ),
                  if (index != documents.length - 1)
                    const SizedBox(height: 10),
                ],
              ],
            ),
          const SizedBox(height: 15),
          _ApprovalReadinessMessage(
            allRequiredDocumentsVerified:
                _allRequiredDocumentsVerified,
            invalidCount: _invalidCount,
            missingCount: _missingCount,
          ),
        ],
      ),
    );
  }
}

class _DocumentsHeader extends StatelessWidget {
  final int totalCount;
  final int verifiedCount;
  final int invalidCount;
  final int missingCount;

  const _DocumentsHeader({
    required this.totalCount,
    required this.verifiedCount,
    required this.invalidCount,
    required this.missingCount,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 520;

        final title = const Row(
          children: [
            Icon(
              Icons.description_outlined,
              size: 19,
              color: Color(0xFF374151),
            ),
            SizedBox(width: 8),
            Text(
              'Submitted Documents',
              style: TextStyle(
                color: Color(0xFF111827),
                fontSize: 15,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        );

        final summary = Wrap(
          spacing: 7,
          runSpacing: 7,
          children: [
            _DocumentCountBadge(
              label: '$verifiedCount verified',
              foregroundColor: const Color(0xFF15803D),
              backgroundColor: const Color(0xFFDCFCE7),
            ),
            if (invalidCount > 0)
              _DocumentCountBadge(
                label: '$invalidCount invalid',
                foregroundColor: const Color(0xFFDC2626),
                backgroundColor: const Color(0xFFFEE2E2),
              ),
            if (missingCount > 0)
              _DocumentCountBadge(
                label: '$missingCount missing',
                foregroundColor: const Color(0xFFD97706),
                backgroundColor: const Color(0xFFFFF3C4),
              ),
            _DocumentCountBadge(
              label: '$totalCount total',
              foregroundColor: const Color(0xFF4B5563),
              backgroundColor: const Color(0xFFF3F4F6),
            ),
          ],
        );

        if (compact) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              title,
              const SizedBox(height: 11),
              summary,
            ],
          );
        }

        return Row(
          children: [
            Expanded(child: title),
            const SizedBox(width: 12),
            summary,
          ],
        );
      },
    );
  }
}

class _DocumentProgress extends StatelessWidget {
  final int verifiedRequiredCount;
  final int requiredCount;
  final bool allRequiredDocumentsVerified;

  const _DocumentProgress({
    required this.verifiedRequiredCount,
    required this.requiredCount,
    required this.allRequiredDocumentsVerified,
  });

  @override
  Widget build(BuildContext context) {
    final progress = requiredCount == 0
        ? 1.0
        : verifiedRequiredCount / requiredCount;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF9FAFB),
        borderRadius: BorderRadius.circular(11),
        border: Border.all(
          color: const Color(0xFFE5E7EB),
        ),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Required document review',
                  style: const TextStyle(
                    color: Color(0xFF374151),
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              Text(
                '$verifiedRequiredCount of $requiredCount verified',
                style: TextStyle(
                  color: allRequiredDocumentsVerified
                      ? const Color(0xFF15803D)
                      : const Color(0xFFD97706),
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 9),
          ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: LinearProgressIndicator(
              value: progress.clamp(0, 1),
              minHeight: 7,
              backgroundColor: const Color(0xFFE5E7EB),
              valueColor: AlwaysStoppedAnimation<Color>(
                allRequiredDocumentsVerified
                    ? const Color(0xFF16A34A)
                    : const Color(0xFFFF6333),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ApprovalReadinessMessage extends StatelessWidget {
  final bool allRequiredDocumentsVerified;
  final int invalidCount;
  final int missingCount;

  const _ApprovalReadinessMessage({
    required this.allRequiredDocumentsVerified,
    required this.invalidCount,
    required this.missingCount,
  });

  @override
  Widget build(BuildContext context) {
    final canApprove = allRequiredDocumentsVerified &&
        invalidCount == 0 &&
        missingCount == 0;

    final Color backgroundColor;
    final Color borderColor;
    final Color foregroundColor;
    final IconData icon;
    final String message;

    if (canApprove) {
      backgroundColor = const Color(0xFFF0FDF4);
      borderColor = const Color(0xFFBBF7D0);
      foregroundColor = const Color(0xFF15803D);
      icon = Icons.verified_rounded;
      message =
          'All required documents have been verified. This application is ready for an approval decision.';
    } else if (invalidCount > 0) {
      backgroundColor = const Color(0xFFFEF2F2);
      borderColor = const Color(0xFFFECACA);
      foregroundColor = const Color(0xFFB91C1C);
      icon = Icons.error_outline_rounded;
      message =
          'This application contains invalid documents. Approval should remain disabled until the provider submits corrected files.';
    } else if (missingCount > 0) {
      backgroundColor = const Color(0xFFFFFBEB);
      borderColor = const Color(0xFFFDE68A);
      foregroundColor = const Color(0xFFB45309);
      icon = Icons.warning_amber_rounded;
      message =
          'Required documents are missing. The provider must complete the document submission before approval.';
    } else {
      backgroundColor = const Color(0xFFEFF6FF);
      borderColor = const Color(0xFFBFDBFE);
      foregroundColor = const Color(0xFF1D4ED8);
      icon = Icons.info_outline_rounded;
      message =
          'Document review is still in progress. Verify every required document before approving this provider.';
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: borderColor),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            icon,
            size: 18,
            color: foregroundColor,
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: foregroundColor,
                fontSize: 11.8,
                fontWeight: FontWeight.w600,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DocumentCountBadge extends StatelessWidget {
  final String label;
  final Color foregroundColor;
  final Color backgroundColor;

  const _DocumentCountBadge({
    required this.label,
    required this.foregroundColor,
    required this.backgroundColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 8,
        vertical: 5,
      ),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(7),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: foregroundColor,
          fontSize: 10.5,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _DocumentsEmptyState extends StatelessWidget {
  const _DocumentsEmptyState();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: 24,
        vertical: 34,
      ),
      decoration: BoxDecoration(
        color: const Color(0xFFF9FAFB),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: const Color(0xFFE5E7EB),
        ),
      ),
      child: const Column(
        children: [
          Icon(
            Icons.folder_off_outlined,
            size: 38,
            color: Color(0xFFCBD5E1),
          ),
          SizedBox(height: 11),
          Text(
            'No documents submitted',
            style: TextStyle(
              color: Color(0xFF374151),
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
          SizedBox(height: 5),
          Text(
            'The provider has not uploaded any verification documents.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Color(0xFF6B7280),
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}