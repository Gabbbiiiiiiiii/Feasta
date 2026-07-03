import 'dart:async';

class _CacheItem<T> {
  _CacheItem(this.value, this.expiresAt);
  final T value;
  final DateTime? expiresAt;
  bool get isExpired => expiresAt != null && DateTime.now().isAfter(expiresAt!);
}

class PromotionCache {
  PromotionCache._private();
  static final PromotionCache instance = PromotionCache._private();

  final Map<String, _CacheItem<dynamic>> _store = {};

  T? get<T>(String key) {
    final item = _store[key];
    if (item == null) return null;
    if (item.isExpired) {
      _store.remove(key);
      return null;
    }
    return item.value as T;
  }

  void set<T>(String key, T value, {Duration? ttl}) {
    final expiresAt = ttl != null ? DateTime.now().add(ttl) : null;
    _store[key] = _CacheItem<T>(value, expiresAt);
    if (ttl != null) {
      Timer(ttl, () {
        final cur = _store[key];
        if (cur != null && cur.expiresAt == expiresAt) _store.remove(key);
      });
    }
  }

  void invalidate(String key) => _store.remove(key);

  void clear() => _store.clear();
}
