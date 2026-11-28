import 'package:shared_preferences/shared_preferences.dart';

/// Simulates platform persistence while allowing new Dart instances on restart.
class MemoryRecoveryPreferences implements SharedPreferencesAsync {
  MemoryRecoveryPreferences(this.disk, {this.failWrites = false});
  final Map<String, String> disk;
  final bool failWrites;
  @override
  Future<String?> getString(String key) async => disk[key];
  @override
  Future<void> setString(String key, String value) async {
    if (failWrites) throw StateError('Fake storage unavailable');
    disk[key] = value;
  }

  @override
  Future<void> remove(String key) async {
    disk.remove(key);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
