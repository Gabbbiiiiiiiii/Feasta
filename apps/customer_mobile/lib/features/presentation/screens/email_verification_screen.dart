import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../authentication/data/repositories/auth_repository.dart';
import 'login_screen.dart';

class EmailVerificationScreen extends StatefulWidget {
  final String email;

  const EmailVerificationScreen({
    super.key,
    required this.email,
  });

  @override
  State<EmailVerificationScreen> createState() =>
      _EmailVerificationScreenState();
}

class _EmailVerificationScreenState extends State<EmailVerificationScreen> {
  final AuthRepository _authRepository = AuthRepository();

  bool isResending = false;

  Future<void> _openGmail() async {
    final gmailUrl = Uri.parse(
      'https://mail.google.com/mail/u/0/#search/feasta-catering-system verify',
    );

    final fallbackUrl = Uri.parse('https://mail.google.com/');

    try {
      final opened = await launchUrl(
        gmailUrl,
        mode: LaunchMode.externalApplication,
      );

      if (!opened) {
        await launchUrl(
          fallbackUrl,
          mode: LaunchMode.externalApplication,
        );
      }
    } catch (_) {
      await launchUrl(
        fallbackUrl,
        mode: LaunchMode.externalApplication,
      );
    }
  }

  Future<void> _goToLogin() async {
    await _authRepository.logout();

    if (!mounted) return;

    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  Future<void> _resendVerificationEmail() async {
    setState(() => isResending = true);

    try {
      await _authRepository.sendCurrentUserEmailVerification();

      if (!mounted) return;

      _showMessage(
        'We sent another verification link to your email. Please check your inbox or spam folder.',
        isError: false,
      );
    } catch (e) {
      if (!mounted) return;

      _showMessage(
        'Unable to resend verification email. Please try again later.',
      );
    } finally {
      if (mounted) {
        setState(() => isResending = false);
      }
    }
  }

  void _showMessage(
    String message, {
    bool isError = true,
    VoidCallback? onClose,
  }) {
    showGeneralDialog(
      context: context,
      barrierDismissible: false,
      barrierLabel: 'Message',
      barrierColor: Colors.black.withValues(alpha: 0.25),
      transitionDuration: const Duration(milliseconds: 220),
      pageBuilder: (dialogContext, animation, secondaryAnimation) {
        return Center(
          child: Material(
            color: Colors.transparent,
            child: Container(
              width: MediaQuery.of(dialogContext).size.width * 0.84,
              padding: const EdgeInsets.fromLTRB(22, 24, 22, 18),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.12),
                    blurRadius: 24,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: isError
                          ? const Color(0xFFFFF1EB)
                          : const Color(0xFFEFFAF3),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      isError
                          ? Icons.info_outline_rounded
                          : Icons.check_circle_outline_rounded,
                      color: isError
                          ? const Color(0xFFFF6333)
                          : const Color(0xFF16A34A),
                      size: 36,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    isError ? 'Check your email' : 'Success',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Color(0xFF2B211D),
                      fontSize: 21,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    message,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Color(0xFF6B7280),
                      fontSize: 15,
                      height: 1.45,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 22),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.pop(dialogContext);
                        onClose?.call();
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: isError
                            ? const Color(0xFFFF6333)
                            : const Color(0xFF16A34A),
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      child: const Text(
                        'Okay',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 15,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
      transitionBuilder: (context, animation, secondaryAnimation, child) {
        return ScaleTransition(
          scale: CurvedAnimation(
            parent: animation,
            curve: Curves.easeOutBack,
          ),
          child: FadeTransition(
            opacity: animation,
            child: child,
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Scaffold(
      backgroundColor: const Color(0xFFF8F6F3),
      appBar: AppBar(
        title: const Text('Verify Email'),
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Center(
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: const Color(0xFFE8E1DB)),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 82,
                    height: 82,
                    decoration: BoxDecoration(
                      color: primary.withValues(alpha: 0.10),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.mark_email_unread_outlined,
                      color: primary,
                      size: 42,
                    ),
                  ),
                  const SizedBox(height: 22),
                  const Text(
                    'Verify your email',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'We sent a verification link to ${widget.email}. Open your email, tap the verification link, then return to Feasta.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.grey,
                      height: 1.45,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 26),
                  SizedBox(
                    width: double.infinity,
                    height: 54,
                    child: ElevatedButton.icon(
                      onPressed: _openGmail,
                      icon: const Icon(Icons.mail_outline_rounded),
                      label: const Text(
                        'Open Gmail',
                        style: TextStyle(fontWeight: FontWeight.w900),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    height: 54,
                    child: OutlinedButton(
                      onPressed: _goToLogin,
                      child: const Text(
                        'I already verified my email',
                        style: TextStyle(fontWeight: FontWeight.w900),
                        ),
                    ),
                  ),
                  
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed:
                        isResending ? null : _resendVerificationEmail,
                    child: isResending
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text(
                            'Resend verification email',
                            style: TextStyle(
                              color: primary,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
