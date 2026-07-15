import 'package:flutter/material.dart';

import '../../models/verification/provider_verification.dart';

class VerificationDocumentTile extends StatelessWidget {
  final VerificationDocumentData document;
  final bool isProcessing;
  final VoidCallback? onPreview;
  final VoidCallback? onDownload;
  final VoidCallback? onVerify;
  final VoidCallback? onMarkInvalid;

  const VerificationDocumentTile({
    super.key,
    required this.document,
    this.isProcessing = false,
    this.onPreview,
    this.onDownload,
    this.onVerify,
    this.onMarkInvalid,
  });

  bool get _hasUploadedFile {
    return document.status != VerificationDocumentStatus.missing &&
        document.fileName.trim().isNotEmpty;
  }

  @override
  Widget build(BuildContext context) {
    final visual = _DocumentStatusVisual.fromStatus(document.status);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: document.status == VerificationDocumentStatus.invalid
            ? const Color(0xFFFFFBFB)
            : const Color(0xFFF9FAFB),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: document.status == VerificationDocumentStatus.invalid
              ? const Color(0xFFFECACA)
              : document.status == VerificationDocumentStatus.missing
                  ? const Color(0xFFFDE68A)
                  : const Color(0xFFE5E7EB),
        ),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final stackActions = constraints.maxWidth < 640;

          final documentInfo = _DocumentInformation(
            document: document,
            visual: visual,
          );

          final actions = _DocumentActions(
            document: document,
            isProcessing: isProcessing,
            hasUploadedFile: _hasUploadedFile,
            onPreview: onPreview,
            onDownload: onDownload,
            onVerify: onVerify,
            onMarkInvalid: onMarkInvalid,
          );

          if (stackActions) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                documentInfo,
                const SizedBox(height: 13),
                SizedBox(
                  width: double.infinity,
                  child: actions,
                ),
              ],
            );
          }

          return Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(child: documentInfo),
              const SizedBox(width: 14),
              actions,
            ],
          );
        },
      ),
    );
  }
}

class _DocumentInformation extends StatelessWidget {
  final VerificationDocumentData document;
  final _DocumentStatusVisual visual;

  const _DocumentInformation({
    required this.document,
    required this.visual,
  });

  bool get _isMissing {
    return document.status == VerificationDocumentStatus.missing;
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            color: _isMissing
                ? const Color(0xFFFFF7E0)
                : const Color(0xFFEFF6FF),
            borderRadius: BorderRadius.circular(11),
          ),
          child: Icon(
            _isMissing
                ? Icons.upload_file_outlined
                : Icons.picture_as_pdf_outlined,
            color: _isMissing
                ? const Color(0xFFD97706)
                : const Color(0xFF2563EB),
            size: 22,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 7,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    document.title,
                    style: const TextStyle(
                      color: Color(0xFF1F2937),
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (document.isRequired)
                    const _RequiredBadge(),
                  _DocumentStatusBadge(visual: visual),
                ],
              ),
              const SizedBox(height: 5),
              Text(
                _isMissing
                    ? 'No document has been uploaded.'
                    : '${document.fileName}  •  ${document.fileSize}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: _isMissing
                      ? const Color(0xFFD97706)
                      : const Color(0xFF9CA3AF),
                  fontSize: 11.5,
                  fontWeight:
                      _isMissing ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
              if (document.uploadedAt?.trim().isNotEmpty == true) ...[
                const SizedBox(height: 5),
                Text(
                  'Uploaded ${document.uploadedAt}',
                  style: const TextStyle(
                    color: Color(0xFF9CA3AF),
                    fontSize: 11,
                  ),
                ),
              ],
              if (document.reviewNote?.trim().isNotEmpty == true) ...[
                const SizedBox(height: 8),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: document.status ==
                            VerificationDocumentStatus.invalid
                        ? const Color(0xFFFEF2F2)
                        : const Color(0xFFF3F4F6),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    document.reviewNote!,
                    style: TextStyle(
                      color: document.status ==
                              VerificationDocumentStatus.invalid
                          ? const Color(0xFFB91C1C)
                          : const Color(0xFF4B5563),
                      fontSize: 11.5,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
              if (document.reviewedBy?.trim().isNotEmpty == true) ...[
                const SizedBox(height: 6),
                Text(
                  'Reviewed by ${document.reviewedBy}'
                  '${document.reviewedAt?.trim().isNotEmpty == true ? ' · ${document.reviewedAt}' : ''}',
                  style: const TextStyle(
                    color: Color(0xFF9CA3AF),
                    fontSize: 10.5,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _DocumentActions extends StatelessWidget {
  final VerificationDocumentData document;
  final bool isProcessing;
  final bool hasUploadedFile;
  final VoidCallback? onPreview;
  final VoidCallback? onDownload;
  final VoidCallback? onVerify;
  final VoidCallback? onMarkInvalid;

  const _DocumentActions({
    required this.document,
    required this.isProcessing,
    required this.hasUploadedFile,
    required this.onPreview,
    required this.onDownload,
    required this.onVerify,
    required this.onMarkInvalid,
  });

  bool get _isVerified {
    return document.status == VerificationDocumentStatus.verified;
  }

  bool get _isMissing {
    return document.status == VerificationDocumentStatus.missing;
  }

  @override
  Widget build(BuildContext context) {
    return Wrap(
      alignment: WrapAlignment.end,
      spacing: 7,
      runSpacing: 7,
      children: [
        IconButton.outlined(
          tooltip: 'Preview document',
          onPressed: isProcessing || !hasUploadedFile
              ? null
              : onPreview,
          icon: const Icon(
            Icons.visibility_outlined,
            size: 18,
          ),
        ),
        IconButton.outlined(
          tooltip: 'Download document',
          onPressed: isProcessing || !hasUploadedFile
              ? null
              : onDownload,
          icon: const Icon(
            Icons.download_rounded,
            size: 18,
          ),
        ),
        if (!_isMissing)
          OutlinedButton.icon(
            onPressed: isProcessing || _isVerified
                ? null
                : onMarkInvalid,
            icon: const Icon(
              Icons.close_rounded,
              size: 16,
            ),
            label: const Text('Invalid'),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFFDC2626),
              side: const BorderSide(
                color: Color(0xFFFCA5A5),
              ),
              padding: const EdgeInsets.symmetric(
                horizontal: 11,
                vertical: 12,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(9),
              ),
            ),
          ),
        if (!_isMissing)
          FilledButton.icon(
            onPressed: isProcessing || _isVerified
                ? null
                : onVerify,
            icon: isProcessing
                ? const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(
                    Icons.check_rounded,
                    size: 16,
                  ),
            label: Text(
              _isVerified ? 'Verified' : 'Verify',
            ),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF16A34A),
              foregroundColor: Colors.white,
              disabledBackgroundColor: _isVerified
                  ? const Color(0xFFDCFCE7)
                  : const Color(0xFFF3F4F6),
              disabledForegroundColor: _isVerified
                  ? const Color(0xFF15803D)
                  : const Color(0xFF9CA3AF),
              padding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 12,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(9),
              ),
            ),
          ),
      ],
    );
  }
}

class _DocumentStatusBadge extends StatelessWidget {
  final _DocumentStatusVisual visual;

  const _DocumentStatusBadge({
    required this.visual,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 8,
        vertical: 4,
      ),
      decoration: BoxDecoration(
        color: visual.backgroundColor,
        borderRadius: BorderRadius.circular(7),
      ),
      child: Text(
        visual.label,
        style: TextStyle(
          color: visual.foregroundColor,
          fontSize: 10.5,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _RequiredBadge extends StatelessWidget {
  const _RequiredBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 7,
        vertical: 4,
      ),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF1EC),
        borderRadius: BorderRadius.circular(7),
      ),
      child: const Text(
        'Required',
        style: TextStyle(
          color: Color(0xFFFF6333),
          fontSize: 10,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _DocumentStatusVisual {
  final String label;
  final Color foregroundColor;
  final Color backgroundColor;

  const _DocumentStatusVisual({
    required this.label,
    required this.foregroundColor,
    required this.backgroundColor,
  });

  factory _DocumentStatusVisual.fromStatus(
    VerificationDocumentStatus status,
  ) {
    return switch (status) {
      VerificationDocumentStatus.pending =>
        const _DocumentStatusVisual(
          label: 'Pending Review',
          foregroundColor: Color(0xFFD97706),
          backgroundColor: Color(0xFFFFF7E0),
        ),
      VerificationDocumentStatus.verified =>
        const _DocumentStatusVisual(
          label: 'Verified',
          foregroundColor: Color(0xFF15803D),
          backgroundColor: Color(0xFFDCFCE7),
        ),
      VerificationDocumentStatus.invalid =>
        const _DocumentStatusVisual(
          label: 'Invalid',
          foregroundColor: Color(0xFFDC2626),
          backgroundColor: Color(0xFFFEE2E2),
        ),
      VerificationDocumentStatus.missing =>
        const _DocumentStatusVisual(
          label: 'Missing',
          foregroundColor: Color(0xFFD97706),
          backgroundColor: Color(0xFFFFF3C4),
        ),
    };
  }
}