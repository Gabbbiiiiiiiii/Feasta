import 'package:flutter/material.dart';

import '../../models/feasta_models.dart';
import '../../repositories/feasta_repository.dart';

class ReviewScreen extends StatefulWidget {
  final BookingModel booking;

  const ReviewScreen({
    super.key,
    required this.booking,
  });

  @override
  State<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends State<ReviewScreen> {
  final FeastaRepository repository = FeastaRepository();
  final TextEditingController commentController = TextEditingController();

  int selectedRating = 5;
  bool isSubmitting = false;

  Future<void> _submitReview() async {
    final comment = commentController.text.trim();

    if (comment.isEmpty) {
      _showMessage('Please write a short review.');
      return;
    }

    setState(() => isSubmitting = true);

    try {
      await repository.submitReview(
        booking: widget.booking,
        rating: selectedRating,
        comment: comment,
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Review submitted successfully.'),
        ),
      );

      Navigator.pop(context);
    } catch (e) {
      _showMessage(e.toString().replaceAll('Exception: ', ''));
    } finally {
      if (mounted) {
        setState(() => isSubmitting = false);
      }
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  void dispose() {
    commentController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Write Review',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(22),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: const Color(0xFFE5E7EB)),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Review For',
                  style: TextStyle(
                    color: Colors.grey,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  widget.booking.providerBusinessName,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  widget.booking.packageName,
                  style: const TextStyle(color: Colors.grey),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          const Text(
            'Your Rating',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (index) {
              final starValue = index + 1;
              final selected = starValue <= selectedRating;

              return IconButton(
                onPressed: () {
                  setState(() {
                    selectedRating = starValue;
                  });
                },
                icon: Icon(
                  selected ? Icons.star : Icons.star_border,
                  color: Colors.amber,
                  size: 42,
                ),
              );
            }),
          ),
          const SizedBox(height: 12),
          Center(
            child: Text(
              '$selectedRating out of 5',
              style: const TextStyle(
                color: Colors.grey,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 28),
          const Text(
            'Your Review',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: commentController,
            maxLines: 6,
            decoration: const InputDecoration(
              hintText: 'Share your experience with this provider...',
            ),
          ),
          const SizedBox(height: 100),
        ],
      ),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.all(18),
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(
            top: BorderSide(color: Color(0xFFE5E7EB)),
          ),
        ),
        child: SafeArea(
          child: SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton(
              onPressed: isSubmitting ? null : _submitReview,
              style: ElevatedButton.styleFrom(
                backgroundColor: primary,
                foregroundColor: Colors.white,
              ),
              child: isSubmitting
                  ? const CircularProgressIndicator(color: Colors.white)
                  : const Text(
                      'Submit Review',
                      style: TextStyle(fontWeight: FontWeight.w900),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}