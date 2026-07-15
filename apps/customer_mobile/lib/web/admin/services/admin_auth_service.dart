import 'package:feasta/core/constants/firestore_collections.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

class AdminAuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// 🔐 LOGIN ADMIN
  Future<User?> loginAdmin({
    required String email,
    required String password,
  }) async {
    try {
      // 1. Firebase Auth login
      final credential = await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );

      final user = credential.user;

      if (user == null) {
        throw Exception("Unable to sign in.");
      }

      await user.reload();
      final refreshedUser = _auth.currentUser;
      debugPrint('AdminAuthService.loginAdmin: signed in uid=${refreshedUser?.uid} email=${refreshedUser?.email}');

      // 2. Check if user exists in Firestore
      final docRef = _firestore.collection(FirestoreCollections.users).doc(user.uid);
      debugPrint('AdminAuthService.loginAdmin: fetching document ${docRef.path}');
      final doc = await docRef.get();

      if (!doc.exists) {
        await _auth.signOut();

        throw Exception(
          "Access denied. This account is not authorized to access the Administrator Portal.",
        );
      }

      final data = doc.data() as Map<String, dynamic>;

      // 3. ROLE CHECK (VERY IMPORTANT)
      final role = data['role'] ?? 'customer';

      if (role != 'admin') {
        await _auth.signOut();
        throw Exception(
        "Access denied. This account is not authorized to access the Administrator Portal.",
        );
      }

      return user;

    } on FirebaseAuthException catch (e) {
      switch (e.code) {
        case 'invalid-email':
          throw Exception("Invalid email address.");

        case 'invalid-credential':
          throw Exception(
            "Invalid administrator email or password.",
          );

        case 'user-disabled':
          throw Exception(
            "This administrator account has been disabled.",
          );

        case 'too-many-requests':
          throw Exception(
            "Too many login attempts. Please try again later.",
          );

        case 'network-request-failed':
          throw Exception(
            "Network error. Please check your internet connection.",
          );

        default:
          throw Exception(
            "Unable to sign in. Please try again.",
          );
      }
    } catch (e) {
      rethrow;
    }
  }

  /// 🔓 CHECK IF CURRENT USER IS ADMIN
  Future<bool> isAdmin() async {
    final user = _auth.currentUser;

    if (user == null) {
      debugPrint('AdminAuthService.isAdmin: currentUser is null');
      return false;
    }

    try {
      await user.reload();
    } catch (error, stack) {
      debugPrint('AdminAuthService.isAdmin: user.reload() failed: $error');
      debugPrint(stack.toString());
    }

    try {
      final tokenResult = await user.getIdTokenResult(true);
      final claims = tokenResult.claims;
      debugPrint('AdminAuthService.isAdmin: tokenResult.claims=$claims');
    } catch (error, stack) {
      debugPrint('AdminAuthService.isAdmin: getIdTokenResult failed: $error');
      debugPrint(stack.toString());
    }

    final projectId = _firestore.app.options.projectId;
    final appName = _firestore.app.name;
    final docRef = _firestore.collection(FirestoreCollections.users).doc(user.uid);

    debugPrint('AdminAuthService.isAdmin: currentUser=$user');
    debugPrint('AdminAuthService.isAdmin: uid=${user.uid} email=${user.email} projectId=$projectId appName=$appName');
    debugPrint('AdminAuthService.isAdmin: reading document path=${docRef.path}');

    try {
      final doc = await docRef.get();
      if (!doc.exists) {
        debugPrint('AdminAuthService.isAdmin: document does not exist for uid=${user.uid}');
        return false;
      }

      final data = doc.data() as Map<String, dynamic>;
      final role = data['role'] ?? 'customer';
      debugPrint('AdminAuthService.isAdmin: document exists, role=$role');
      return role == 'admin';
    } on FirebaseException catch (e, stack) {
      debugPrint('AdminAuthService.isAdmin: FirebaseException code=${e.code} message=${e.message}');
      debugPrint('AdminAuthService.isAdmin: stack=${stack.toString()}');
      debugPrint('AdminAuthService.isAdmin: current user id=${user.uid} email=${user.email}');
      debugPrint('AdminAuthService.isAdmin: requested path=${docRef.path} projectId=$projectId');
      rethrow;
    } catch (e, stack) {
      debugPrint('AdminAuthService.isAdmin: unexpected error=$e');
      debugPrint(stack.toString());
      rethrow;
    }
  }

  /// 👤 GET CURRENT ADMIN USER DATA
  Future<Map<String, dynamic>?> getAdminData() async {
    final user = _auth.currentUser;

    if (user == null) return null;

    final doc = await _firestore
        .collection(FirestoreCollections.users)
        .doc(user.uid)
        .get();

    if (!doc.exists) return null;

    final data = doc.data() as Map<String, dynamic>;

    if (data['role'] != 'admin') return null;

    return data;
  }

  /// 🚪 LOGOUT ADMIN
  Future<void> logout() async {
    await _auth.signOut();
  }

  /// 🔥 STREAM: AUTH STATE (for AdminAuthGate)
  Stream<User?> authState() {
    return _auth.authStateChanges();
  }

  Future<void> sendAdminPasswordResetEmail(String email) async {
    try {
      await _auth.sendPasswordResetEmail(
        email: email.trim(),
      );
    } on FirebaseAuthException catch (e) {
      switch (e.code) {
        case 'invalid-email':
          throw Exception("Please enter a valid email address.");

        case 'network-request-failed':
          throw Exception("Please check your internet connection.");

        default:
          throw Exception("Unable to send password reset email.");
      }
    }
  }

}