import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/helpers/auth_guard.dart';
import '../../core/services/device_permission_service.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/auth_repository.dart';
import '../authentication/application/customer_auth_scope.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import '../../shared/widgets/loading_skeleton.dart';
import '../presentation/screens/login_screen.dart';
import '../presentation/screens/role_selection_screen.dart';
import '../notifications/notifications_screen.dart';
import 'customer_main_screen.dart';
import 'phone_verification_screen.dart';
import 'account/presentation/customer_account_management_screen.dart';

const Color _primary = Color(0xFFFF6333);
const Color _textPrimary = Color(0xFF242126);
const Color _textSecondary = Color(0xFF777177);
const Color _surface = Color(0xFFF7F7F7);
const Color _divider = Color(0xFFE8E8E8);
const String _appVersion = '1.0.0';

class CustomerAccountScreen extends StatefulWidget {
  final ValueChanged<int>? onOpenTab;

  const CustomerAccountScreen({super.key, this.onOpenTab});

  @override
  State<CustomerAccountScreen> createState() => _CustomerAccountScreenState();
}

class _CustomerAccountScreenState extends State<CustomerAccountScreen> {
  final AuthRepository authRepository = AuthRepository();
  final FeastaRepository repository = FeastaRepository();

  late Future<CustomerModel?> customerFuture;

  @override
  void initState() {
    super.initState();
    customerFuture = _loadCustomer();
  }

  Future<CustomerModel?> _loadCustomer() async {
    if (isGuestUser) return null;

    try {
      return await repository.getCurrentCustomer();
    } catch (_) {
      return null;
    }
  }

  Future<void> _refresh() async {
    setState(() {
      customerFuture = _loadCustomer();
    });

    await customerFuture;
  }

  void _openTab(int index) {
    widget.onOpenTab?.call(index);
  }

  void _openLogin() {
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  Future<void> _logout() async {
    final gateController = CustomerAuthenticationScope.maybeOf(context);
    if (gateController != null) {
      await gateController.signOut();
    } else {
      await authRepository.logout();
    }

    if (!mounted) return;
    Navigator.popUntil(context, (route) => route.isFirst);
    if (gateController == null) {
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(builder: (_) => const CustomerMainScreen()),
        (_) => false,
      );
    }
  }

  Future<void> _openSettings() async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => isGuestUser
            ? const AccountSettingsScreen()
            : const CustomerAccountManagementScreen(),
      ),
    );
    if (mounted && !isGuestUser) await _refresh();
  }

  void _openNotifications() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const NotificationsScreen()),
    );
  }

  void _openProviderSignup() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const RoleSelectionScreen()),
    );
  }

  void _showComingSoon(String title) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('$title is coming soon.')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _surface,
      body: SafeArea(
        child: isGuestUser
            ? _SignedOutAccount(onLogin: _openLogin, onSettings: _openSettings)
            : StreamBuilder<UserModel?>(
                stream: repository.currentUserData(),
                builder: (context, userSnapshot) {
                  if (userSnapshot.connectionState == ConnectionState.waiting) {
                    return const FeastaSkeletonDetailPage(
                      padding: EdgeInsets.all(20),
                      showHero: false,
                    );
                  }

                  if (userSnapshot.hasError) {
                    return _AccountErrorState(
                      message:
                          'We could not load your account. Check your connection and try again.',
                      onRetry: () => setState(() {}),
                    );
                  }

                  final user = userSnapshot.data;

                  if (user == null) {
                    return _SignedOutAccount(
                      onLogin: _openLogin,
                      onSettings: _openSettings,
                    );
                  }

                  return FutureBuilder<CustomerModel?>(
                    future: customerFuture,
                    builder: (context, customerSnapshot) {
                      if (customerSnapshot.connectionState ==
                          ConnectionState.waiting) {
                        return const FeastaSkeletonDetailPage(
                          padding: EdgeInsets.all(20),
                          showHero: false,
                        );
                      }

                      final customer = customerSnapshot.data;

                      return RefreshIndicator(
                        color: _primary,
                        onRefresh: _refresh,
                        child: ListView(
                          padding: EdgeInsets.zero,
                          children: [
                            _AccountTopBar(onSettings: _openSettings),
                            _AccountIdentityCard(
                              user: user,
                              customer: customer,
                              onVerifyPhone: user.isPhoneVerified
                                  ? null
                                  : () {
                                      Navigator.push(
                                        context,
                                        MaterialPageRoute(
                                          builder: (_) =>
                                              const PhoneVerificationScreen(),
                                        ),
                                      );
                                    },
                            ),
                            const SizedBox(height: 18),
                            _AccountSection(
                              title: 'Your activity',
                              children: [
                                _AccountMenuItem(
                                  icon: Icons.event_note_outlined,
                                  title: 'Bookings',
                                  subtitle: 'Requests, payments, and chats',
                                  onTap: () => _openTab(2),
                                ),
                                _AccountMenuItem(
                                  icon: Icons.favorite_border_rounded,
                                  title: 'Saved caterers',
                                  subtitle: 'Providers you want to revisit',
                                  onTap: () => _openTab(3),
                                ),
                                _AccountMenuItem(
                                  icon: Icons.notifications_none_rounded,
                                  title: 'Notifications',
                                  subtitle: 'Booking and account updates',
                                  onTap: _openNotifications,
                                ),
                              ],
                            ),
                            _AccountSection(
                              title: 'Perks for you',
                              children: [
                                _AccountMenuItem(
                                  icon: Icons.workspace_premium_outlined,
                                  title: 'Feasta rewards',
                                  onTap: () =>
                                      _showComingSoon('Feasta rewards'),
                                ),
                                _AccountMenuItem(
                                  icon: Icons.local_offer_outlined,
                                  title: 'Vouchers',
                                  onTap: () => _showComingSoon('Vouchers'),
                                ),
                                _AccountMenuItem(
                                  icon: Icons.card_giftcard_outlined,
                                  title: 'Invite friends',
                                  onTap: () =>
                                      _showComingSoon('Invite friends'),
                                ),
                              ],
                            ),
                            _AccountSection(
                              title: 'General',
                              children: [
                                _AccountMenuItem(
                                  icon: Icons.help_outline_rounded,
                                  title: 'Help center',
                                  onTap: () => _showComingSoon('Help center'),
                                ),
                                _AccountMenuItem(
                                  icon: Icons.storefront_outlined,
                                  title: 'Sell on Feasta',
                                  onTap: _openProviderSignup,
                                ),
                                _AccountMenuItem(
                                  icon: Icons.description_outlined,
                                  title: 'Terms & policies',
                                  onTap: () =>
                                      _showComingSoon('Terms & policies'),
                                ),
                              ],
                            ),
                            Padding(
                              padding: const EdgeInsets.fromLTRB(
                                20,
                                18,
                                20,
                                12,
                              ),
                              child: OutlinedButton(
                                onPressed: _logout,
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: _textPrimary,
                                  side: const BorderSide(
                                    color: _textPrimary,
                                    width: 1.4,
                                  ),
                                  minimumSize: const Size.fromHeight(56),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                ),
                                child: const Text(
                                  'Log out',
                                  style: TextStyle(
                                    fontSize: 17,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                              ),
                            ),
                            const Center(
                              child: Padding(
                                padding: EdgeInsets.only(bottom: 26),
                                child: Text(
                                  'Version $_appVersion',
                                  style: TextStyle(
                                    color: _textSecondary,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  );
                },
              ),
      ),
    );
  }
}

class _AccountTopBar extends StatelessWidget {
  final VoidCallback onSettings;

  const _AccountTopBar({required this.onSettings});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(20, 18, 14, 16),
      child: Row(
        children: [
          const Expanded(
            child: Text(
              'Account',
              style: TextStyle(
                color: _textPrimary,
                fontSize: 30,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          IconButton(
            tooltip: 'Settings',
            onPressed: onSettings,
            icon: const Icon(
              Icons.settings_outlined,
              color: _textPrimary,
              size: 30,
            ),
          ),
        ],
      ),
    );
  }
}

class _AccountIdentityCard extends StatelessWidget {
  final UserModel user;
  final CustomerModel? customer;
  final VoidCallback? onVerifyPhone;

  const _AccountIdentityCard({
    required this.user,
    required this.customer,
    required this.onVerifyPhone,
  });

  @override
  Widget build(BuildContext context) {
    final imageUrl = _firstFilled([
      customer?.profileImageUrl,
      user.profileImageUrl,
    ]);

    return Container(
      margin: const EdgeInsets.fromLTRB(20, 12, 20, 0),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _divider),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0D000000),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 31,
            backgroundColor: const Color(0xFFFFE3DA),
            backgroundImage: imageUrl == null ? null : NetworkImage(imageUrl),
            child: imageUrl == null
                ? const Icon(Icons.person_rounded, color: _primary, size: 34)
                : null,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _profileName(user, customer),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: _textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _firstFilled([customer?.email, user.email]) ?? 'No email',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: _textSecondary,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 10),
                _AccountStatusPill(
                  label: user.isPhoneVerified
                      ? 'Phone verified'
                      : 'Phone needs verification',
                  verified: user.isPhoneVerified,
                ),
              ],
            ),
          ),
          if (onVerifyPhone != null)
            TextButton(
              onPressed: onVerifyPhone,
              child: const Text(
                'Verify',
                style: TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
        ],
      ),
    );
  }
}

class _AccountStatusPill extends StatelessWidget {
  final String label;
  final bool verified;

  const _AccountStatusPill({required this.label, required this.verified});

  @override
  Widget build(BuildContext context) {
    final color = verified ? const Color(0xFF16A34A) : Colors.orange;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _AccountSection extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _AccountSection({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              title,
              style: const TextStyle(
                color: _textPrimary,
                fontSize: 25,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: _divider),
            ),
            child: Column(
              children: [
                for (var i = 0; i < children.length; i++) ...[
                  children[i],
                  if (i != children.length - 1)
                    const Divider(height: 1, indent: 64, color: _divider),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AccountMenuItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  const _AccountMenuItem({
    required this.icon,
    required this.title,
    this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      minLeadingWidth: 0,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      leading: Icon(icon, color: _textPrimary, size: 29),
      title: Text(
        title,
        style: const TextStyle(
          color: _textPrimary,
          fontSize: 17,
          fontWeight: FontWeight.w700,
        ),
      ),
      subtitle: subtitle == null
          ? null
          : Text(
              subtitle!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: _textSecondary,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
      trailing: const Icon(
        Icons.chevron_right_rounded,
        color: _textPrimary,
        size: 28,
      ),
      onTap: onTap,
    );
  }
}

class AccountSettingsScreen extends StatefulWidget {
  const AccountSettingsScreen({super.key});

  @override
  State<AccountSettingsScreen> createState() => _AccountSettingsScreenState();
}

class _AccountSettingsScreenState extends State<AccountSettingsScreen> {
  static const _pushNotificationsKey = 'account_push_notifications_enabled';
  static const _emailOffersKey = 'account_email_offers_enabled';
  static const _floatingIconKey = 'account_floating_icon_enabled';

  bool pushNotifications = true;
  bool emailOffers = true;
  bool floatingIcon = true;
  bool isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();

    if (!mounted) return;

    setState(() {
      pushNotifications = prefs.getBool(_pushNotificationsKey) ?? true;
      emailOffers = prefs.getBool(_emailOffersKey) ?? true;
      floatingIcon = prefs.getBool(_floatingIconKey) ?? true;
      isLoading = false;
    });
  }

  Future<void> _setPreference(String key, bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(key, value);
  }

  Future<void> _togglePushNotifications(bool value) async {
    if (value) {
      await DevicePermissionService.requestNotificationPermission();
    }

    await _setPreference(_pushNotificationsKey, value);

    if (!mounted) return;

    setState(() {
      pushNotifications = value;
    });
  }

  Future<void> _toggleEmailOffers(bool value) async {
    await _setPreference(_emailOffersKey, value);

    if (!mounted) return;

    setState(() {
      emailOffers = value;
    });
  }

  Future<void> _toggleFloatingIcon(bool value) async {
    await _setPreference(_floatingIconKey, value);

    if (!mounted) return;

    setState(() {
      floatingIcon = value;
    });
  }

  void _editLanguage() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Language selection is coming soon.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _surface,
      body: SafeArea(
        child: Column(
          children: [
            _SettingsTopBar(onBack: () => Navigator.pop(context)),
            Expanded(
              child: isLoading
                  ? const FeastaSkeletonList(
                      itemCount: 4,
                      padding: EdgeInsets.all(20),
                    )
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(20, 22, 20, 28),
                      children: [
                        _LanguageCard(onEdit: _editLanguage),
                        const SizedBox(height: 14),
                        _SettingToggleCard(
                          title: 'Receive push notifications',
                          value: pushNotifications,
                          onChanged: _togglePushNotifications,
                        ),
                        const SizedBox(height: 14),
                        _SettingToggleCard(
                          title: 'Receive offers by email',
                          value: emailOffers,
                          onChanged: _toggleEmailOffers,
                        ),
                        const SizedBox(height: 14),
                        _SettingToggleCard(
                          title: 'Show floating icon',
                          value: floatingIcon,
                          onChanged: _toggleFloatingIcon,
                        ),
                        const SizedBox(height: 34),
                        const Center(
                          child: Text(
                            'Version: $_appVersion (1)',
                            style: TextStyle(
                              color: _textPrimary,
                              fontSize: 17,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SettingsTopBar extends StatelessWidget {
  final VoidCallback onBack;

  const _SettingsTopBar({required this.onBack});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(8, 16, 20, 16),
      child: Row(
        children: [
          IconButton(
            tooltip: 'Back',
            onPressed: onBack,
            icon: const Icon(Icons.arrow_back, color: _textPrimary, size: 30),
          ),
          const SizedBox(width: 8),
          const Text(
            'Settings',
            style: TextStyle(
              color: _textPrimary,
              fontSize: 30,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _LanguageCard extends StatelessWidget {
  final VoidCallback onEdit;

  const _LanguageCard({required this.onEdit});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 22),
      decoration: _settingsCardDecoration(),
      child: Row(
        children: [
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Language',
                  style: TextStyle(
                    color: _textSecondary,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                SizedBox(height: 14),
                Text(
                  'English',
                  style: TextStyle(
                    color: _textPrimary,
                    fontSize: 23,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: onEdit,
            child: const Text(
              'Edit',
              style: TextStyle(
                color: _primary,
                fontSize: 16,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SettingToggleCard extends StatelessWidget {
  final String title;
  final bool value;
  final ValueChanged<bool> onChanged;

  const _SettingToggleCard({
    required this.title,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: _settingsCardDecoration(),
      child: CheckboxListTile(
        value: value,
        activeColor: _primary,
        checkColor: Colors.white,
        controlAffinity: ListTileControlAffinity.leading,
        checkboxShape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(4),
        ),
        contentPadding: const EdgeInsets.fromLTRB(18, 12, 16, 12),
        title: Text(
          title,
          style: const TextStyle(
            color: _textPrimary,
            fontSize: 17,
            fontWeight: FontWeight.w700,
          ),
        ),
        onChanged: (value) {
          if (value != null) {
            onChanged(value);
          }
        },
      ),
    );
  }
}

class _SignedOutAccount extends StatelessWidget {
  final VoidCallback onLogin;
  final VoidCallback onSettings;

  const _SignedOutAccount({required this.onLogin, required this.onSettings});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        _AccountTopBar(onSettings: onSettings),
        Padding(
          padding: const EdgeInsets.all(22),
          child: Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: _divider),
            ),
            child: Column(
              children: [
                const Icon(
                  Icons.lock_outline_rounded,
                  color: _primary,
                  size: 58,
                ),
                const SizedBox(height: 14),
                const Text(
                  'Log in to manage your account',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: _textPrimary,
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Access bookings, saved caterers, notifications, and settings.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: _textSecondary,
                    height: 1.35,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  height: 54,
                  child: ElevatedButton(
                    onPressed: onLogin,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _primary,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: const Text(
                      'Log in / Sign up',
                      style: TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _AccountErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _AccountErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline_rounded, color: _primary, size: 68),
            const SizedBox(height: 14),
            const Text(
              'Account could not load',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: _textPrimary,
                fontSize: 22,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message.replaceAll('Exception: ', ''),
              textAlign: TextAlign.center,
              style: const TextStyle(color: _textSecondary, height: 1.35),
            ),
            const SizedBox(height: 18),
            ElevatedButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ),
      ),
    );
  }
}

BoxDecoration _settingsCardDecoration() {
  return BoxDecoration(
    color: Colors.white,
    borderRadius: BorderRadius.circular(18),
    border: Border.all(color: _divider),
    boxShadow: const [
      BoxShadow(color: Color(0x0D000000), blurRadius: 16, offset: Offset(0, 6)),
    ],
  );
}

String _profileName(UserModel user, CustomerModel? customer) {
  final customerName = customer?.fullName.trim() ?? '';
  if (customerName.isNotEmpty) return customerName;

  final userName = user.fullName.trim();
  if (userName.isNotEmpty) return userName;

  return 'Feasta customer';
}

String? _firstFilled(List<String?> values) {
  for (final value in values) {
    if (value != null && value.trim().isNotEmpty) {
      return value.trim();
    }
  }

  return null;
}
