import 'package:cloud_firestore/cloud_firestore.dart' hide Type;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/router/customer_route_guard.dart';
import '../../core/services/device_permission_service.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_spacing.dart';
import '../authentication/application/customer_auth_scope.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import '../authentication/domain/auth_account_state.dart';
import '../presentation/widgets/customer_login_modal.dart';
import 'customer_account_screen.dart';
import 'customer_bookings_screen.dart';
import 'customer_favorites_screen.dart';
import 'customer_home_screen.dart';
import 'customer_messages_screen.dart';
import 'customer_plan_screen.dart';

enum _MainDestination { home, messages, bookings, account }

class CustomerMainScreen extends StatefulWidget {
  const CustomerMainScreen({this.initialIndex = 0, super.key})
    : assert(initialIndex >= 0 && initialIndex <= 4);

  /// Legacy-compatible initial index.
  ///
  /// Existing callers in FEASTA currently use:
  /// 0 = Home
  /// 2 = Bookings
  /// 3 = Messages
  /// 4 = Account
  ///
  /// Search is no longer a persistent bottom-navigation destination,
  /// but keeping this compatibility prevents existing booking/auth flows
  /// from silently opening the wrong tab.
  final int initialIndex;

  @override
  State<CustomerMainScreen> createState() => _CustomerMainScreenState();
}

class _CustomerMainScreenState extends State<CustomerMainScreen>
    with TickerProviderStateMixin {
  late _MainDestination _destination;
  late final FeastaRepository _repository;
  final FocusNode _planFocusNode = FocusNode(debugLabel: 'Plan navigation');

  bool _isPlanOpen = false;
  bool _showPlanLayer = false;

  @override
  void initState() {
    super.initState();

    _destination = _destinationFromLegacyIndex(widget.initialIndex);
    _repository = FeastaRepository();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }

      DevicePermissionService.requestCorePermissionsIfNeeded(context);
    });
  }

  @override
  void didUpdateWidget(covariant CustomerMainScreen oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.initialIndex != widget.initialIndex) {
      setState(() {
        _destination = _destinationFromLegacyIndex(widget.initialIndex);
      });
    }
  }

  @override
  void dispose() {
    _planFocusNode.dispose();
    super.dispose();
  }

  _MainDestination _destinationFromLegacyIndex(int index) {
    return switch (index) {
      2 => _MainDestination.bookings,
      3 => _MainDestination.messages,
      4 => _MainDestination.account,
      _ => _MainDestination.home,
    };
  }

  bool get _isAuthenticated {
    final controller = CustomerAuthenticationScope.maybeOf(context);
    final kind = controller?.state.gate.kind;

    return kind == AuthenticationGateKind.customerReady ||
        kind == AuthenticationGateKind.customerPhoneVerificationRequired;
  }

  int get _visualNavigationIndex {
    return switch (_destination) {
      _MainDestination.home => 0,
      _MainDestination.messages => 1,
      _MainDestination.bookings => 3,
      _MainDestination.account => 4,
    };
  }

  Future<void> _showLogin({
    required String intendedLocation,
    String? message,
  }) async {
    final controller = CustomerAuthenticationScope.maybeOf(context);

    final signedIn = await showCustomerLoginModal(
      context,
      intendedLocation: intendedLocation,
      contextMessage: message,
    );

    if (!mounted) {
      return;
    }

    if (!signedIn) {
      if (!_isAuthenticated) {
        setState(() {
          _destination = _MainDestination.home;
        });
      }
      return;
    }

    // Login succeeded. Explicitly synchronize the central FEASTA
    // authentication controller before deciding which protected screen
    // should become available.
    if (!mounted) {
      return;
    }

    final kind = controller?.state.gate.kind;

    debugPrint(
      'FEASTA MAIN LOGIN SHEET CLOSED: '
      'gate=$kind '
      'authenticated=$_isAuthenticated '
      'intended=$intendedLocation',
    );

    if (!mounted) {
      return;
    }

    debugPrint(
      'FEASTA MAIN AFTER LOGIN: '
      'gate=$kind '
      'authenticated=$_isAuthenticated '
      'intended=$intendedLocation',
    );

    final authenticated =
        kind == AuthenticationGateKind.customerReady ||
        kind == AuthenticationGateKind.customerPhoneVerificationRequired;

    if (!authenticated) {
      return;
    }

    setState(() {
      _destination = switch (intendedLocation) {
        CustomerAppLocations.bookings => _MainDestination.bookings,
        CustomerAppLocations.messages => _MainDestination.messages,
        CustomerAppLocations.account => _MainDestination.account,
        _ => _destination,
      };
    });
  }

  void _selectDestination(_MainDestination destination) {
    if (!mounted || _destination == destination) {
      return;
    }

    setState(() {
      _destination = destination;
    });
  }

  Future<void> _openPlan() async {
    if (_showPlanLayer) {
      return;
    }

    HapticFeedback.selectionClick();

    setState(() {
      _showPlanLayer = true;
      _isPlanOpen = false;
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_showPlanLayer) {
        return;
      }

      setState(() {
        _isPlanOpen = true;
      });
    });
  }

  Future<void> _closePlan() async {
    if (!_showPlanLayer) {
      return;
    }

    FocusManager.instance.primaryFocus?.unfocus();

    if (mounted) {
      setState(() {
        _isPlanOpen = false;
      });
    }

    final reduceMotion = MediaQuery.of(context).disableAnimations;

    if (!reduceMotion) {
      await Future<void>.delayed(const Duration(milliseconds: 220));
    }

    if (!mounted) {
      return;
    }

    setState(() {
      _showPlanLayer = false;
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _planFocusNode.requestFocus();
      }
    });
  }

  Future<void> _onNavigationTapped(int visualIndex) async {
    if (visualIndex != 2 && _showPlanLayer) {
      await _closePlan();
    }

    switch (visualIndex) {
      case 0:
        _selectDestination(_MainDestination.home);
        return;

      case 1:
        // Messages remains visible to guests.
        // CustomerMessagesScreen owns its guest/login presentation.
        _selectDestination(_MainDestination.messages);
        return;

      case 2:
        // Plan is a persistent toggle action.
        if (_showPlanLayer) {
          await _closePlan();
        } else {
          await _openPlan();
        }
        return;

      case 3:
        if (!_isAuthenticated) {
          await _showLogin(
            intendedLocation: CustomerAppLocations.bookings,
            message:
                'Log in or create a Feasta account to access your bookings.',
          );
          return;
        }

        _selectDestination(_MainDestination.bookings);
        return;

      case 4:
        // Account remains visible to both guests and signed-in customers.
        _selectDestination(_MainDestination.account);
        return;
    }
  }

  Future<void> _openMessagesLogin() {
    return _showLogin(
      intendedLocation: CustomerAppLocations.messages,
      message: 'Log in or create a Feasta account to see your messages.',
    );
  }

  /// Keeps CustomerAccountScreen compatible with its existing numeric
  /// callbacks without making Favorites a bottom-navigation destination.
  Future<void> _onAccountOpenTab(int legacyIndex) async {
    if (legacyIndex == 2) {
      await _onNavigationTapped(3);
      return;
    }

    if (legacyIndex == 3) {
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => CustomerFavoritesScreen(
            isGuest: !_isAuthenticated,
            onLogin: () {
              Navigator.pop(context);
              _showLogin(
                intendedLocation: CustomerAppLocations.favorites,
                message:
                    'Log in or create a Feasta account to view your saved providers.',
              );
            },
          ),
        ),
      );
      return;
    }

    if (legacyIndex == 4) {
      _selectDestination(_MainDestination.account);
    }
  }

  Widget _buildScreen() {
    return switch (_destination) {
      _MainDestination.messages => CustomerMessagesScreen(
        isGuest: !_isAuthenticated,
        onLogin: _openMessagesLogin,
      ),
      _MainDestination.bookings => const CustomerBookingsScreen(),
      _MainDestination.account => CustomerAccountScreen(
        onOpenTab: _onAccountOpenTab,
      ),
      _MainDestination.home => const CustomerHomeScreen(),
    };
  }

  @override
  Widget build(BuildContext context) {
    final isAuthenticated = _isAuthenticated;

    return Scaffold(
      backgroundColor: AppColors.background,
      extendBody: true,
      body: Stack(
        children: [
          Positioned.fill(child: _buildScreen()),

          // The backdrop stays mounted but never steals Home gestures.
          Positioned.fill(
            child: IgnorePointer(
              child: AnimatedOpacity(
                opacity: _showPlanLayer && _isPlanOpen ? 1 : 0,
                duration: MediaQuery.of(context).disableAnimations
                    ? Duration.zero
                    : const Duration(milliseconds: 180),
                curve: _isPlanOpen ? Curves.easeOut : Curves.easeIn,
                child: ColoredBox(color: Colors.black.withValues(alpha: 0.34)),
              ),
            ),
          ),

          // Keep the Plan widget mounted even while hidden so the user keeps
          // event type, location, and budget values between temporary closes.
          Positioned.fill(
            child: IgnorePointer(
              ignoring: !_showPlanLayer || !_isPlanOpen,
              child: _PlanOverlaySheet(
                visible: _showPlanLayer && _isPlanOpen,
                onClose: _closePlan,
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: _FeastaBottomNavigation(
          selectedIndex: _visualNavigationIndex,
          repository: _repository,
          isAuthenticated: isAuthenticated,
          planSelected: _showPlanLayer,
          planFocusNode: _planFocusNode,
          onTap: _onNavigationTapped,
        ),
      ),
    );
  }
}

class _FeastaBottomNavigation extends StatelessWidget {
  const _FeastaBottomNavigation({
    required this.selectedIndex,
    required this.repository,
    required this.isAuthenticated,
    required this.planSelected,
    required this.planFocusNode,
    required this.onTap,
  });

  final int selectedIndex;
  final FeastaRepository repository;
  final bool isAuthenticated;
  final bool planSelected;
  final FocusNode planFocusNode;
  final Future<void> Function(int) onTap;

  @override
  Widget build(BuildContext context) {
    // Compact proportions matching the reference.
    const double barHeight = 76;
    const double planDiameter = 58;
    const double planSlotWidth = 76;

    final reduceMotion = MediaQuery.of(context).disableAnimations;

    return SizedBox(
      height: 88,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            height: barHeight,
            child: PhysicalShape(
              clipper: const _BottomNavigationClipper(),
              color: AppColors.surface,
              elevation: 8,
              shadowColor: const Color(0x24000000),
              clipBehavior: Clip.antiAlias,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(6, 13, 6, 5),
                child: Row(
                  children: [
                    Expanded(
                      child: _BottomNavItem(
                        assetPath: 'assets/images/home.png',
                        label: 'Home',
                        active: selectedIndex == 0,
                        onTap: () {
                          onTap(0);
                        },
                      ),
                    ),
                    Expanded(
                      child: _BottomNavItem(
                        assetPath: 'assets/images/messages.png',
                        label: 'Messages',
                        active: selectedIndex == 1,
                        onTap: () {
                          onTap(1);
                        },
                        badge: _MessagesNavigationBadge(
                          repository: repository,
                          isAuthenticated: isAuthenticated,
                        ),
                      ),
                    ),

                    // Space for the centered Plan button.
                    const SizedBox(width: planSlotWidth),

                    Expanded(
                      child: _BottomNavItem(
                        assetPath: 'assets/images/bookings.png',
                        label: 'Bookings',
                        active: selectedIndex == 3,
                        onTap: () {
                          onTap(3);
                        },
                      ),
                    ),
                    Expanded(
                      child: _BottomNavItem(
                        assetPath: 'assets/images/account.png',
                        label: isAuthenticated ? 'Account' : 'Login',
                        active: selectedIndex == 4,
                        onTap: () {
                          onTap(4);
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          AnimatedPositioned(
            duration: reduceMotion
                ? Duration.zero
                : const Duration(milliseconds: 220),
            curve: planSelected ? Curves.easeOutCubic : Curves.easeInOutCubic,
            top: planSelected ? 3 : 0,
            left: 0,
            right: 0,
            child: Center(
              child: _PlanFloatingNavButton(
                diameter: planDiameter,
                selected: planSelected,
                enabled: true,
                focusNode: planFocusNode,
                onTap: () => onTap(2),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BottomNavigationClipper extends CustomClipper<Path> {
  const _BottomNavigationClipper();

  @override
  Path getClip(Size size) {
    final centerX = size.width / 2;

    // Smaller notch to fit the compact Plan button.
    const cornerRadius = 22.0;
    const notchHalfWidth = 43.0;
    const notchDepth = 27.0;

    final path = Path()
      ..moveTo(cornerRadius, 0)
      ..lineTo(centerX - notchHalfWidth - 8, 0)
      ..cubicTo(
        centerX - notchHalfWidth,
        0,
        centerX - notchHalfWidth + 2,
        notchDepth * 0.55,
        centerX - notchHalfWidth + 15,
        notchDepth * 0.76,
      )
      ..cubicTo(
        centerX - 22,
        notchDepth,
        centerX - 13,
        notchDepth,
        centerX,
        notchDepth,
      )
      ..cubicTo(
        centerX + 13,
        notchDepth,
        centerX + 22,
        notchDepth,
        centerX + notchHalfWidth - 15,
        notchDepth * 0.76,
      )
      ..cubicTo(
        centerX + notchHalfWidth - 2,
        notchDepth * 0.55,
        centerX + notchHalfWidth,
        0,
        centerX + notchHalfWidth + 8,
        0,
      )
      ..lineTo(size.width - cornerRadius, 0)
      ..quadraticBezierTo(size.width, 0, size.width, cornerRadius)
      ..lineTo(size.width, size.height - cornerRadius)
      ..quadraticBezierTo(
        size.width,
        size.height,
        size.width - cornerRadius,
        size.height,
      )
      ..lineTo(cornerRadius, size.height)
      ..quadraticBezierTo(0, size.height, 0, size.height - cornerRadius)
      ..lineTo(0, cornerRadius)
      ..quadraticBezierTo(0, 0, cornerRadius, 0)
      ..close();

    return path;
  }

  @override
  bool shouldReclip(covariant _BottomNavigationClipper oldClipper) {
    return false;
  }
}

class _BottomNavItem extends StatelessWidget {
  const _BottomNavItem({
    required this.assetPath,
    required this.label,
    required this.active,
    required this.onTap,
    this.badge,
  });

  final String assetPath;
  final String label;
  final bool active;
  final VoidCallback onTap;
  final Widget? badge;

  @override
  Widget build(BuildContext context) {
    final color = active
        ? AppColors.primary
        : AppColors.secondaryTextAccessible;

    return Semantics(
      button: true,
      selected: active,
      label: label,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.large),
          child: SizedBox(
            height: 58,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 34,
                  height: 26,
                  child: Stack(
                    clipBehavior: Clip.none,
                    alignment: Alignment.center,
                    children: [
                      ColorFiltered(
                        colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
                        child: Image.asset(
                          assetPath,
                          width: 23,
                          height: 23,
                          fit: BoxFit.contain,
                          filterQuality: FilterQuality.high,
                          errorBuilder: (context, error, stackTrace) {
                            return Icon(
                              Icons.circle_outlined,
                              color: color,
                              size: 23,
                            );
                          },
                        ),
                      ),
                      if (badge != null)
                        Positioned(top: -4, right: -5, child: badge!),
                    ],
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: color,
                    fontSize: 10,
                    height: 1,
                    fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PlanFloatingNavButton extends StatefulWidget {
  const _PlanFloatingNavButton({
    required this.diameter,
    required this.selected,
    required this.enabled,
    required this.focusNode,
    required this.onTap,
  });

  final double diameter;
  final bool selected;
  final bool enabled;
  final FocusNode focusNode;
  final Future<void> Function() onTap;

  @override
  State<_PlanFloatingNavButton> createState() => _PlanFloatingNavButtonState();
}

class _PlanFloatingNavButtonState extends State<_PlanFloatingNavButton> {
  bool _pressed = false;
  bool _hovered = false;
  bool _focused = false;
  bool _activating = false;
  bool _pulse = false;

  bool get _reduceMotion => MediaQuery.of(context).disableAnimations;

  Duration get _pressDuration =>
      _reduceMotion ? Duration.zero : const Duration(milliseconds: 90);

  Duration get _releaseDuration =>
      _reduceMotion ? Duration.zero : const Duration(milliseconds: 180);

  Future<void> _activate() async {
    if (!widget.enabled || _activating) {
      return;
    }

    _activating = true;
    HapticFeedback.selectionClick();

    if (mounted) {
      setState(() {
        _pressed = true;
        _pulse = true;
      });
    }

    if (!_reduceMotion) {
      await Future<void>.delayed(const Duration(milliseconds: 90));
    }

    if (!mounted) {
      return;
    }

    setState(() {
      _pressed = false;
    });

    if (!_reduceMotion) {
      await Future<void>.delayed(const Duration(milliseconds: 90));
    }

    if (!mounted) {
      return;
    }

    try {
      await widget.onTap();
    } finally {
      if (mounted) {
        setState(() {
          _pulse = false;
          _activating = false;
        });
      }
    }
  }

  void _handlePointerDown() {
    if (!widget.enabled || _activating || _pressed) {
      return;
    }

    setState(() {
      _pressed = true;
    });
  }

  void _handlePointerCancel() {
    if (!mounted || _activating) {
      return;
    }

    setState(() {
      _pressed = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final selected = widget.selected;
    final disabled = !widget.enabled && !selected;

    final focusVisible =
        _focused &&
        FocusManager.instance.highlightMode == FocusHighlightMode.traditional;

    final double scale;
    if (_pressed) {
      scale = 0.94;
    } else if (_pulse) {
      scale = 1.06;
    } else if (selected) {
      scale = 1.035;
    } else if (_hovered && widget.enabled) {
      scale = 1.02;
    } else {
      scale = 1.0;
    }

    final buttonColor = _pressed ? AppColors.primaryStrong : AppColors.primary;

    final double glowAlpha = selected
        ? 0.42
        : _pulse
        ? 0.48
        : _hovered || _focused
        ? 0.32
        : 0.18;

    final double glowBlur = selected
        ? 26
        : _pulse
        ? 30
        : _hovered || _focused
        ? 20
        : 14;

    final double glowSpread = selected
        ? 4
        : _pulse
        ? 5
        : 1;

    final labelColor = selected ? AppColors.primary : AppColors.primaryStrong;

    return Semantics(
      button: true,
      selected: selected,
      enabled: widget.enabled,
      label: 'Plan an event',
      child: FocusableActionDetector(
        focusNode: widget.focusNode,
        enabled: widget.enabled,
        mouseCursor: widget.enabled
            ? SystemMouseCursors.click
            : SystemMouseCursors.basic,
        onShowHoverHighlight: (value) {
          if (!mounted) {
            return;
          }

          setState(() {
            _hovered = value;
          });
        },
        onShowFocusHighlight: (value) {
          if (!mounted) {
            return;
          }

          setState(() {
            _focused = value;
          });
        },
        shortcuts: const <ShortcutActivator, Intent>{
          SingleActivator(LogicalKeyboardKey.enter): ActivateIntent(),
          SingleActivator(LogicalKeyboardKey.space): ActivateIntent(),
        },
        actions: <Type, Action<Intent>>{
          ActivateIntent: CallbackAction<ActivateIntent>(
            onInvoke: (_) {
              _activate();
              return null;
            },
          ),
        },
        child: Opacity(
          opacity: disabled ? 0.48 : 1,
          child: AnimatedSlide(
            offset: selected ? const Offset(0, -0.07) : Offset.zero,
            duration: _reduceMotion
                ? Duration.zero
                : const Duration(milliseconds: 220),
            curve: selected ? Curves.easeOutCubic : Curves.easeInOutCubic,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AnimatedScale(
                  scale: scale,
                  duration: _pressed ? _pressDuration : _releaseDuration,
                  curve: _pressed ? Curves.easeOutCubic : Curves.easeOutBack,
                  child: Listener(
                    onPointerDown: widget.enabled
                        ? (_) => _handlePointerDown()
                        : null,
                    onPointerCancel: widget.enabled
                        ? (_) => _handlePointerCancel()
                        : null,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: widget.enabled ? _activate : null,
                      child: AnimatedContainer(
                        duration: _reduceMotion
                            ? Duration.zero
                            : const Duration(milliseconds: 220),
                        curve: Curves.easeOutCubic,
                        width: widget.diameter + 12,
                        height: widget.diameter + 12,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: focusVisible
                              ? Border.all(
                                  color: AppColors.primaryStrong,
                                  width: 2,
                                )
                              : selected
                              ? Border.all(
                                  color: AppColors.primary.withValues(
                                    alpha: 0.24,
                                  ),
                                  width: 1.5,
                                )
                              : null,
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.primary.withValues(
                                alpha: glowAlpha,
                              ),
                              blurRadius: glowBlur,
                              spreadRadius: glowSpread,
                              offset: const Offset(0, 6),
                            ),
                            BoxShadow(
                              color: Colors.black.withValues(
                                alpha: selected ? 0.12 : 0.08,
                              ),
                              blurRadius: selected ? 14 : 9,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: AnimatedContainer(
                          duration: _reduceMotion
                              ? Duration.zero
                              : const Duration(milliseconds: 220),
                          curve: Curves.easeOutCubic,
                          width: widget.diameter + 6,
                          height: widget.diameter + 6,
                          padding: EdgeInsets.all(selected ? 3 : 4),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            shape: BoxShape.circle,
                            border: selected
                                ? Border.all(
                                    color: AppColors.primarySubtle,
                                    width: 2,
                                  )
                                : null,
                          ),
                          child: Material(
                            color: Colors.transparent,
                            shape: const CircleBorder(),
                            clipBehavior: Clip.antiAlias,
                            child: AnimatedContainer(
                              duration: _reduceMotion
                                  ? Duration.zero
                                  : const Duration(milliseconds: 220),
                              curve: Curves.easeOutCubic,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: buttonColor,
                              ),
                              child: Center(
                                child: AnimatedRotation(
                                  turns: selected ? 0.0 : (_pulse ? 0.02 : 0.0),
                                  duration: _reduceMotion
                                      ? Duration.zero
                                      : const Duration(milliseconds: 180),
                                  curve: Curves.easeOutCubic,
                                  child: AnimatedScale(
                                    scale: selected
                                        ? 1.06
                                        : (_pressed ? 0.92 : 1.0),
                                    duration: _reduceMotion
                                        ? Duration.zero
                                        : const Duration(milliseconds: 180),
                                    curve: Curves.easeOutBack,
                                    child: ColorFiltered(
                                      colorFilter: const ColorFilter.mode(
                                        Colors.white,
                                        BlendMode.srcIn,
                                      ),
                                      child: Image.asset(
                                        'assets/images/plan.png',
                                        width: 27,
                                        height: 27,
                                        fit: BoxFit.contain,
                                        filterQuality: FilterQuality.high,
                                        errorBuilder:
                                            (context, error, stackTrace) {
                                              return const Icon(
                                                Icons.add_rounded,
                                                color: Colors.white,
                                                size: 28,
                                              );
                                            },
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 1),
                AnimatedDefaultTextStyle(
                  duration: _reduceMotion
                      ? Duration.zero
                      : const Duration(milliseconds: 200),
                  curve: Curves.easeOutCubic,
                  style: TextStyle(
                    color: labelColor,
                    fontSize: selected ? 10.3 : 10,
                    height: 1,
                    fontWeight: selected ? FontWeight.w900 : FontWeight.w800,
                    letterSpacing: selected ? 0.2 : 0,
                  ),
                  child: const Text('Plan', maxLines: 1),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PlanOverlaySheet extends StatefulWidget {
  const _PlanOverlaySheet({required this.visible, required this.onClose});

  final bool visible;
  final Future<void> Function() onClose;

  @override
  State<_PlanOverlaySheet> createState() => _PlanOverlaySheetState();
}

class _PlanOverlaySheetState extends State<_PlanOverlaySheet> {
  final DraggableScrollableController _sheetController =
      DraggableScrollableController();

  bool _closingFromDrag = false;

  double _minSize(BuildContext context) {
    return MediaQuery.sizeOf(context).height < 700 ? 0.62 : 0.52;
  }

  double _initialSize(BuildContext context) {
    return MediaQuery.sizeOf(context).height < 700 ? 0.91 : 0.84;
  }

  double _maxSize(BuildContext context) {
    return MediaQuery.sizeOf(context).height < 700 ? 0.96 : 0.92;
  }

  @override
  void didUpdateWidget(covariant _PlanOverlaySheet oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (!oldWidget.visible && widget.visible) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !_sheetController.isAttached) {
          return;
        }

        final reduceMotion = MediaQuery.of(context).disableAnimations;
        final target = _initialSize(context);

        if (reduceMotion) {
          _sheetController.jumpTo(target);
        } else {
          _sheetController.animateTo(
            target,
            duration: const Duration(milliseconds: 240),
            curve: Curves.easeOutCubic,
          );
        }
      });
    }

    if (!widget.visible) {
      _closingFromDrag = false;
    }
  }

  @override
  void dispose() {
    _sheetController.dispose();
    super.dispose();
  }

  Future<void> _requestCloseFromDrag() async {
    if (_closingFromDrag || !widget.visible) {
      return;
    }

    _closingFromDrag = true;

    try {
      await widget.onClose();
    } finally {
      _closingFromDrag = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    final minSize = _minSize(context);
    final initialSize = _initialSize(context);
    final maxSize = _maxSize(context);

    return AnimatedSlide(
      offset: widget.visible ? Offset.zero : const Offset(0, 1),
      duration: reduceMotion
          ? Duration.zero
          : const Duration(milliseconds: 250),
      curve: widget.visible ? Curves.easeOutCubic : Curves.easeInCubic,
      child: AnimatedOpacity(
        opacity: widget.visible ? 1 : 0,
        duration: reduceMotion
            ? Duration.zero
            : const Duration(milliseconds: 170),
        curve: widget.visible ? Curves.easeOut : Curves.easeIn,
        child: NotificationListener<DraggableScrollableNotification>(
          onNotification: (notification) {
            if (notification.extent <= minSize + 0.012 && widget.visible) {
              _requestCloseFromDrag();
            }

            return false;
          },
          child: DraggableScrollableSheet(
            controller: _sheetController,
            initialChildSize: initialSize,
            minChildSize: minSize,
            maxChildSize: maxSize,
            expand: false,
            snap: true,
            snapSizes: [initialSize, maxSize],
            builder: (context, scrollController) {
              return Material(
                color: AppColors.background,
                elevation: 20,
                shadowColor: Colors.black.withValues(alpha: 0.18),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(28),
                ),
                clipBehavior: Clip.antiAlias,
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.screen,
                        12,
                        10,
                        6,
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              'Plan your event',
                              style: Theme.of(context).textTheme.titleLarge
                                  ?.copyWith(
                                    color: AppColors.mainText,
                                    fontWeight: FontWeight.w900,
                                  ),
                            ),
                          ),
                          Semantics(
                            button: true,
                            label: 'Close Plan',
                            child: IconButton(
                              tooltip: 'Close',
                              onPressed: widget.visible
                                  ? () async {
                                      HapticFeedback.selectionClick();
                                      await widget.onClose();
                                    }
                                  : null,
                              icon: const Icon(
                                Icons.close_rounded,
                                color: AppColors.mainText,
                                size: 28,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Divider(
                      height: 1,
                      thickness: 1,
                      color: AppColors.border.withValues(alpha: 0.85),
                    ),
                    Expanded(
                      child: CustomerPlanScreen(
                        modalPresentation: true,
                        scrollController: scrollController,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _MessagesNavigationBadge extends StatelessWidget {
  const _MessagesNavigationBadge({
    required this.repository,
    required this.isAuthenticated,
  });

  final FeastaRepository repository;
  final bool isAuthenticated;

  @override
  Widget build(BuildContext context) {
    if (!isAuthenticated) {
      return const SizedBox.shrink();
    }

    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: repository.myChatRooms(),
      builder: (context, snapshot) {
        final rooms =
            snapshot.data?.docs ??
            const <QueryDocumentSnapshot<Map<String, dynamic>>>[];

        var unreadCount = 0;

        for (final room in rooms) {
          unreadCount += _readUnreadCount(room.data()['unreadCountCustomer']);
        }

        if (unreadCount <= 0) {
          return const SizedBox.shrink();
        }

        final display = unreadCount > 99 ? '99+' : '$unreadCount';

        return ExcludeSemantics(
          child: Container(
            constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
            padding: const EdgeInsets.symmetric(horizontal: 4),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.primary,
              borderRadius: BorderRadius.circular(AppRadius.pill),
              border: Border.all(color: AppColors.surface, width: 2),
            ),
            child: Text(
              display,
              maxLines: 1,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 8,
                height: 1,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        );
      },
    );
  }
}

int _readUnreadCount(dynamic value) {
  if (value is int) {
    return value;
  }

  if (value is num) {
    return value.toInt();
  }

  return int.tryParse(value?.toString() ?? '') ?? 0;
}
