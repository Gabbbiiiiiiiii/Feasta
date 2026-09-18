import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/helpers/auth_guard.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../shared/models/customer_address_model.dart';
import '../../shared/models/feasta_models.dart';
import '../../shared/models/promotion_model.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import '../authentication/data/services/customer_address_storage_service.dart';
import '../authentication/data/services/promotion_service.dart';
import '../notifications/notifications_screen.dart';
import 'customer_provider_collection_screen.dart';
import 'customer_search_screen.dart';
import 'location_picker_screen.dart';
import 'provider_profile_screen.dart';

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

  static const List<_EventServiceItem> _eventServices = [
    _EventServiceItem(
      label: 'Catering',
      searchQuery: 'Catering Service',
      icon: Icons.restaurant_menu_rounded,
    ),
    _EventServiceItem(
      label: 'Photography & Video',
      searchQuery: '',
      icon: Icons.photo_camera_rounded,
    ),
    _EventServiceItem(
      label: 'Event Styling',
      searchQuery: 'Event Styling',
      icon: Icons.auto_awesome_rounded,
    ),
    _EventServiceItem(
      label: 'Venues',
      searchQuery: 'Venue Provider',
      icon: Icons.location_city_rounded,
    ),
    _EventServiceItem(
      label: 'Cakes',
      searchQuery: 'Cake Provider',
      icon: Icons.cake_rounded,
    ),
    _EventServiceItem(
      label: 'Entertainment',
      searchQuery: 'Singer / Band',
      icon: Icons.music_note_rounded,
    ),
    _EventServiceItem(
      label: 'Rentals',
      searchQuery: 'Rental',
      icon: Icons.chair_alt_outlined,
    ),
    _EventServiceItem(
      label: 'Other Services',
      searchQuery: '',
      icon: Icons.grid_view_rounded,
    ),
  ];

  @override
  void initState() {
    super.initState();
    _selectedAddressFuture = _addressStorage.getSelectedOrDefault();
  }

  Future<void> _refresh() async {
    setState(() {
      _selectedAddressFuture = _addressStorage.getSelectedOrDefault();
    });

    await Future<void>.delayed(const Duration(milliseconds: 400));
  }

  Future<void> _changeLocation() async {
    final address = await Navigator.of(context).push<CustomerAddressModel>(
      MaterialPageRoute(builder: (_) => const LocationPickerScreen()),
    );

    if (address == null || !mounted) {
      return;
    }

    await _addressStorage.saveSelectedAddress(address);

    if (!mounted) {
      return;
    }

    setState(() {
      _selectedAddressFuture = Future<CustomerAddressModel>.value(address);
    });
  }

  void _openSearch({String initialQuery = '', bool autofocus = false}) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CustomerSearchScreen(
          initialQuery: initialQuery,
          autofocusSearch: autofocus,
        ),
      ),
    );
  }

  void _openAllServices() {
    _openSearch(autofocus: false);
  }

  void _openRecommended() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CustomerProviderCollectionScreen(
          title: 'Recommended for You',
          subtitle: 'Verified providers selected for your next celebration.',
          stream: _repository.featuredProviders(),
        ),
      ),
    );
  }

  void _openPopular() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CustomerProviderCollectionScreen(
          title: 'Popular Providers',
          subtitle: 'Providers customers are discovering across FEASTA.',
          stream: _repository.searchAllVerifiedProviders(
            keyword: '',
            eventType: 'All',
            location: '',
            minBudget: null,
            maxBudget: null,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.primary,
          onRefresh: _refresh,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: _HomeHeader(
                  repository: _repository,
                  selectedAddressFuture: _selectedAddressFuture,
                  onLocationTap: _changeLocation,
                  onSearchTap: () => _openSearch(autofocus: true),
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.sm)),
              const SliverToBoxAdapter(child: _PromotionSection()),
              const SliverToBoxAdapter(
                child: SizedBox(height: AppSpacing.section),
              ),
              SliverToBoxAdapter(
                child: _EventServicesSection(
                  items: _eventServices,
                  onSeeAll: _openAllServices,
                  onItemTap: (item) {
                    if (item.label == 'Photography & Video' ||
                        item.label == 'Other Services') {
                      _openSearch();
                      return;
                    }

                    _openSearch(initialQuery: item.searchQuery);
                  },
                ),
              ),
              const SliverToBoxAdapter(
                child: SizedBox(height: AppSpacing.section),
              ),
              SliverToBoxAdapter(
                child: _RecommendedSection(
                  repository: _repository,
                  onSeeAll: _openRecommended,
                ),
              ),
              const SliverToBoxAdapter(
                child: SizedBox(height: AppSpacing.section),
              ),
              SliverToBoxAdapter(
                child: _PopularSection(
                  repository: _repository,
                  onSeeAll: _openPopular,
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 132)),
            ],
          ),
        ),
      ),
    );
  }
}

class _HomeHeader extends StatelessWidget {
  const _HomeHeader({
    required this.repository,
    required this.selectedAddressFuture,
    required this.onLocationTap,
    required this.onSearchTap,
  });

  final FeastaRepository repository;
  final Future<CustomerAddressModel> selectedAddressFuture;
  final VoidCallback onLocationTap;
  final VoidCallback onSearchTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.background,
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.lg,
        AppSpacing.screen,
        AppSpacing.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: isGuestUser
                    ? const _GuestGreeting()
                    : StreamBuilder<UserModel?>(
                        stream: repository.currentUserData(),
                        builder: (context, snapshot) {
                          final firstName =
                              snapshot.data?.firstName.trim() ?? '';

                          return _Greeting(
                            firstName: firstName.isEmpty ? 'there' : firstName,
                          );
                        },
                      ),
              ),
              const SizedBox(width: AppSpacing.sm),
              _NotificationButton(repository: repository),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          InkWell(
            borderRadius: BorderRadius.circular(AppRadius.pill),
            onTap: onLocationTap,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.location_on_rounded,
                  color: AppColors.primary,
                  size: 20,
                ),
                const SizedBox(width: AppSpacing.xs),
                Text(
                  'Home',
                  style: AppTypography.label.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const Icon(
                  Icons.keyboard_arrow_down_rounded,
                  color: AppColors.mainText,
                  size: 20,
                ),
                Container(
                  width: 1,
                  height: 18,
                  margin: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
                  color: AppColors.border,
                ),
                Flexible(
                  child: FutureBuilder<CustomerAddressModel>(
                    future: selectedAddressFuture,
                    builder: (context, snapshot) {
                      final address = snapshot.data;

                      return Text(
                        address?.displayTitle ?? 'Event location',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.caption.copyWith(
                          color: AppColors.secondaryTextAccessible,
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          Semantics(
            button: true,
            label: 'Search caterers and event services',
            child: Material(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppRadius.large),
              child: InkWell(
                onTap: onSearchTap,
                borderRadius: BorderRadius.circular(AppRadius.large),
                child: Container(
                  height: 58,
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                  ),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(AppRadius.large),
                    border: Border.all(color: AppColors.border),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x0A000000),
                        blurRadius: 12,
                        offset: Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 38,
                        height: 38,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AppColors.primarySubtle,
                          borderRadius: BorderRadius.circular(AppRadius.pill),
                        ),
                        child: const Icon(
                          Icons.search_rounded,
                          color: AppColors.primary,
                          size: 21,
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Text(
                          'Search caterers and services',
                          style: AppTypography.body.copyWith(
                            color: AppColors.secondaryTextAccessible,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const Icon(
                        Icons.tune_rounded,
                        color: AppColors.mainText,
                        size: 21,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GuestGreeting extends StatelessWidget {
  const _GuestGreeting();

  @override
  Widget build(BuildContext context) {
    return const _Greeting(firstName: 'there');
  }
}

class _Greeting extends StatelessWidget {
  const _Greeting({required this.firstName});

  final String firstName;

  @override
  Widget build(BuildContext context) {
    final hour = DateTime.now().hour;

    final period = hour < 12
        ? 'Good morning'
        : hour < 18
        ? 'Good afternoon'
        : 'Good evening';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          period,
          style: AppTypography.bodySmall.copyWith(
            color: AppColors.secondaryTextAccessible,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          'Hi, $firstName!',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.headline.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }
}

class _NotificationButton extends StatelessWidget {
  const _NotificationButton({required this.repository});

  final FeastaRepository repository;

  @override
  Widget build(BuildContext context) {
    if (isGuestUser) {
      return _BellButton(
        unreadCount: 0,
        onPressed: () {
          requireLogin(
            context,
            message:
                'Please log in or create an account to view notifications.',
          );
        },
      );
    }

    return StreamBuilder(
      stream: repository.myNotifications(),
      builder: (context, snapshot) {
        final docs = snapshot.data?.docs ?? [];

        final unreadCount = docs
            .where((doc) => doc.data()['isRead'] == false)
            .length;

        return _BellButton(
          unreadCount: unreadCount,
          onPressed: () {
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const NotificationsScreen()),
            );
          },
        );
      },
    );
  }
}

class _BellButton extends StatelessWidget {
  const _BellButton({required this.unreadCount, required this.onPressed});

  final int unreadCount;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Material(
          color: AppColors.surface,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.large),
            side: const BorderSide(color: AppColors.border),
          ),
          child: IconButton(
            tooltip: 'Notifications',
            onPressed: onPressed,
            icon: const Icon(
              Icons.notifications_none_rounded,
              color: AppColors.mainText,
            ),
          ),
        ),
        if (unreadCount > 0)
          Positioned(
            right: -2,
            top: -3,
            child: Container(
              constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(horizontal: 4),
              decoration: const BoxDecoration(
                color: AppColors.error,
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

class _PromotionSection extends StatelessWidget {
  const _PromotionSection();

  @override
  Widget build(BuildContext context) {
    final service = PromotionService();

    return StreamBuilder<List<PromotionModel>>(
      stream: service.watchActivePromotions(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.symmetric(horizontal: AppSpacing.screen),
            child: _PromotionLoadingCard(),
          );
        }

        final promotions = snapshot.data ?? const <PromotionModel>[];

        if (snapshot.hasError || promotions.isEmpty) {
          return const Padding(
            padding: EdgeInsets.symmetric(horizontal: AppSpacing.screen),
            child: _PromotionEmptyCard(),
          );
        }

        return _PromotionRail(promotions: promotions);
      },
    );
  }
}

class _PromotionLoadingCard extends StatelessWidget {
  const _PromotionLoadingCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 72,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.large),
        border: Border.all(color: AppColors.border),
      ),
      alignment: Alignment.center,
      child: const CircularProgressIndicator(
        strokeWidth: 2,
        color: AppColors.primary,
      ),
    );
  }
}

class _PromotionEmptyCard extends StatelessWidget {
  const _PromotionEmptyCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 72),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.large),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.primarySubtle,
              borderRadius: BorderRadius.circular(AppRadius.medium),
            ),
            child: const Icon(
              Icons.local_offer_outlined,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              'No promotions are available right now.',
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PromotionRail extends StatelessWidget {
  const _PromotionRail({required this.promotions});

  final List<PromotionModel> promotions;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 116,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screen),
        itemCount: promotions.length,
        separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.sm),
        itemBuilder: (context, index) {
          final promotion = promotions[index];

          return SizedBox(
            width: MediaQuery.sizeOf(context).width * 0.82,
            child: _PromotionCard(promotion: promotion),
          );
        },
      ),
    );
  }
}

class _PromotionCard extends StatelessWidget {
  const _PromotionCard({required this.promotion});

  final PromotionModel promotion;

  Future<void> _openPromotion() async {
    final raw = promotion.linkUrl?.trim() ?? '';

    if (raw.isEmpty) {
      return;
    }

    final uri = Uri.tryParse(raw);

    if (uri != null && await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.primarySubtle,
      borderRadius: BorderRadius.circular(AppRadius.large),
      child: InkWell(
        onTap: _openPromotion,
        borderRadius: BorderRadius.circular(AppRadius.large),
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.large),
            border: Border.all(
              color: AppColors.primary.withValues(alpha: 0.22),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: AppColors.surface,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.local_offer_outlined,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      promotion.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.label.copyWith(
                        color: AppColors.mainText,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      promotion.subtitle?.trim().isNotEmpty == true
                          ? promotion.subtitle!
                          : promotion.description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.caption.copyWith(
                        color: AppColors.secondaryTextAccessible,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EventServicesSection extends StatelessWidget {
  const _EventServicesSection({
    required this.items,
    required this.onSeeAll,
    required this.onItemTap,
  });

  final List<_EventServiceItem> items;
  final VoidCallback onSeeAll;
  final ValueChanged<_EventServiceItem> onItemTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _SectionHeader(
          title: 'Event Services',
          subtitle: 'Everything you need for your celebration',
          onSeeAll: onSeeAll,
        ),
        const SizedBox(height: AppSpacing.md),
        SizedBox(
          height: 116,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screen),
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.sm),
            itemBuilder: (context, index) {
              final item = items[index];

              return _EventServiceCard(
                item: item,
                onTap: () => onItemTap(item),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _EventServiceCard extends StatelessWidget {
  const _EventServiceCard({required this.item, required this.onTap});

  final _EventServiceItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: item.label == 'Photography & Video' ? 116 : 92,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.card),
        onTap: onTap,
        child: Column(
          children: [
            Container(
              height: 80,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(AppRadius.card),
                border: Border.all(color: AppColors.border),
              ),
              child: Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.primarySubtle,
                  borderRadius: BorderRadius.circular(AppRadius.medium),
                ),
                child: Icon(item.icon, color: AppColors.primary, size: 24),
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              item.label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: AppTypography.caption.copyWith(
                color: AppColors.mainText,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RecommendedSection extends StatelessWidget {
  const _RecommendedSection({required this.repository, required this.onSeeAll});

  final FeastaRepository repository;
  final VoidCallback onSeeAll;

  @override
  Widget build(BuildContext context) {
    return _ProviderHomeSection(
      title: 'Recommended for You',
      subtitle: 'Verified providers for your next celebration',
      stream: repository.featuredProviders(),
      onSeeAll: onSeeAll,
      excludedIds: const <String>{},
    );
  }
}

class _PopularSection extends StatefulWidget {
  const _PopularSection({required this.repository, required this.onSeeAll});

  final FeastaRepository repository;
  final VoidCallback onSeeAll;

  @override
  State<_PopularSection> createState() => _PopularSectionState();
}

class _PopularSectionState extends State<_PopularSection> {
  Set<String> _recommendedIds = const <String>{};
  StreamSubscription<List<ProviderModel>>? _recommendedSubscription;

  @override
  void initState() {
    super.initState();

    _recommendedSubscription = widget.repository.featuredProviders().listen((
      providers,
    ) {
      if (!mounted) {
        return;
      }

      setState(() {
        _recommendedIds = providers.map((provider) => provider.id).toSet();
      });
    });
  }

  @override
  void dispose() {
    _recommendedSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _ProviderHomeSection(
      title: 'Popular Providers',
      subtitle: 'Highly rated providers customers are discovering',
      stream: widget.repository.searchAllVerifiedProviders(
        keyword: '',
        eventType: 'All',
        location: '',
        minBudget: null,
        maxBudget: null,
      ),
      onSeeAll: widget.onSeeAll,
      excludedIds: _recommendedIds,
    );
  }
}

class _ProviderHomeSection extends StatelessWidget {
  const _ProviderHomeSection({
    required this.title,
    required this.subtitle,
    required this.stream,
    required this.onSeeAll,
    required this.excludedIds,
  });

  final String title;
  final String subtitle;
  final Stream<List<ProviderModel>> stream;
  final VoidCallback onSeeAll;
  final Set<String> excludedIds;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _SectionHeader(title: title, subtitle: subtitle, onSeeAll: onSeeAll),
        const SizedBox(height: AppSpacing.md),
        SizedBox(
          height: 245,
          child: StreamBuilder<List<ProviderModel>>(
            stream: stream,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(
                  child: CircularProgressIndicator(color: AppColors.primary),
                );
              }

              final providers = (snapshot.data ?? const <ProviderModel>[])
                  .where((provider) => !excludedIds.contains(provider.id))
                  .take(8)
                  .toList(growable: false);

              if (snapshot.hasError || providers.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.screen,
                  ),
                  child: Container(
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(AppRadius.large),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Text(
                      'No providers available yet.',
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.secondaryTextAccessible,
                      ),
                    ),
                  ),
                );
              }

              return ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.screen,
                ),
                itemCount: providers.length,
                separatorBuilder: (_, _) =>
                    const SizedBox(width: AppSpacing.sm),
                itemBuilder: (context, index) {
                  return _HomeProviderCard(provider: providers[index]);
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

class _HomeProviderCard extends StatelessWidget {
  const _HomeProviderCard({required this.provider});

  final ProviderModel provider;

  @override
  Widget build(BuildContext context) {
    final imageUrl = provider.coverImageUrl?.trim() ?? '';

    return SizedBox(
      width: 188,
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.card),
        child: InkWell(
          onTap: () {
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ProviderProfileScreen(provider: provider),
              ),
            );
          },
          borderRadius: BorderRadius.circular(AppRadius.card),
          child: Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppRadius.card),
              border: Border.all(color: AppColors.border),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x0A000000),
                  blurRadius: 12,
                  offset: Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  height: 112,
                  width: double.infinity,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (imageUrl.isEmpty)
                        Container(
                          color: AppColors.primarySubtle,
                          alignment: Alignment.center,
                          child: const Icon(
                            Icons.storefront_outlined,
                            color: AppColors.primary,
                            size: 34,
                          ),
                        )
                      else
                        Image.network(
                          imageUrl,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => Container(
                            color: AppColors.primarySubtle,
                            alignment: Alignment.center,
                            child: const Icon(
                              Icons.storefront_outlined,
                              color: AppColors.primary,
                            ),
                          ),
                        ),
                      if (provider.isApproved)
                        Positioned(
                          left: AppSpacing.xs,
                          bottom: AppSpacing.xs,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 7,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.surface.withValues(alpha: 0.95),
                              borderRadius: BorderRadius.circular(
                                AppRadius.pill,
                              ),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.verified_rounded,
                                  color: AppColors.success,
                                  size: 14,
                                ),
                                SizedBox(width: 3),
                                Text(
                                  'Verified',
                                  style: TextStyle(
                                    color: AppColors.success,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.sm),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        provider.businessName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.label.copyWith(
                          color: AppColors.mainText,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        _providerCategoryLabel(provider),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.caption.copyWith(
                          color: AppColors.secondaryTextAccessible,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Row(
                        children: [
                          const Icon(
                            Icons.star_rounded,
                            size: 16,
                            color: Colors.amber,
                          ),
                          const SizedBox(width: 3),
                          Text(
                            provider.ratingAverage.toStringAsFixed(1),
                            style: AppTypography.caption.copyWith(
                              color: AppColors.mainText,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Text(
                            ' (${provider.reviewCount})',
                            style: AppTypography.caption.copyWith(
                              color: AppColors.secondaryTextAccessible,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        provider.location,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.caption.copyWith(
                          color: AppColors.secondaryTextAccessible,
                        ),
                      ),
                    ],
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

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    required this.subtitle,
    required this.onSeeAll,
  });

  final String title;
  final String subtitle;
  final VoidCallback onSeeAll;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screen),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: AppTypography.sectionTitle.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: AppTypography.caption.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          TextButton(
            onPressed: onSeeAll,
            style: TextButton.styleFrom(
              foregroundColor: AppColors.primaryStrong,
              minimumSize: const Size(44, 44),
            ),
            child: const Text(
              'See all',
              style: TextStyle(fontWeight: FontWeight.w900),
            ),
          ),
        ],
      ),
    );
  }
}

class _EventServiceItem {
  const _EventServiceItem({
    required this.label,
    required this.searchQuery,
    required this.icon,
  });

  final String label;
  final String searchQuery;
  final IconData icon;
}

String _providerCategoryLabel(ProviderModel provider) {
  final raw = provider.providerCategory.trim();

  if (raw.isEmpty) {
    return provider.providerServiceType == 'catering'
        ? 'Catering Service'
        : 'Event Service';
  }

  return raw
      .replaceAll('_', ' ')
      .split(' ')
      .where((part) => part.isNotEmpty)
      .map(
        (part) => '${part[0].toUpperCase()}${part.substring(1).toLowerCase()}',
      )
      .join(' ');
}
