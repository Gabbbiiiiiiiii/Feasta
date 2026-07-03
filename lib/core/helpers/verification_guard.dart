import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../mobile/auth/login_screen.dart';
import '../../mobile/customer/phone_verification_screen.dart';

Future<bool> requireVerifiedPhoneForBooking(BuildContext context) async {
  final user = FirebaseAuth.instance.currentUser;

  if (user == null) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => const LoginScreen(),
      ),
    );
    return false;
  }

  await user.reload();

  final refreshedUser = FirebaseAuth.instance.currentUser;

  if (refreshedUser == null) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => const LoginScreen(),
      ),
    );
    return false;
  }

  if (!refreshedUser.emailVerified) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Please verify your email before booking.'),
      ),
    );
    return false;
  }

  final userDoc = await FirebaseFirestore.instance
      .collection('users')
      .doc(refreshedUser.uid)
      .get();

  final data = userDoc.data();

  final isPhoneVerified = data?['isPhoneVerified'] ?? false;

  if (!isPhoneVerified) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => const PhoneVerificationScreen(),
      ),
    );
    return false;
  }

  return true;
}