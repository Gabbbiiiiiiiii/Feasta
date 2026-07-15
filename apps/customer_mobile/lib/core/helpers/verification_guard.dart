import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../features/presentation/screens/login_screen.dart';
import '../../features/customer/phone_verification_screen.dart';
import '../constants/firestore_collections.dart';

Future<bool> requireVerifiedPhoneForBooking(BuildContext context) async {
  final auth = FirebaseAuth.instance;
  final user = auth.currentUser;

  if (user == null) {
    if (!context.mounted) return false;

    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => const LoginScreen(),
      ),
    );

    return false;
  }

  await user.reload();

  final refreshedUser = auth.currentUser;

  if (refreshedUser == null) {
    if (!context.mounted) return false;

    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => const LoginScreen(),
      ),
    );

    return false;
  }

  if (!refreshedUser.emailVerified) {
    if (!context.mounted) return false;

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Please verify your email before booking.'),
      ),
    );

    return false;
  }

  final userDoc = await FirebaseFirestore.instance
      .collection(FirestoreCollections.users)
      .doc(refreshedUser.uid)
      .get();

  final data = userDoc.data();
  final isPhoneVerified = data?['isPhoneVerified'] == true;

  if (!isPhoneVerified) {
    if (!context.mounted) return false;

    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => const PhoneVerificationScreen(),
      ),
    );

    return false;
  }

  return true;
}