import 'package:flutter/material.dart';
import '../../authentication/application/google_policy_loader.dart';

import '../../authentication/domain/google_consent.dart';
import '../screens/legal_document_screen.dart';
import '../../../core/theme/app_colors.dart';
import 'feasta_google_auth_button.dart';

enum _PolicyState { loading, ready, error }

class GoogleConsentButton extends StatefulWidget {
  const GoogleConsentButton({
    required this.onPressed,
    this.isLoading = false,
    this.loader = loadCurrentLegalDocument,
    this.buttonKey,
    super.key,
  });
  final void Function(GoogleConsent? consent)? onPressed;
  final bool isLoading;
  final Key? buttonKey;
  final LegalDocumentLoader loader;
  @override
  State<GoogleConsentButton> createState() => _GoogleConsentButtonState();
}

class _GoogleConsentButtonState extends State<GoogleConsentButton> {
  GoogleConsent? _consent;
  _PolicyState _policyState = _PolicyState.loading;
  final _disclosureKey = GlobalKey();
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant GoogleConsentButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.loader != widget.loader) {
      _consent = null;
      _load();
    }
  }

  int _generation = 0;
  Future<void> _load() async {
    final generation = ++_generation;
    if (mounted) {
      setState(() {
        _consent = null;
        _policyState = _PolicyState.loading;
      });
    }
    try {
      final consent = await GooglePolicyLoader.shared.load(widget.loader);
      if (mounted && generation == _generation) {
        setState(() {
          _consent = consent;
          _policyState = consent == null
              ? _PolicyState.error
              : _PolicyState.ready;
        });
      }
    } catch (_) {
      if (mounted && generation == _generation) {
        setState(() => _policyState = _PolicyState.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final consent = _consent;
    return Column(
      children: [
        FeastaGoogleAuthButton(
          key: widget.buttonKey,
          isLoading: widget.isLoading,
          onPressed: widget.onPressed == null
              ? null
              : () {
                  final box = _disclosureKey.currentContext?.findRenderObject();
                  final screen = MediaQuery.sizeOf(context);
                  final visible =
                      box is RenderBox &&
                      box.hasSize &&
                      box.localToGlobal(Offset.zero).dy >=
                          MediaQuery.paddingOf(context).top &&
                      box.localToGlobal(Offset(0, box.size.height)).dy <=
                          screen.height;
                  widget.onPressed!(visible ? consent : null);
                },
        ),
        const SizedBox(height: 12),
        if (consent != null)
          Text.rich(
            key: _disclosureKey,
            TextSpan(
              style: const TextStyle(
                fontSize: 13,
                height: 1.5,
                color: AppColors.secondaryTextAccessible,
              ),
              children: [
                const TextSpan(
                  text: "By continuing with Google, you accept FEASTA's ",
                ),
                for (var i = 0; i < 2; i++) ...[
                  if (i == 1) const TextSpan(text: ' and acknowledge its '),
                  WidgetSpan(
                    alignment: PlaceholderAlignment.middle,
                    child: InkWell(
                      onTap: () {
                        final snapshot = consent.documents[i];
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => LegalDocumentScreen(
                              document: FeastaLegalDocument.values[i],
                              loader: (_) async => snapshot,
                            ),
                          ),
                        );
                      },
                      child: Text(
                        i == 0 ? 'Terms of Service' : 'Privacy Policy',
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.primary,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ),
                  ),
                ],
                const TextSpan(text: '.'),
              ],
            ),
            textAlign: TextAlign.center,
          )
        else if (_policyState == _PolicyState.loading)
          Semantics(
            liveRegion: true,
            child: const Text(
              'Loading Terms and Privacy Policy\u2026',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: AppColors.secondaryTextAccessible,
              ),
            ),
          )
        else ...[
          const Text(
            'Current policies are unavailable. You can review and agree after sign-in.',
            textAlign: TextAlign.center,
          ),
          TextButton(
            onPressed: _load,
            child: const Text('Retry Google policies'),
          ),
        ],
      ],
    );
  }
}
