import 'dart:convert';
import '../../../core/security/auth_operation_coordinator.dart';
import '../../presentation/screens/legal_document_screen.dart';

class GoogleConsent {
  GoogleConsent(List<Map<String, dynamic>> documents)
    : _snapshot = jsonEncode(documents);
  final String _snapshot;
  List<Map<String, dynamic>> get documents => (jsonDecode(_snapshot) as List)
      .map((item) => Map<String, dynamic>.from(item as Map))
      .toList();
  String get termsVersion => documents[0]['version'] as String;
  String get privacyVersion => documents[1]['version'] as String;
  static Future<GoogleConsent?> load(LegalDocumentLoader loader) async {
    final documents = await Future.wait(
      FeastaLegalDocument.values.map(
        (document) => Future.sync(() => loader(document)),
      ),
    );
    if (!documents.every(validPublishedAgreement)) return null;
    return GoogleConsent(documents.cast<Map<String, dynamic>>());
  }

  Future<bool> isCurrent(LegalDocumentLoader loader) async {
    try {
      final current = await load(loader);
      return current != null && matches(current);
    } catch (_) {
      return false;
    }
  }

  bool matches(GoogleConsent other) =>
      jsonEncode(documents) == jsonEncode(other.documents);
}

abstract interface class GoogleConsentGateway {
  void stageGoogleConsent(GoogleConsent? consent);
}

/// One-shot handoff inside the serialized authentication operation.
class PendingGoogleConsent {
  static int? epoch;
  static String? uid;
  static GoogleConsent? consent;
  static void clear() {
    epoch = null;
    uid = null;
    consent = null;
  }

  static GoogleConsent? take(String identity) {
    final result =
        uid == identity && epoch == AuthOperationCoordinator.shared.epoch
        ? consent
        : null;
    clear();
    return result;
  }
}
