import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

enum PasswordRecoveryStage {
  updateDispatched,
  updateConfirmed,
  uncertainRevocationConfirmed,
  revocationConfirmed,
}

class PasswordRecoveryState {
  const PasswordRecoveryState(this.uid, this.stage);
  final String uid;
  final PasswordRecoveryStage stage;
}

abstract interface class PasswordRecoveryStore {
  Future<PasswordRecoveryState?> read(String uid);
  Future<void> write(PasswordRecoveryState state);
  Future<void> clear(String uid);
}

/// No credentials or tokens are stored. These records describe recovery work;
/// they never authorize a request or prove that sessions are currently revoked.
class PreferencesPasswordRecoveryStore implements PasswordRecoveryStore {
  PreferencesPasswordRecoveryStore({SharedPreferencesAsync? preferences})
    : _preferences = preferences ?? SharedPreferencesAsync();
  final SharedPreferencesAsync _preferences;
  String _key(String uid) => 'feasta_password_recovery_v1_$uid';

  @override
  Future<PasswordRecoveryState?> read(String uid) async {
    final raw = await _preferences.getString(_key(uid));
    if (raw == null) return null;
    final data = jsonDecode(raw);
    if (data is! Map || data['uid'] != uid) {
      throw const FormatException('Invalid password recovery record');
    }
    final stage = PasswordRecoveryStage.values.byName(data['stage'] as String);
    return PasswordRecoveryState(uid, stage);
  }

  @override
  Future<void> write(PasswordRecoveryState state) => _preferences.setString(
    _key(state.uid),
    jsonEncode({'uid': state.uid, 'stage': state.stage.name}),
  );

  @override
  Future<void> clear(String uid) => _preferences.remove(_key(uid));
}
