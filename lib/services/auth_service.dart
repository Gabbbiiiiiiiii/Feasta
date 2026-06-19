import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Future<UserCredential> registerUser({
    required String firstname,
    required String lastname,
    required String email,
    required String password,
    required String confirmPassword,
    required String role,
  }) async {
    if (password.trim() != confirmPassword.trim()) {
      throw Exception('Passwords do not match');
    }

    final bool isCustomer = role == 'customer';
    final bool isAdmin = role == 'admin';

    UserCredential userCredential =
        await _auth.createUserWithEmailAndPassword(
      email: email.trim(),
      password: password.trim(),
    );

    await _firestore.collection('users').doc(userCredential.user!.uid).set({
      'firstname': firstname.trim(),
      'lastname': lastname.trim(),
      'email': email.trim(),

      // Main role
      'role': isCustomer
          ? 'customer'
          : isAdmin
              ? 'admin'
              : 'provider',

      // Provider category
      'providerType': isCustomer || isAdmin ? null : role,

      // Account status
      'status': isCustomer || isAdmin ? 'active' : 'pending',

      // Verification status
      'verificationStatus':
          isCustomer || isAdmin ? 'not_required' : 'not_submitted',

      'createdAt': FieldValue.serverTimestamp(),
    });

    return userCredential;
  }

  Future<UserCredential> loginUser({
    required String email,
    required String password,
  }) async {
    return await _auth.signInWithEmailAndPassword(
      email: email.trim(),
      password: password.trim(),
    );
  }

  Future<String?> getUserRole(String uid) async {
    DocumentSnapshot userDoc =
        await _firestore.collection('users').doc(uid).get();

    if (userDoc.exists) {
      return userDoc['role'] as String?;
    }

    return null;
  }

  Future<Map<String, dynamic>?> getUserData(String uid) async {
    DocumentSnapshot userDoc =
        await _firestore.collection('users').doc(uid).get();

    if (userDoc.exists) {
      return userDoc.data() as Map<String, dynamic>;
    }

    return null;
  }

  Future<void> submitProviderVerification({
    required String uid,
    required String businessName,
    required String businessAddress,
    required String contactNumber,
    required String providerType,
    required String documentUrl,
  }) async {
    await _firestore.collection('users').doc(uid).update({
      'businessName': businessName.trim(),
      'businessAddress': businessAddress.trim(),
      'contactNumber': contactNumber.trim(),
      'providerType': providerType,
      'documentUrl': documentUrl,
      'verificationStatus': 'submitted',
      'status': 'pending',
      'submittedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> logoutUser() async {
    await _auth.signOut();
  }
}