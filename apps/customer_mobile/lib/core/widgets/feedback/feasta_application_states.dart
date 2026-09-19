import 'package:flutter/material.dart';

import '../../theme/app_radius.dart';
import '../../theme/app_spacing.dart';
import 'feasta_loading.dart';
import 'feasta_states.dart';

enum FeastaErrorKind {
  load,
  permissionDenied,
  connectivity,
  server,
  invalidSubmission,
  sessionExpired,
}

class FeastaErrorCopy {
  const FeastaErrorCopy(this.title, this.message);

  final String title;
  final String message;
}

FeastaErrorCopy feastaErrorCopy(FeastaErrorKind kind) {
  return switch (kind) {
    FeastaErrorKind.load => const FeastaErrorCopy(
      'We could not load this content',
      'Please try again. Your existing information has not been changed.',
    ),
    FeastaErrorKind.permissionDenied => const FeastaErrorCopy(
      'You do not have access',
      'Use an account with permission to view this content.',
    ),
    FeastaErrorKind.connectivity => const FeastaErrorCopy(
      'You appear to be offline',
      'Check your connection, then try again.',
    ),
    FeastaErrorKind.server => const FeastaErrorCopy(
      'FEASTA is temporarily unavailable',
      'Please wait a moment and try again.',
    ),
    FeastaErrorKind.invalidSubmission => const FeastaErrorCopy(
      'Some details need your attention',
      'Review the highlighted fields and submit again.',
    ),
    FeastaErrorKind.sessionExpired => const FeastaErrorCopy(
      'Your session has expired',
      'Sign in again to continue securely.',
    ),
  };
}

class FeastaApplicationErrorState extends StatelessWidget {
  const FeastaApplicationErrorState({
    required this.kind,
    this.message,
    this.onRetry,
    this.retryLabel,
    super.key,
  });

  final FeastaErrorKind kind;
  final String? message;
  final VoidCallback? onRetry;
  final String? retryLabel;

  @override
  Widget build(BuildContext context) {
    final copy = feastaErrorCopy(kind);
    return FeastaErrorState(
      title: copy.title,
      message: message ?? copy.message,
      onRetry: onRetry,
      retryLabel:
          retryLabel ??
          (kind == FeastaErrorKind.sessionExpired ? 'Sign in' : 'Try again'),
    );
  }
}

class FeastaFullPageLoading extends StatelessWidget {
  const FeastaFullPageLoading({this.label = 'Loading page', super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(child: FeastaLoadingIndicator(label: label));
  }
}

class FeastaSectionLoading extends StatelessWidget {
  const FeastaSectionLoading({this.label = 'Loading section', super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.xl),
      child: Center(child: FeastaLoadingIndicator(label: label)),
    );
  }
}

class FeastaListSkeleton extends StatelessWidget {
  const FeastaListSkeleton({
    this.itemCount = 4,
    this.showImage = false,
    this.padding = const EdgeInsets.all(AppSpacing.xl),
    super.key,
  });

  final int itemCount;
  final bool showImage;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: padding,
      itemCount: itemCount,
      separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
      itemBuilder: (_, index) => Semantics(
        label: index == 0 ? 'Loading list' : null,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (showImage) ...[
              const FeastaSkeleton(
                height: 168,
                borderRadius: AppRadius.card,
                semanticLabel: 'Loading image',
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
            const FeastaSkeleton(height: 20, width: 210),
            const SizedBox(height: AppSpacing.sm),
            const FeastaSkeleton(height: 14),
            const SizedBox(height: AppSpacing.xs),
            const FeastaSkeleton(height: 14, width: 150),
          ],
        ),
      ),
    );
  }
}
