import 'package:flutter/material.dart';

import '../../theme/app_spacing.dart';
import '../buttons/feasta_buttons.dart';

class FeastaConfirmationDialog extends StatelessWidget {
  const FeastaConfirmationDialog({
    required this.title,
    required this.message,
    required this.onConfirm,
    this.confirmLabel = 'Confirm',
    this.cancelLabel = 'Cancel',
    this.onCancel,
    this.isDestructive = false,
    this.isLoading = false,
    super.key,
  });

  final String title;
  final String message;
  final String confirmLabel;
  final String cancelLabel;
  final VoidCallback onConfirm;
  final VoidCallback? onCancel;
  final bool isDestructive;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final cancel = onCancel ?? () => Navigator.of(context).pop(false);
    final confirmButton = isDestructive
        ? FeastaDestructiveButton(
            label: confirmLabel,
            onPressed: onConfirm,
            isLoading: isLoading,
            width: FeastaButtonWidth.intrinsic,
            loadingLabel: 'Submitting',
          )
        : FeastaPrimaryButton(
            label: confirmLabel,
            onPressed: onConfirm,
            isLoading: isLoading,
            width: FeastaButtonWidth.intrinsic,
            loadingLabel: 'Submitting',
          );

    return Semantics(
      container: true,
      scopesRoute: true,
      namesRoute: true,
      label: title,
      explicitChildNodes: true,
      child: PopScope(
        canPop: !isLoading,
        child: AlertDialog(
          semanticLabel: title,
          title: Text(title),
          content: SingleChildScrollView(child: Text(message)),
          actionsPadding: const EdgeInsets.fromLTRB(
            AppSpacing.xl,
            AppSpacing.sm,
            AppSpacing.xl,
            AppSpacing.xl,
          ),
          actions: [
            FocusTraversalOrder(
              order: const NumericFocusOrder(1),
              child: FeastaTextButton(
                label: cancelLabel,
                onPressed: isLoading ? null : cancel,
              ),
            ),
            FocusTraversalOrder(
              order: const NumericFocusOrder(2),
              child: confirmButton,
            ),
          ],
        ),
      ),
    );
  }
}

Future<bool?> showFeastaConfirmationDialog({
  required BuildContext context,
  required String title,
  required String message,
  String confirmLabel = 'Confirm',
  String cancelLabel = 'Cancel',
  bool isDestructive = false,
}) {
  return showDialog<bool>(
    context: context,
    builder: (dialogContext) => FeastaConfirmationDialog(
      title: title,
      message: message,
      confirmLabel: confirmLabel,
      cancelLabel: cancelLabel,
      isDestructive: isDestructive,
      onConfirm: () => Navigator.of(dialogContext).pop(true),
    ),
  );
}
