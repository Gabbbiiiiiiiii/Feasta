import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';

class CustomerProfilePhotoService {
  CustomerProfilePhotoService({
    FirebaseAuth? auth,
    FirebaseFirestore? firestore,
    FirebaseStorage? storage,
  }) : _auth = auth ?? FirebaseAuth.instance,
       _firestore = firestore ?? FirebaseFirestore.instance,
       _storage = storage ?? FirebaseStorage.instance;

  static const int _maximumUploadBytes = 5 * 1024 * 1024;

  final FirebaseAuth _auth;
  final FirebaseFirestore _firestore;
  final FirebaseStorage _storage;

  User get _currentUser {
    final user = _auth.currentUser;

    if (user == null) {
      throw const CustomerProfilePhotoException(
        'Your session has expired. Please sign in again.',
      );
    }

    return user;
  }

  Future<String> uploadProfilePhoto({
    required File imageFile,
    String? previousImageUrl,
  }) async {
    final user = _currentUser;

    if (!await imageFile.exists()) {
      throw const CustomerProfilePhotoException(
        'The selected photo is no longer available.',
      );
    }

    final byteLength = await imageFile.length();

    if (byteLength <= 0 || byteLength > _maximumUploadBytes) {
      throw const CustomerProfilePhotoException(
        'Choose a profile photo smaller than 5 MB.',
      );
    }

    final fileName = 'avatar_${DateTime.now().millisecondsSinceEpoch}.jpg';

    final reference = _storage.ref('users/${user.uid}/profile/$fileName');

    String? newUrl;

    try {
      final task = await reference.putFile(
        imageFile,
        SettableMetadata(
          contentType: 'image/jpeg',
          cacheControl: 'public,max-age=3600',
        ),
      );

      newUrl = await task.ref.getDownloadURL();

      final batch = _firestore.batch();
      final timestamp = FieldValue.serverTimestamp();

      batch.update(
        _firestore.collection('users').doc(user.uid),
        <String, dynamic>{'profileImageUrl': newUrl, 'updatedAt': timestamp},
      );

      batch.update(
        _firestore.collection('customers').doc(user.uid),
        <String, dynamic>{'profileImageUrl': newUrl, 'updatedAt': timestamp},
      );

      await batch.commit();

      await _deletePreviousOwnedObject(
        userId: user.uid,
        previousImageUrl: previousImageUrl,
        keepUrl: newUrl,
      );

      return newUrl;
    } catch (error) {
      if (newUrl != null) {
        try {
          await reference.delete();
        } catch (_) {
          // Best-effort rollback for an object whose metadata update failed.
        }
      }

      throw CustomerProfilePhotoException(
        'Unable to update profile photo.',
        cause: error,
      );
    }
  }

  Future<void> removeProfilePhoto({required String currentImageUrl}) async {
    final user = _currentUser;

    try {
      final batch = _firestore.batch();
      final timestamp = FieldValue.serverTimestamp();

      batch.update(
        _firestore.collection('users').doc(user.uid),
        <String, dynamic>{'profileImageUrl': null, 'updatedAt': timestamp},
      );

      batch.update(
        _firestore.collection('customers').doc(user.uid),
        <String, dynamic>{'profileImageUrl': null, 'updatedAt': timestamp},
      );

      await batch.commit();

      await _deleteOwnedObject(userId: user.uid, imageUrl: currentImageUrl);
    } catch (error) {
      throw CustomerProfilePhotoException(
        'Unable to remove profile photo.',
        cause: error,
      );
    }
  }

  Future<void> _deletePreviousOwnedObject({
    required String userId,
    required String? previousImageUrl,
    required String keepUrl,
  }) async {
    final url = previousImageUrl?.trim();

    if (url == null || url.isEmpty || url == keepUrl) {
      return;
    }

    await _deleteOwnedObject(userId: userId, imageUrl: url);
  }

  Future<void> _deleteOwnedObject({
    required String userId,
    required String imageUrl,
  }) async {
    try {
      final reference = _storage.refFromURL(imageUrl);
      final expectedPrefix = 'users/$userId/profile/';

      if (!reference.fullPath.startsWith(expectedPrefix)) {
        return;
      }

      await reference.delete();
    } on FirebaseException catch (error) {
      if (error.code == 'object-not-found') {
        return;
      }

      rethrow;
    } catch (_) {
      // Old Google/remote profile images are not owned Firebase Storage files.
    }
  }
}

class CustomerProfilePhotoException implements Exception {
  const CustomerProfilePhotoException(this.message, {this.cause});

  final String message;
  final Object? cause;

  @override
  String toString() => message;
}
