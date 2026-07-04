import 'package:feasta/core/constants/firestore_collections.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

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

      if (user == null) return null;

      // 2. Check if user exists in Firestore
      final doc = await _firestore
          .collection(FirestoreCollections.users)
          .doc(user.uid)
          .get();

      if (!doc.exists) {
        await _auth.signOut();
        throw Exception("User record not found.");
      }

      final data = doc.data() as Map<String, dynamic>;

      // 3. ROLE CHECK (VERY IMPORTANT)
      final role = data['role'] ?? 'customer';

      if (role != 'admin') {
        await _auth.signOut();
        throw Exception("Access denied. Not an admin account.");
      }

      return user;
    } on FirebaseAuthException catch (e) {
      throw Exception(e.message ?? "Authentication error");
    } catch (e) {
      rethrow;
    }
  }

  /// 🔓 CHECK IF CURRENT USER IS ADMIN
  Future<bool> isAdmin() async {
    final user = _auth.currentUser;

    if (user == null) return false;

    final doc = await _firestore
        .collection(FirestoreCollections.users)
        .doc(user.uid)
        .get();

    if (!doc.exists) return false;

    final data = doc.data() as Map<String, dynamic>;

    return data['role'] == 'admin';
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
}