import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:pinput/pinput.dart';
import 'package:flutter/services.dart';

import '../../core/constants/firestore_collections.dart';
import 'customer_main_screen.dart';

class PhoneVerificationScreen extends StatefulWidget {
  const PhoneVerificationScreen({super.key});

  @override
  State<PhoneVerificationScreen> createState() =>
      _PhoneVerificationScreenState();
}

class _PhoneVerificationScreenState extends State<PhoneVerificationScreen> {
  final TextEditingController phoneController = TextEditingController();
  final TextEditingController otpController = TextEditingController();

  bool isLoading = false;
  bool isOtpSent = false;

  String? verificationId;
  int? resendToken;

  String? phoneError;
  String? otpError;
  String? generalError;
  String? successMessage;

  static const Color primary = Color(0xFFFF6333);
  static const Color background = Color(0xFFF8F6F3);
  static const Color textDark = Color(0xFF2B211D);
  static const Color textSoft = Color(0xFF8C817A);
  static const Color borderColor = Color(0xFFE3DAD4);

  @override
  void dispose() {
    phoneController.dispose();
    otpController.dispose();
    super.dispose();
  }

  String? _normalizePhilippinePhone(String phone) {
    final cleaned = phone.replaceAll(RegExp(r'\D'), '');

    // Example: 9123456789. The UI already shows +63.
    if (RegExp(r'^9\d{9}$').hasMatch(cleaned)) {
      return '+63$cleaned';
    }

    return null;
  }

  void _clearMessages() {
    setState(() {
      phoneError = null;
      otpError = null;
      generalError = null;
      successMessage = null;
    });
  }

  Future<void> _sendOtp() async {
    FocusScope.of(context).unfocus();
    _clearMessages();

    final normalizedPhone = _normalizePhilippinePhone(phoneController.text);

    if (normalizedPhone == null) {
      setState(() {
        phoneError = 'Enter the 10 digits after +63. Example: 9120453171.';
      });
      return;
    }

    final currentUser = FirebaseAuth.instance.currentUser;

    if (currentUser == null) {
      setState(() {
        generalError = 'No logged-in user found. Please log in again.';
      });
      return;
    }

    setState(() {
      isLoading = true;
    });

    try {
      await FirebaseAuth.instance.verifyPhoneNumber(
        phoneNumber: normalizedPhone,
        timeout: const Duration(seconds: 60),
        forceResendingToken: resendToken,
        verificationCompleted: (PhoneAuthCredential credential) async {
          await _verifyCredential(
            credential: credential,
            phoneNumber: normalizedPhone,
          );
        },
        verificationFailed: (FirebaseAuthException e) {
          debugPrint('PHONE AUTH ERROR CODE: ${e.code}');
          debugPrint('PHONE AUTH ERROR MESSAGE: ${e.message}');

          if (!mounted) return;

          setState(() {
            isLoading = false;
            generalError = _friendlyPhoneError(e);
          });
        },
        codeSent: (String id, int? token) {
          if (!mounted) return;

          setState(() {
            verificationId = id;
            resendToken = token;
            isOtpSent = true;
            isLoading = false;
            successMessage =
                'We sent a verification code to your mobile number.';
          });
        },
        codeAutoRetrievalTimeout: (String id) {
          verificationId = id;
        },
      );
    } catch (e) {
      if (!mounted) return;

      setState(() {
        isLoading = false;
        generalError = _friendlyGeneralError(e.toString());
      });
    }
  }

  Future<void> _verifyOtp() async {
    FocusScope.of(context).unfocus();
    _clearMessages();

    final normalizedPhone = _normalizePhilippinePhone(phoneController.text);
    final code = otpController.text.trim();

    if (normalizedPhone == null) {
      setState(() {
        phoneError = 'Enter the 10 digits after +63. Example: 9120453171.';
      });
      return;
    }

    if (verificationId == null) {
      setState(() {
        otpError = 'Please request an OTP first.';
      });
      return;
    }

    if (code.length != 6) {
      setState(() {
        otpError = 'Enter the 6-digit verification code.';
      });
      return;
    }

    setState(() {
      isLoading = true;
    });

    try {
      final credential = PhoneAuthProvider.credential(
        verificationId: verificationId!,
        smsCode: code,
      );

      await _verifyCredential(
        credential: credential,
        phoneNumber: normalizedPhone,
      );
    } catch (e) {
      if (!mounted) return;

      setState(() {
        isLoading = false;
        generalError = _friendlyGeneralError(e.toString());
      });
    }
  }

  Future<void> _verifyCredential({
    required PhoneAuthCredential credential,
    required String phoneNumber,
  }) async {
    final currentUser = FirebaseAuth.instance.currentUser;

    if (currentUser == null) {
      throw Exception('No logged-in user found. Please log in again.');
    }

    try {
      await currentUser.linkWithCredential(credential);
    } on FirebaseAuthException catch (e) {
      if (e.code == 'provider-already-linked') {
        // Account already has phone provider linked. Continue updating Firestore.
      } else if (e.code == 'credential-already-in-use') {
        throw Exception(
          'This phone number is already linked to another account.',
        );
      } else {
        throw Exception(_friendlyPhoneError(e));
      }
    }

    await FirebaseFirestore.instance
        .collection(FirestoreCollections.users)
        .doc(currentUser.uid)
        .update({
      'phoneNumber': phoneNumber,
      'isPhoneVerified': true,
      'updatedAt': FieldValue.serverTimestamp(),
    });

    await FirebaseFirestore.instance
        .collection(FirestoreCollections.customers)
        .doc(currentUser.uid)
        .update({
      'phoneNumber': phoneNumber,
      'updatedAt': FieldValue.serverTimestamp(),
    });

    if (!mounted) return;

    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(
        builder: (_) => const CustomerMainScreen(),
      ),
      (_) => false,
    );
  }

  String _friendlyPhoneError(FirebaseAuthException e) {
    if (e.code == 'invalid-phone-number') {
      return 'The phone number format is invalid.';
    }

    if (e.code == 'too-many-requests') {
      return 'Too many OTP requests. Please wait and try again later.';
    }

    if (e.code == 'quota-exceeded') {
      return 'SMS quota exceeded. Please try again later.';
    }

    if (e.code == 'invalid-verification-code') {
      return 'The OTP code is incorrect.';
    }

    if (e.code == 'session-expired') {
      return 'The OTP session expired. Please request a new code.';
    }

    if (e.code == 'captcha-check-failed' ||
        e.code == 'app-not-authorized' ||
        e.code == 'web-context-cancelled') {
      return 'Firebase could not complete the phone verification check. Try again using Chrome with cookies and storage enabled.';
    }

    return e.message ?? 'Phone verification failed. Please try again.';
  }

  String _friendlyGeneralError(String message) {
    final lower = message.toLowerCase();

    if (lower.contains('invalid-verification-code')) {
      return 'The OTP code is incorrect.';
    }

    if (lower.contains('session-expired')) {
      return 'The OTP session expired. Please request a new code.';
    }

    if (lower.contains('already linked') ||
        lower.contains('already linked to another account')) {
      return 'This phone number is already linked to another account.';
    }

    if (lower.contains('missing initial state') ||
        lower.contains('sessionstorage') ||
        lower.contains('captcha') ||
        lower.contains('browser')) {
      return 'Firebase could not complete the phone verification browser check. Try again using Chrome with cookies and storage enabled.';
    }

    return message.replaceAll('Exception: ', '');
  }

  void _skipForNow() {
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(
        builder: (_) => const CustomerMainScreen(),
      ),
      (_) => false,
    );
  }

  PinTheme _pinTheme({
    required Color borderColor,
    required Color fillColor,
  }) {
    return PinTheme(
      width: 44,
      height: 50,
      textStyle: const TextStyle(
        fontSize: 22,
        fontWeight: FontWeight.w800,
        color: textDark,
      ),
      decoration: BoxDecoration(
        color: fillColor,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: borderColor,
          width: 1.4,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final defaultPinTheme = _pinTheme(
      borderColor: const Color(0xFFD9DEE8),
      fillColor: const Color(0xFFF5F6F8),
    );

    final focusedPinTheme = _pinTheme(
      borderColor: primary,
      fillColor: const Color(0xFFF5F6F8),
    );

    final errorPinTheme = _pinTheme(
      borderColor: primary,
      fillColor: const Color(0xFFFFF1EB),
    );

    return Scaffold(
      resizeToAvoidBottomInset: true,
      backgroundColor: background,
      body: SafeArea(
        child: SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: EdgeInsets.fromLTRB(
            22,
            10,
            22,
            26 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              IconButton(
                onPressed: isLoading ? null : _skipForNow,
                icon: const Icon(
                  Icons.close_rounded,
                  size: 32,
                  color: textDark,
                ),
              ),

              const SizedBox(height: 34),

              Text(
                isOtpSent
                    ? 'Enter verification code'
                    : "What's your mobile number?",
                style: const TextStyle(
                  color: textDark,
                  fontSize: 34,
                  height: 1.12,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -0.5,
                ),
              ),

              const SizedBox(height: 16),

              Text(
                isOtpSent
                    ? 'We sent a 6-digit code to your mobile number.'
                    : 'Enter the 10 digits after +63. Example: 9120453171.',
                style: const TextStyle(
                  color: textSoft,
                  fontSize: 18,
                  height: 1.4,
                  fontWeight: FontWeight.w500,
                ),
              ),

              const SizedBox(height: 38),

              if (!isOtpSent) ...[
                Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                    Container(
                    height: 64,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(
                        color: borderColor,
                        width: 1.4,
                        ),
                    ),
                    child: const Center(
                        child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                            Text(
                            'PH',
                            style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w900,
                            ),
                            ),
                            Text(
                            '🇵🇭',
                            style: TextStyle(fontSize: 0),
                            ),
                            SizedBox(width: 8),
                            Text(
                            '+63',
                            style: TextStyle(
                                color: textDark,
                                fontSize: 17,
                                fontWeight: FontWeight.w700,
                            ),
                            ),
                        ],
                        ),
                    ),
                    ),

                    const SizedBox(width: 12),

                    Expanded(
                    child: TextField(
                        controller: phoneController,
                        keyboardType: TextInputType.phone,
                        textInputAction: TextInputAction.done,
                        inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(10),
                        ],
                        style: const TextStyle(
                        color: textDark,
                        fontSize: 18,
                        fontWeight: FontWeight.w500,
                        ),
                        decoration: InputDecoration(
                        hintText: '9120453171',
                        helperText:
                            'Type 9120453171. Do not include 0 or +63.',
                        helperMaxLines: 2,
                        errorText: phoneError,
                        errorMaxLines: 2,
                        filled: true,
                        fillColor: Colors.white,
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 18,
                            vertical: 20,
                        ),
                        hintStyle: const TextStyle(
                            color: Color(0xFFB2AAA4),
                            fontSize: 15,
                            fontWeight: FontWeight.w400,
                        ),
                        enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(18),
                            borderSide: const BorderSide(
                            color: borderColor,
                            width: 1.4,
                            ),
                        ),
                        focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(18),
                            borderSide: const BorderSide(
                            color: primary,
                            width: 1.8,
                            ),
                        ),
                        errorBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(18),
                            borderSide: const BorderSide(
                            color: primary,
                            width: 1.4,
                            ),
                        ),
                        focusedErrorBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(18),
                            borderSide: const BorderSide(
                            color: primary,
                            width: 1.8,
                            ),
                        ),
                        ),
                    ),
                    ),
                ],
                ),

              ] else ...[
                Center(
                  child: Pinput(
                    controller: otpController,
                    length: 6,
                    keyboardType: TextInputType.number,
                    defaultPinTheme: defaultPinTheme,
                    focusedPinTheme: focusedPinTheme,
                    submittedPinTheme: defaultPinTheme,
                    errorPinTheme: errorPinTheme,
                    showCursor: true,
                    mainAxisAlignment: MainAxisAlignment.center,
                    separatorBuilder: (_) => const SizedBox(width: 8),
                    onCompleted: (_) => _verifyOtp(),
                  ),
                ),

                if (otpError != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    otpError!,
                    style: const TextStyle(
                      color: primary,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],

                const SizedBox(height: 14),

                Center(
                  child: TextButton(
                    onPressed: isLoading ? null : _sendOtp,
                    child: const Text(
                      'Resend code',
                      style: TextStyle(
                        color: primary,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ),
              ],

              if (successMessage != null) ...[
                const SizedBox(height: 18),
                _MessageBox(
                  message: successMessage!,
                  isError: false,
                ),
              ],

              if (generalError != null) ...[
                const SizedBox(height: 18),
                _MessageBox(
                  message: generalError!,
                  isError: true,
                ),
              ],

              const SizedBox(height: 28),

              SizedBox(
                width: double.infinity,
                height: 58,
                child: ElevatedButton(
                  onPressed: isLoading
                      ? null
                      : isOtpSent
                          ? _verifyOtp
                          : _sendOtp,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: primary,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: primary.withValues(alpha: 0.45),
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  child: isLoading
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2.6,
                          ),
                        )
                      : Text(
                          isOtpSent ? 'Verify' : 'Continue',
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MessageBox extends StatelessWidget {
  final String message;
  final bool isError;

  const _MessageBox({
    required this.message,
    required this.isError,
  });

  @override
  Widget build(BuildContext context) {
    final color = isError
        ? const Color(0xFFFF6333)
        : const Color(0xFF16A34A);

    final background = isError
        ? const Color(0xFFFFF1EB)
        : const Color(0xFFEFFAF3);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color),
      ),
      child: Text(
        message,
        style: TextStyle(
          color: color,
          fontSize: 14,
          height: 1.35,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
