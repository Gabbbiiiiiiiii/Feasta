import 'dart:async';
import 'package:cloud_functions/cloud_functions.dart';
import '../domain/google_consent.dart';
import '../../presentation/screens/legal_document_screen.dart';

/// Shares concurrent reads. A completed snapshot is always revalidated on open;
/// cached documents are never evidence that their versions are still current.
class GooglePolicyLoader {
  static final shared = GooglePolicyLoader();
  final _pending = <LegalDocumentLoader, Future<GoogleConsent?>>{};
  final _validated = <LegalDocumentLoader, GoogleConsent>{};

  Future<GoogleConsent?> load(LegalDocumentLoader loader) {
    return _pending[loader] ??= _load(loader).whenComplete(() {
      _pending.remove(loader);
    });
  }

  Future<GoogleConsent?> _load(LegalDocumentLoader loader) async {
    for (var attempt = 0; ; attempt++) {
      try {
        final consent = await GoogleConsent.load(
          loader,
        ).timeout(const Duration(seconds: 10));
        if (consent == null) {
          _validated.remove(loader);
          return null;
        }
        final previous = _validated[loader];
        return _validated[loader] =
            previous != null && previous.matches(consent) ? previous : consent;
      } catch (error) {
        final transient =
            error is TimeoutException ||
            (error is FirebaseFunctionsException &&
                const {
                  'unavailable',
                  'deadline-exceeded',
                  'internal',
                }.contains(error.code));
        if (!transient || attempt >= 2) {
          _validated.remove(loader);
          rethrow;
        }
        await Future<void>.delayed(Duration(milliseconds: 300 * (attempt + 1)));
      }
    }
  }
}
