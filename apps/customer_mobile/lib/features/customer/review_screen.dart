import 'package:flutter/material.dart';

import '../../core/constants/status_constants.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';

typedef ReviewExistsChecker = Future<bool> Function(String bookingId);

typedef ReviewSubmitter =
    Future<bool> Function({
      required BookingModel booking,
      required int rating,
      required String comment,
    });

class ReviewScreen extends StatefulWidget {
  const ReviewScreen({
    super.key,
    required this.booking,
    this.reviewExistsChecker,
    this.reviewSubmitter,
  });

  final BookingModel booking;

  final ReviewExistsChecker? reviewExistsChecker;
  final ReviewSubmitter? reviewSubmitter;

  @override
  State<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends State<ReviewScreen> {
  FeastaRepository? _repository;
  final TextEditingController commentController = TextEditingController();

  FeastaRepository get repository {
    return _repository ??= FeastaRepository();
  }

  int selectedRating = 5;

  bool isSubmitting = false;
  bool isCheckingEligibility = true;
  bool alreadyReviewed = false;

  @override
  void initState() {
    super.initState();
    _checkEligibility();
  }

  Future<void> _checkEligibility() async {
    if (widget.booking.status != BookingStatus.completed) {
      if (!mounted) {
        return;
      }

      setState(() {
        isCheckingEligibility = false;
      });

      return;
    }

    try {
      final exists =
          await (widget.reviewExistsChecker ?? repository.hasReviewedBooking)(
            widget.booking.id,
          );

      if (!mounted) {
        return;
      }

      setState(() {
        alreadyReviewed = exists;
        isCheckingEligibility = false;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        isCheckingEligibility = false;
      });
    }
  }

  Future<void> _submitReview() async {
    if (isSubmitting ||
        alreadyReviewed ||
        widget.booking.status != BookingStatus.completed) {
      return;
    }

    final comment = commentController.text.trim();

    if (comment.length < 2) {
      _showMessage('Please write a short review of at least 2 characters.');
      return;
    }

    if (comment.length > 2000) {
      _showMessage('Your review must not exceed 2000 characters.');
      return;
    }

    setState(() {
      isSubmitting = true;
    });

    try {
      final submitReview = widget.reviewSubmitter ?? repository.submitReview;

      final created = await submitReview(
        booking: widget.booking,
        rating: selectedRating,
        comment: comment,
      );

      if (!mounted) {
        return;
      }

      if (!created) {
        setState(() {
          alreadyReviewed = true;
        });

        return;
      }

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(content: Text('Review submitted successfully.')),
        );

      Navigator.pop(context);
    } catch (error) {
      if (!mounted) {
        return;
      }

      _showMessage(error.toString().replaceAll('Exception: ', ''));
    } finally {
      if (mounted) {
        setState(() {
          isSubmitting = false;
        });
      }
    }
  }

  void _showMessage(String message) {
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  void dispose() {
    commentController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bookingCompleted = widget.booking.status == BookingStatus.completed;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Text(
          alreadyReviewed ? 'Review' : 'Write Review',
          style: AppTypography.sectionTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      body: isCheckingEligibility
          ? const Center(child: CircularProgressIndicator())
          : !bookingCompleted
          ? const _ReviewUnavailableState(
              icon: Icons.event_busy_outlined,
              title: 'Review unavailable',
              message: 'Only completed bookings can be reviewed.',
            )
          : alreadyReviewed
          ? const _ReviewUnavailableState(
              icon: Icons.verified_rounded,
              title: 'Review submitted',
              message: 'You already submitted a review for this booking.',
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screen,
                AppSpacing.sm,
                AppSpacing.screen,
                120,
              ),
              children: [
                _BookingReviewHeader(booking: widget.booking),
                const SizedBox(height: AppSpacing.xl),
                Text(
                  'Your Rating',
                  style: AppTypography.sectionTitle.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                _RatingPicker(
                  value: selectedRating,
                  enabled: !isSubmitting,
                  onChanged: (value) {
                    setState(() {
                      selectedRating = value;
                    });
                  },
                ),
                const SizedBox(height: AppSpacing.sm),
                Center(
                  child: Text(
                    '$selectedRating out of 5',
                    style: AppTypography.bodySmall.copyWith(
                      color: AppColors.secondaryTextAccessible,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.xl),
                Text(
                  'Your Review',
                  style: AppTypography.sectionTitle.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                TextField(
                  controller: commentController,
                  enabled: !isSubmitting,
                  minLines: 5,
                  maxLines: 8,
                  maxLength: 2000,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(
                    hintText: 'Share your experience with this provider...',
                    filled: true,
                    fillColor: AppColors.surface,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppRadius.large),
                      borderSide: const BorderSide(color: AppColors.border),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppRadius.large),
                      borderSide: const BorderSide(color: AppColors.border),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppRadius.large),
                      borderSide: const BorderSide(
                        color: AppColors.primaryStrong,
                        width: 2,
                      ),
                    ),
                  ),
                ),
              ],
            ),
      bottomNavigationBar:
          isCheckingEligibility || !bookingCompleted || alreadyReviewed
          ? null
          : Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: const BoxDecoration(
                color: AppColors.surface,
                border: Border(top: BorderSide(color: AppColors.border)),
              ),
              child: SafeArea(
                top: false,
                child: FeastaPrimaryButton(
                  label: 'Submit Review',
                  icon: const Icon(Icons.star_rounded),
                  onPressed: isSubmitting ? null : _submitReview,
                  isLoading: isSubmitting,
                ),
              ),
            ),
    );
  }
}

class _BookingReviewHeader extends StatelessWidget {
  const _BookingReviewHeader({required this.booking});

  final BookingModel booking;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Review for',
            style: AppTypography.caption.copyWith(
              color: AppColors.secondaryTextAccessible,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            booking.providerBusinessName,
            style: AppTypography.sectionTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),
          if (booking.packageName.trim().isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xxs),
            Text(
              booking.packageName,
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _RatingPicker extends StatelessWidget {
  const _RatingPicker({
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  final int value;
  final bool enabled;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Review rating. $value out of 5 stars.',
      child: Wrap(
        alignment: WrapAlignment.center,
        spacing: AppSpacing.xs,
        runSpacing: AppSpacing.xs,
        children: List.generate(5, (index) {
          final starValue = index + 1;
          final selected = starValue <= value;

          return IconButton(
            tooltip: '$starValue star${starValue == 1 ? '' : 's'}',
            onPressed: enabled
                ? () {
                    onChanged(starValue);
                  }
                : null,
            icon: Icon(
              selected ? Icons.star_rounded : Icons.star_border_rounded,
              color: selected
                  ? const Color(0xFFF59E0B)
                  : AppColors.secondaryTextAccessible,
              size: 40,
            ),
          );
        }),
      ),
    );
  }
}

class _ReviewUnavailableState extends StatelessWidget {
  const _ReviewUnavailableState({
    required this.icon,
    required this.title,
    required this.message,
  });

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.screen),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: FeastaCard(
            padding: const EdgeInsets.all(AppSpacing.xl),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 76,
                  height: 76,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                    color: AppColors.primarySubtle,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(icon, color: AppColors.primaryStrong, size: 38),
                ),
                const SizedBox(height: AppSpacing.lg),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: AppTypography.sectionTitle.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
