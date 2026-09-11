import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:custom_refresh_indicator/custom_refresh_indicator.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/helpers/auth_guard.dart';
import '../../core/helpers/provider_category_helper.dart';
import '../../shared/models/customer_address_model.dart';
import '../../shared/models/feasta_models.dart';
import '../../shared/models/promotion_model.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import '../authentication/data/services/customer_address_storage_service.dart';
import '../authentication/data/services/promotion_service.dart';
import '../../shared/widgets/loading_skeleton.dart';
import '../notifications/notifications_screen.dart';
import 'customer_search_screen.dart';
import 'location_picker_screen.dart';
import 'manual_address_screen.dart';
import 'provider_profile_screen.dart';
import '../../shared/widgets/feasta_loading_logo.dart';


class CustomerHomeScreen extends StatefulWidget {
  const CustomerHomeScreen({super.key});

  @override
  State<CustomerHomeScreen> createState() => _CustomerHomeScreenState();
}

class _CustomerHomeScreenState extends State<CustomerHomeScreen> {
  final FeastaRepository _repository = FeastaRepository();
  final CustomerAddressStorageService _addressStorage =
      CustomerAddressStorageService();

  late Future<CustomerAddressModel> _selectedAddressFuture;

  String selectedEventType = 'All';
  bool nearOrmocOnly = false;
  bool rating4PlusOnly = false;
  bool budgetFriendlyOnly = false;

  final List<_HomeCategoryItem> categories = const [
    _HomeCategoryItem('Catering', Icons.restaurant_menu_outlined),
    _HomeCategoryItem('Photography', Icons.camera_alt_outlined),
    _HomeCategoryItem('Videography', Icons.videocam_outlined),
    _HomeCategoryItem('Event Styling', Icons.auto_awesome_rounded),
    _HomeCategoryItem('Makeup Artists', Icons.brush_outlined),
    _HomeCategoryItem('Entertainment', Icons.music_note_outlined),
    _HomeCategoryItem('Sound Systems', Icons.speaker_outlined),
    _HomeCategoryItem('Hosts & MCs', Icons.mic_outlined),
  ];

  final List<_HomeFilterItem> filters = const [
    _HomeFilterItem('All', Icons.tune),
    _HomeFilterItem('Ratings 4.0+', Icons.star),
    _HomeFilterItem('Budget Friendly', Icons.sell_outlined),
  ];

  @override
  void initState() {
    super.initState();
    _selectedAddressFuture = _addressStorage.getSelectedOrDefault();
  }

  Future<void> _openLocationSheet() async {
    final selectedAddress = await _addressStorage.getSelectedOrDefault();
    final savedAddresses = await _addressStorage.getSavedAddresses();

    if (!mounted) return;

    final result = await showModalBottomSheet<CustomerAddressModel>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return _EventLocationSheet(
          selectedAddress: selectedAddress,
          savedAddresses: savedAddresses,
          onOpenMap: () async {
            final address = await Navigator.push<CustomerAddressModel>(
              context,
              MaterialPageRoute(builder: (_) => const LocationPickerScreen()),
            );

            if (sheetContext.mounted) {
              // Always close the sheet when returning from location picker
              if (address != null) {
                Navigator.pop(sheetContext, address);
              } else {
                Navigator.pop(sheetContext); // Close sheet without result
              }
            }
          },
          onAddAddress: () async {
            final address = await Navigator.push<CustomerAddressModel>(
              context,
              MaterialPageRoute(builder: (_) => const ManualAddressScreen()),
            );

            if (address == null) {
              if (sheetContext.mounted) {
                Navigator.pop(sheetContext); // Close sheet if cancelled
              }
              return;
            }

            await _addressStorage.saveSelectedAddress(address);
            if (sheetContext.mounted) {
              Navigator.pop(sheetContext, address.copyWith(isDefault: true));
            }
          },
          onSelectAddress: (address) async {
            await _addressStorage.setDefaultAddress(address.id);
            if (sheetContext.mounted) {
              Navigator.pop(sheetContext, address.copyWith(isDefault: true));
            }
          },
        );
      },
    );

    if (result == null || !mounted) return;

    setState(() {
      _selectedAddressFuture = Future.value(result);
    });
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Scaffold(
        backgroundColor: Colors.white,
        body: CustomRefreshIndicator(
          onRefresh: () async {
            setState(() {
              _selectedAddressFuture = _addressStorage.getSelectedOrDefault();
            });

            await Future.delayed(const Duration(milliseconds: 900));
          },
          builder: (context, child, controller) {
            return Stack(
              children: [
                child,
                Positioned(
                  top: 158 + (controller.value * 34),
                  left: 0,
                  right: 0,
                  child: Opacity(
                    opacity: controller.value.clamp(0.0, 1.0),
                    child: Transform.translate(
                      offset: Offset(0, -18 + (controller.value * 18)),
                      child: Transform.scale(
                        scale: 0.75 + (controller.value * 0.35),
                        child: const FeastaLoadingLogo(),
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: _HomeHeader(
                  repository: _repository,
                  selectedAddressFuture: _selectedAddressFuture,
                  onLocationTap: _openLocationSheet,
                ),
              ),

              SliverToBoxAdapter(child: const SizedBox(height: 8)),

              SliverToBoxAdapter(child: _PromotionalBanner()),

              SliverToBoxAdapter(child: const SizedBox(height: 16)),

              SliverToBoxAdapter(
                child: _BrowseCategoriesSection(categories: categories),
              ),

              SliverToBoxAdapter(child: const SizedBox(height: 16)),

              SliverToBoxAdapter(
                child: _SectionHeader(
                  title: 'Popular Providers',
                  subtitle: 'Highly rated in Ormoc',
                ),
              ),

              SliverToBoxAdapter(
                child: _ProviderHorizontalSection(
                  title: 'Popular Providers',
                  subtitle: 'Highly rated in Ormoc',
                  stream: _repository.homeCateringProviders(
                    eventType: 'All',
                    nearOrmoc: false,
                    rating4Plus: false,
                    budgetFriendly: false,
                  ),
                  emptyText: 'No verified providers available yet.',
                ),
              ),

              const SliverToBoxAdapter(child: SizedBox(height: 34)),
            ],
          ),
        ),
      ),
    );
  }
}

class _HomeHeader extends StatelessWidget {
  final FeastaRepository repository;
  final Future<CustomerAddressModel> selectedAddressFuture;
  final VoidCallback onLocationTap;

  const _HomeHeader({
    required this.repository,
    required this.selectedAddressFuture,
    required this.onLocationTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'DELIVERING TO',
                      style: TextStyle(
                        color: Color(0xFF8C817A),
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.8,
                      ),
                    ),
                    const SizedBox(height: 10),
                    InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: onLocationTap,
                      child: Row(
                        children: [
                          const Icon(
                            Icons.location_on_rounded,
                            color: Color(0xFFFF6333),
                            size: 18,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: FutureBuilder<CustomerAddressModel>(
                              future: selectedAddressFuture,
                              builder: (context, snapshot) {
                                return Text(
                                  snapshot.connectionState == ConnectionState.waiting
                                      ? 'Ormoc City, Leyte'
                                      : snapshot.data?.displayTitle ?? 'Select Location',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Color(0xFF2B211D),
                                    fontSize: 18,
                                    fontWeight: FontWeight.w900,
                                  ),
                                );
                              },
                            ),
                          ),
                          const Icon(
                            Icons.keyboard_arrow_down_rounded,
                            color: Color(0xFF8C817A),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              if (isGuestUser)
                _NotificationButton(
                  onPressed: () {
                    requireLogin(
                      context,
                      message:
                          'Please log in or create an account to view notifications.',
                    );
                  },
                )
              else
                StreamBuilder(
                  stream: repository.myNotifications(),
                  builder: (context, snapshot) {
                    final docs = snapshot.data?.docs ?? [];
                    final unreadCount =
                        docs.where((doc) => doc.data()['isRead'] == false).length;

                    return _NotificationButton(
                      unreadCount: unreadCount,
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const NotificationsScreen(),
                          ),
                        );
                      },
                    );
                  },
                ),
            ],
          ),
          const SizedBox(height: 16),
          const _HomeSearchBar(),
        ],
      ),
    );
  }
}

class _NotificationButton extends StatelessWidget {
  final int unreadCount;
  final VoidCallback onPressed;

  const _NotificationButton({this.unreadCount = 0, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFFE8E1DB)),
            borderRadius: BorderRadius.circular(12),
            color: Colors.white,
          ),
          child: IconButton(
            onPressed: onPressed,
            icon: const Icon(
              Icons.notifications_none_rounded,
              color: Color(0xFF2B211D),
              size: 24,
            ),
          ),
        ),
        if (unreadCount > 0)
          Positioned(
            right: -4,
            top: -4,
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: const BoxDecoration(
                color: Colors.red,
                shape: BoxShape.circle,
              ),
              child: Text(
                unreadCount > 9 ? '9+' : '$unreadCount',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _PromotionalBanner extends StatelessWidget {
  const _PromotionalBanner();

  @override
  Widget build(BuildContext context) {
    final service = PromotionService();

    return StreamBuilder<List<PromotionModel>>(
      stream: service.watchActivePromotions(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const _PromotionalBannerShimmer();
        }

        if (snapshot.hasError) {
          return _PromotionalBannerErrorState(
            message: snapshot.error.toString(),
          );
        }

        final promotions = snapshot.data ?? <PromotionModel>[];

        if (promotions.isEmpty) {
          return const _PromotionalBannerEmptyState();
        }

        return _PromotionalBannerCarousel(promotions: promotions);
      },
    );
  }
}

class _PromotionalBannerCarousel extends StatefulWidget {
  final List<PromotionModel> promotions;

  const _PromotionalBannerCarousel({required this.promotions});

  @override
  State<_PromotionalBannerCarousel> createState() =>
      _PromotionalBannerCarouselState();
}

class _PromotionalBannerCarouselState extends State<_PromotionalBannerCarousel> {
  late final PageController _pageController;
  Timer? _autoSlideTimer;
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    _pageController = PageController(viewportFraction: 0.96);
    _pageController.addListener(_handlePageChanged);
    _startAutoSlide();
  }

  @override
  void didUpdateWidget(covariant _PromotionalBannerCarousel oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.promotions.length != widget.promotions.length) {
      _currentIndex = 0;
      if (_pageController.hasClients) {
        _pageController.jumpToPage(0);
      }
      _startAutoSlide();
    }
  }

  @override
  void dispose() {
    _autoSlideTimer?.cancel();
    _pageController.dispose();
    super.dispose();
  }

  void _handlePageChanged() {
    if (!_pageController.hasClients) return;

    final page = _pageController.page?.round();
    if (page == null || page == _currentIndex) return;

    setState(() {
      _currentIndex = page;
    });

    if (widget.promotions.length > 1 && page == widget.promotions.length - 1) {
      Future.delayed(const Duration(milliseconds: 360), () {
        if (!mounted || !_pageController.hasClients) return;
        _pageController.jumpToPage(0);
      });
    }
  }

  void _startAutoSlide() {
    _autoSlideTimer?.cancel();

    if (widget.promotions.length < 2) return;

    _autoSlideTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (!mounted || !_pageController.hasClients) return;

      final nextIndex = _currentIndex >= widget.promotions.length - 1
          ? 0
          : _currentIndex + 1;

      _pageController.animateToPage(
        nextIndex,
        duration: const Duration(milliseconds: 700),
        curve: Curves.easeOutCubic,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final height = width > 700 ? 240.0 : 190.0;

        return Container(
          color: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(
            children: [
              SizedBox(
                height: height,
                child: PageView.builder(
                  controller: _pageController,
                  itemCount: widget.promotions.length,
                  onPageChanged: (index) {
                    if (index != _currentIndex) {
                      setState(() {
                        _currentIndex = index;
                      });
                    }
                  },
                  itemBuilder: (context, index) {
                    final promotion = widget.promotions[index];

                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: GestureDetector(
                        onTap: () async {
                          final uri = promotion.linkUrl != null &&
                                  promotion.linkUrl!.trim().isNotEmpty
                              ? Uri.tryParse(promotion.linkUrl!.trim())
                              : null;

                          if (uri != null && await canLaunchUrl(uri)) {
                            await launchUrl(
                              uri,
                              mode: LaunchMode.externalApplication,
                            );
                          }
                        },
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 250),
                          curve: Curves.easeOutCubic,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(24),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.08),
                                blurRadius: 18,
                                offset: const Offset(0, 10),
                              ),
                            ],
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(24),
                            child: Stack(
                              children: [
                                Positioned.fill(
                                  child: Image.network(
                                    promotion.imageUrl ?? '',
                                    fit: BoxFit.cover,
                                    errorBuilder: (context, error, stackTrace) {
                                      return Container(
                                        color: const Color(0xFFFFF3ED),
                                        child: const Center(
                                          child: Icon(
                                            Icons.image_not_supported_outlined,
                                            color: Color(0xFFFF6333),
                                            size: 36,
                                          ),
                                        ),
                                      );
                                    },
                                  ),
                                ),
                                Positioned.fill(
                                  child: DecoratedBox(
                                    decoration: BoxDecoration(
                                      gradient: LinearGradient(
                                        begin: Alignment.centerLeft,
                                        end: Alignment.centerRight,
                                        colors: [
                                          Colors.black.withValues(alpha: 0.65),
                                          Colors.black.withValues(alpha: 0.2),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                                Positioned.fill(
                                  child: Padding(
                                    padding: const EdgeInsets.all(20),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      mainAxisAlignment:
                                          MainAxisAlignment.end,
                                      children: [
                                        Text(
                                          promotion.title,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontSize: 20,
                                            fontWeight: FontWeight.w900,
                                          ),
                                        ),
                                        const SizedBox(height: 8),
                                        Text(
                                          promotion.description,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            color: Colors.white70,
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600,
                                            height: 1.35,
                                          ),
                                        ),
                                        const SizedBox(height: 14),
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 12,
                                            vertical: 8,
                                          ),
                                          decoration: BoxDecoration(
                                            color: Colors.white.withValues(
                                              alpha: 0.18,
                                            ),
                                            borderRadius:
                                                BorderRadius.circular(999),
                                          ),
                                          child: Text(
                                            promotion.buttonText,
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontWeight: FontWeight.w800,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 12),
              if (widget.promotions.length > 1)
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(widget.promotions.length, (index) {
                    final isActive = index == _currentIndex;
                    return AnimatedContainer(
                      duration: const Duration(milliseconds: 240),
                      curve: Curves.easeOutCubic,
                      width: isActive ? 22 : 8,
                      height: 8,
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      decoration: BoxDecoration(
                        color: isActive
                            ? const Color(0xFFFF6333)
                            : const Color(0xFFE8E1DB),
                        borderRadius: BorderRadius.circular(999),
                      ),
                    );
                  }),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _PromotionalBannerShimmer extends StatelessWidget {
  const _PromotionalBannerShimmer();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Column(
        children: [
          Container(
            height: 190,
            decoration: BoxDecoration(
              color: const Color(0xFFF8F6F3),
              borderRadius: BorderRadius.circular(24),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(4, (index) {
              return Container(
                width: 8,
                height: 8,
                margin: const EdgeInsets.symmetric(horizontal: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFE8E1DB),
                  borderRadius: BorderRadius.circular(999),
                ),
              );
            }),
          ),
        ],
      ),
    );
  }
}

class _PromotionalBannerEmptyState extends StatelessWidget {
  const _PromotionalBannerEmptyState();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFFF8F6F3),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFE8E1DB)),
      ),
      child: Row(
        children: [
          const Icon(Icons.local_offer_outlined, color: Color(0xFFFF6333)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'No promotions are available right now.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: const Color(0xFF2B211D),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PromotionalBannerErrorState extends StatelessWidget {
  final String message;

  const _PromotionalBannerErrorState({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF3ED),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFFFD7C2)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline_rounded, color: Color(0xFFFF6333)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Promotions could not be loaded right now.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: const Color(0xFF2B211D),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EventLocationSheet extends StatefulWidget {
  final CustomerAddressModel selectedAddress;
  final List<CustomerAddressModel> savedAddresses;
  final VoidCallback onOpenMap;
  final VoidCallback onAddAddress;
  final ValueChanged<CustomerAddressModel> onSelectAddress;

  const _EventLocationSheet({
    required this.selectedAddress,
    required this.savedAddresses,
    required this.onOpenMap,
    required this.onAddAddress,
    required this.onSelectAddress,
  });

  @override
  State<_EventLocationSheet> createState() => _EventLocationSheetState();
}

class _EventLocationSheetState extends State<_EventLocationSheet> {
  final ScrollController _scrollController = ScrollController();
  bool _hidePreview = false;

  @override
  void initState() {
    super.initState();

    _scrollController.addListener(() {
      final shouldHide = _scrollController.offset > 30;
      if (shouldHide != _hidePreview) {
        setState(() => _hidePreview = shouldHide);
      }
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottomPadding = MediaQuery.of(context).padding.bottom;
    final visibleSavedAddresses = widget.savedAddresses
        .where((address) => address.id != widget.selectedAddress.id)
        .take(3)
        .toList();

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
      ),
      child: SafeArea(
        top: false,
        child: ListView(
          controller: _scrollController,
          shrinkWrap: true,
          padding: EdgeInsets.fromLTRB(20, 12, 20, 18 + bottomPadding),
          children: [
            Center(
              child: Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFE8E1DB),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 18),

            AnimatedSize(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOut,
              child: _hidePreview
                  ? const SizedBox.shrink()
                  : Column(
                      children: [
                        Row(
                          children: [
                            const Expanded(
                              child: Text(
                                'Selected Event Location',
                                style: TextStyle(
                                  color: Color(0xFF2B211D),
                                  fontSize: 21,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                            TextButton(
                              onPressed: widget.onOpenMap,
                              child: const Text(
                                'Change',
                                style: TextStyle(
                                  color: Color(0xFFFF6333),
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        _EventMapPreview(
                          address: widget.selectedAddress,
                          onTap: widget.onOpenMap,
                        ),
                        const SizedBox(height: 12),
                        _EventAddressRow(
                          address: widget.selectedAddress,
                          selected: true,
                          onTap: () {},
                          trailing: const Icon(
                            Icons.check_circle_rounded,
                            color: Color(0xFFFF6333),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFFF3ED),
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: const Text(
                            'Your service provider will go to the pinned event location. You can edit the written address on the next page.',
                            style: TextStyle(
                              color: Color(0xFF2B211D),
                              height: 1.35,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        const SizedBox(height: 18),
                      ],
                    ),
            ),

            if (visibleSavedAddresses.isNotEmpty) ...[
              const Text(
                'Saved addresses',
                style: TextStyle(
                  color: Color(0xFF2B211D),
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 8),
              for (final address in visibleSavedAddresses)
                _EventAddressRow(
                  address: address,
                  selected: false,
                  onTap: () => widget.onSelectAddress(address),
                  trailing: const Icon(Icons.chevron_right_rounded),
                ),
            ],

            const SizedBox(height: 12),
            _LocationSheetAction(
              icon: Icons.add_rounded,
              title: 'Add New Address',
              onTap: widget.onAddAddress,
            ),
            _LocationSheetAction(
              icon: Icons.search_rounded,
              title: 'Change / Search Event Location',
              onTap: widget.onOpenMap,
            ),
          ],
        ),
      ),
    );
  }
}

class _EventMapPreview extends StatelessWidget {
  final CustomerAddressModel address;
  final VoidCallback onTap;

  const _EventMapPreview({required this.address, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(22),
      child: SizedBox(
        height: 148,
        child: Stack(
          children: [
            GoogleMap(
              initialCameraPosition: CameraPosition(
                target: LatLng(address.latitude, address.longitude),
                zoom: 16,
              ),
              liteModeEnabled: true,
              zoomControlsEnabled: false,
              myLocationButtonEnabled: false,
              mapToolbarEnabled: false,
              scrollGesturesEnabled: false,
              zoomGesturesEnabled: false,
              rotateGesturesEnabled: false,
              tiltGesturesEnabled: false,
              markers: {
                Marker(
                  markerId: const MarkerId('selected_event_location'),
                  position: LatLng(address.latitude, address.longitude),
                ),
              },
            ),
            Material(
              color: Colors.transparent,
              child: InkWell(onTap: onTap),
            ),
          ],
        ),
      ),
    );
  }
}

class _EventAddressRow extends StatelessWidget {
  final CustomerAddressModel address;
  final bool selected;
  final VoidCallback onTap;
  final Widget trailing;

  const _EventAddressRow({
    required this.address,
    required this.selected,
    required this.onTap,
    required this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFFFFF7F3) : Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: selected ? const Color(0xFFFF6333) : const Color(0xFFE8E1DB),
          ),
        ),
        child: Row(
          children: [
            Icon(
              selected
                  ? Icons.radio_button_checked
                  : Icons.location_on_outlined,
              color: selected
                  ? const Color(0xFFFF6333)
                  : const Color(0xFF8C817A),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    address.displayTitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Color(0xFF2B211D),
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    address.displaySubtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Color(0xFF8C817A),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            trailing,
          ],
        ),
      ),
    );
  }
}

class _LocationSheetAction extends StatelessWidget {
  final IconData icon;
  final String title;
  final VoidCallback onTap;

  const _LocationSheetAction({
    required this.icon,
    required this.title,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: const Color(0xFFFF6333)),
      title: Text(
        title,
        style: const TextStyle(
          color: Color(0xFF2B211D),
          fontWeight: FontWeight.w900,
        ),
      ),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    );
  }
}

class _HomeSearchBar extends StatelessWidget {
  const _HomeSearchBar();

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => const CustomerSearchScreen(autofocusSearch: true),
          ),
        );
      },
      child: Container(
        height: 48,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(
          color: const Color(0xFFF8F6F3),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE8E1DB)),
        ),
        child: const Row(
          children: [
            Icon(Icons.search, color: primary, size: 24),
            SizedBox(width: 12),
            Expanded(
              child: Text(
                'Search caterers and services',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: Color(0xFF8C817A),
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BrowseCategoriesSection extends StatelessWidget {
  final List<_HomeCategoryItem> categories;

  const _BrowseCategoriesSection({required this.categories});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Browse Categories',
                style: TextStyle(
                  color: Color(0xFF2B211D),
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
              TextButton(
                onPressed: () {},
                child: const Text(
                  'See All',
                  style: TextStyle(
                    color: Color(0xFFFF6333),
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 4,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 0.85,
            children: categories
                .map((category) => _CategoryTile(category: category))
                .toList(),
          ),
        ],
      ),
    );
  }
}

class _CategoryTile extends StatelessWidget {
  final _HomeCategoryItem category;

  const _CategoryTile({required this.category});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: () {},
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: const Color(0xFFF8F6F3),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFE8E1DB)),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              height: 44,
              width: 44,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(
                category.icon,
                color: const Color(0xFFFF6333),
                size: 24,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              category.label,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Color(0xFF2B211D),
                fontSize: 11,
                fontWeight: FontWeight.w900,
                height: 1.25,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProviderHorizontalSection extends StatelessWidget {
  final String title;
  final String subtitle;
  final Stream<List<ProviderModel>> stream;
  final String emptyText;

  const _ProviderHorizontalSection({
    required this.title,
    required this.subtitle,
    required this.stream,
    required this.emptyText,
  });

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<ProviderModel>>(
      stream: stream,
      builder: (context, snapshot) {
        final providers = snapshot.data ?? [];

        return Container(
          color: Colors.white,
          margin: const EdgeInsets.only(top: 8),
          padding: const EdgeInsets.fromLTRB(16, 16, 0, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(right: 16, bottom: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: Color(0xFF2B211D),
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: Color(0xFF8C817A),
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),

              if (snapshot.connectionState == ConnectionState.waiting)
                const FeastaSkeletonHorizontalCards(
                  height: 225,
                  width: 180,
                  padding: EdgeInsets.only(right: 16),
                )
              else if (providers.isEmpty)
                Container(
                  margin: const EdgeInsets.only(right: 16),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE8E1DB)),
                  ),
                  child: Text(
                    emptyText,
                    style: const TextStyle(
                      color: Color(0xFF8C817A),
                      fontSize: 13,
                    ),
                  ),
                )
              else
                SizedBox(
                  height: 240,
                  child: ListView.separated(
                    padding: const EdgeInsets.only(right: 16),
                    scrollDirection: Axis.horizontal,
                    itemCount: providers.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 12),
                    itemBuilder: (context, index) {
                      return _HorizontalProviderCard(
                        provider: providers[index],
                      );
                    },
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final String subtitle;

  const _SectionHeader({required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 22),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 25,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: const TextStyle(
                    color: Colors.grey,
                    fontWeight: FontWeight.w700,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: Colors.grey),
        ],
      ),
    );
  }
}

class _HorizontalProviderCard extends StatelessWidget {
  final ProviderModel provider;

  const _HorizontalProviderCard({required this.provider});

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);
    final imageUrl = provider.coverImageUrl ?? '';

    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ProviderProfileScreen(provider: provider),
          ),
        );
      },
      child: Container(
        width: 190,
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: const Color(0xFFE5E7EB)),
          borderRadius: BorderRadius.circular(20),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            imageUrl.isEmpty
                ? Container(
                    height: 85,
                    width: double.infinity,
                    color: Colors.grey.shade200,
                    child: const Icon(
                      Icons.image_outlined,
                      size: 40,
                      color: Colors.grey,
                    ),
                  )
                : Image.network(
                    imageUrl,
                    height: 85,
                    width: double.infinity,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) {
                      return Container(
                        height: 85,
                        width: double.infinity,
                        color: Colors.grey.shade200,
                        child: const Icon(
                          Icons.broken_image,
                          color: Colors.grey,
                        ),
                      );
                    },
                  ),
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          provider.businessName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                          if (provider.isApproved)
                        const Icon(
                          Icons.verified,
                          color: Colors.green,
                          size: 17,
                        ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Container(
                    constraints: const BoxConstraints(maxWidth: 160),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: primary.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      providerCategoryLabel(provider.providerCategory),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: primary,
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      const Icon(Icons.star, color: Colors.amber, size: 15),
                      const SizedBox(width: 3),
                      Text(
                        '${provider.ratingAverage.toStringAsFixed(1)} (${provider.reviewCount})',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Text(
                    '₱${provider.minPrice.toStringAsFixed(0)} - ₱${provider.maxPrice.toStringAsFixed(0)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: primary,
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Row(
                    children: [
                      const Icon(
                        Icons.location_on_outlined,
                        size: 14,
                        color: Colors.grey,
                      ),
                      const SizedBox(width: 3),
                      Expanded(
                        child: Text(
                          provider.location,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.grey,
                            fontSize: 11,
                          ),
                        ),
                      ),
                    ],
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

class _HomeCategoryItem {
  final String label;
  final IconData icon;

  const _HomeCategoryItem(this.label, this.icon);
}

class _HomeFilterItem {
  final String label;
  final IconData icon;

  const _HomeFilterItem(this.label, this.icon);
}
