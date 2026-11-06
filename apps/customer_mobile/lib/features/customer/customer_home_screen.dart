import 'widgets/provider_grid.dart';
import 'event_list/event_list_navigation.dart';
import 'widgets/provider_brand_visual.dart';
import '../../core/domain/service_category.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:firebase_auth/firebase_auth.dart';
import '../../core/helpers/auth_guard.dart';
import '../../core/helpers/provider_category_helper.dart';
import '../../core/helpers/provider_discovery.dart';
import '../../core/services/occasion_catalog_service.dart';
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
import 'home_text_colors.dart';
import 'home_booking_timeline.dart';
import 'customer_provider_collection_screen.dart';
import 'customer_search_screen.dart';
import 'location_picker_screen.dart';

class CustomerHomeScreen extends StatefulWidget {
  const CustomerHomeScreen({
    super.key,
    this.repository,
    this.addressStorage,
    this.promotions,
    this.occasionLoader,
    this.onExploreProviders,
    this.onCloseExplore,
  });

  final ValueChanged<Widget>? onExploreProviders;
  final VoidCallback? onCloseExplore;
  final FeastaRepository? repository;
  final CustomerAddressStorageService? addressStorage;
  final Stream<List<PromotionModel>>? promotions;

  /// Optional catalog loader passed to the Search screen.
  final Future<List<CatalogOccasion>> Function()? occasionLoader;

  @override
  State<CustomerHomeScreen> createState() => _CustomerHomeScreenState();
}

class _CustomerHomeScreenState extends State<CustomerHomeScreen> {
  String? _selectedCategory;
  late final FeastaRepository _repository;
  late final CustomerAddressStorageService _addressStorage;

  late Future<CustomerAddressModel> _selectedAddressFuture;
  late final Future<Map<String, String>> _serviceCategoryNames;

  late Future<List<ServiceCategory>> _eventServices;

  @override
  void initState() {
    super.initState();
    _repository = widget.repository ?? FeastaRepository();
    _addressStorage = widget.addressStorage ?? CustomerAddressStorageService();
    _selectedAddressFuture = _addressStorage.getSelectedOrDefault();
    _serviceCategoryNames = _repository.getServiceCategoryNameMap();
    _eventServices = _repository.getActiveServiceCategories(forceRefresh: true);
  }

  Future<void> _refresh() async {
    setState(() {
      _eventServices = _repository.getActiveServiceCategories(
        forceRefresh: true,
      );
      _selectedAddressFuture = _addressStorage.getSelectedOrDefault();
    });

    try {
      await _eventServices;
    } catch (_) {
      // The section renders the error and retry action.
    }
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

  void _openSearch({
    String initialQuery = '',
    String? categoryCode,
    bool autofocus = false,
    bool showFilters = false,
  }) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CustomerSearchScreen(
          initialQuery: initialQuery,
          initialCategoryCode: categoryCode,
          repository: _repository,
          occasionLoader: widget.occasionLoader,
          initialShowFilters: showFilters,
          autofocusSearch: autofocus,
        ),
      ),
    );
  }

  void _openPopular() {
    final screen = CustomerProviderCollectionScreen(
      title: 'Explore Providers',
      subtitle: 'Browse public event services for your celebration.',
      stream: _repository.searchAllVerifiedProviders(
        keyword: '',
        eventType: 'All',
        location: '',
        minBudget: null,
        maxBudget: null,
      ),
      serviceCategoryNames: _serviceCategoryNames,
      onBack: widget.onCloseExplore,
    );
    if (widget.onExploreProviders != null) {
      widget.onExploreProviders!(screen);
      return;
    }
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
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
                  onFilterTap: () => _openSearch(showFilters: true),
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.xs)),
              SliverToBoxAdapter(
                child: StreamBuilder<User?>(
                  stream: FirebaseAuth.instance.authStateChanges(),
                  initialData: FirebaseAuth.instance.currentUser,
                  builder: (context, snapshot) => snapshot.data == null
                      ? const SizedBox.shrink()
                      : HomeBookingTimeline(
                          key: ValueKey(snapshot.data!.uid),
                          repository: _repository,
                        ),
                ),
              ),
              SliverToBoxAdapter(
                child: _PromotionSection(stream: widget.promotions),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.xs)),
              SliverToBoxAdapter(
                child: FutureBuilder<List<ServiceCategory>>(
                  future: _eventServices,
                  builder: (context, snapshot) {
                    final loaded =
                        snapshot.connectionState == ConnectionState.done &&
                        !snapshot.hasError;
                    return _EventServicesSection(
                      items: loaded
                          ? snapshot.data ?? const <ServiceCategory>[]
                          : const [],
                      loading: snapshot.connectionState != ConnectionState.done,
                      failed:
                          snapshot.hasError &&
                          snapshot.connectionState == ConnectionState.done,
                      onRetry: _refresh,
                      selectedCategory: _selectedCategory,
                      onSeeAll: () => setState(() => _selectedCategory = null),
                      onItemTap: (item) =>
                          setState(() => _selectedCategory = item.code),
                    );
                  },
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.md)),
              SliverToBoxAdapter(
                child: _PopularSection(
                  selectedCategory: _selectedCategory,
                  repository: _repository,
                  onSeeAll: _openPopular,
                  onCategorySeeAll: (code) => _openSearch(categoryCode: code),
                  categories: _eventServices,
                  onRetry: _refresh,
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
    required this.onFilterTap,
  });

  final FeastaRepository repository;
  final Future<CustomerAddressModel> selectedAddressFuture;
  final VoidCallback onLocationTap;
  final VoidCallback onSearchTap;
  final VoidCallback onFilterTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.background,
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.sm,
        AppSpacing.screen,
        AppSpacing.none,
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

                          return HomeGreeting(
                            firstName: firstName.isEmpty ? 'there' : firstName,
                          );
                        },
                      ),
              ),
              const SizedBox(width: AppSpacing.sm),
              IconButton(
                tooltip: 'My Event List',
                onPressed: () => openCustomerEventList(context),
                icon: const Icon(
                  Icons.checklist_rounded,
                  color: customerDecorativeIconColor,
                ),
              ),
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
                  color: customerDecorativeIconColor,
                  size: 20,
                ),
                const SizedBox(width: AppSpacing.xs),
                Text(
                  'Home',
                  style: AppTypography.label.copyWith(
                    color: HomeTextColors.primary,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const Icon(
                  Icons.keyboard_arrow_down_rounded,
                  color: customerDecorativeIconColor,
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
                        address?.displayTitle ?? 'Ormoc City',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.caption.copyWith(
                          color: HomeTextColors.secondary,
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
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
                  height: 52,
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
                          color: customerDecorativeIconColor,
                          size: 21,
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Text(
                          'Search caterers and services',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.body.copyWith(
                            color: HomeTextColors.secondary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Search filters',
                        onPressed: onFilterTap,
                        icon: const Icon(
                          Icons.tune_rounded,
                          color: customerDecorativeIconColor,
                          size: 21,
                        ),
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
    return const HomeGreeting(firstName: 'there');
  }
}

class HomeGreeting extends StatelessWidget {
  const HomeGreeting({required this.firstName, super.key});

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
            color: HomeTextColors.secondary,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          'Hi, $firstName!',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.sectionTitle.copyWith(
            color: HomeTextColors.primary,
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
              color: customerDecorativeIconColor,
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

class _PromotionSection extends StatefulWidget {
  const _PromotionSection({this.stream});
  final Stream<List<PromotionModel>>? stream;
  @override
  State<_PromotionSection> createState() => _PromotionSectionState();
}

class _PromotionSectionState extends State<_PromotionSection> {
  late final Stream<User?> _authChanges = FirebaseAuth.instance
      .authStateChanges();
  Stream<List<PromotionModel>>? _promotions;
  String? _uid;

  Stream<List<PromotionModel>> _forUser(User? user) {
    if (_promotions == null || _uid != user?.uid) {
      _uid = user?.uid;
      _promotions = user == null
          ? Stream.value(const <PromotionModel>[])
          : PromotionService().watchActivePromotions();
    }
    return _promotions!;
  }

  Widget _content(Stream<List<PromotionModel>> stream) =>
      StreamBuilder<List<PromotionModel>>(
        stream: stream,
        builder: (context, snapshot) {
          final promotions = snapshot.data ?? const <PromotionModel>[];
          if (snapshot.hasError || promotions.isEmpty) {
            return const SizedBox.shrink();
          }
          return _PromotionRail(promotions: promotions);
        },
      );

  @override
  Widget build(BuildContext context) {
    if (widget.stream != null) {
      return _content(widget.stream!);
    }
    return StreamBuilder<User?>(
      stream: _authChanges,
      initialData: FirebaseAuth.instance.currentUser,
      builder: (context, snapshot) => _content(_forUser(snapshot.data)),
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
                  color: customerDecorativeIconColor,
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
                        color: HomeTextColors.primary,
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
                        color: HomeTextColors.secondary,
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
    required this.selectedCategory,
    required this.items,
    required this.onSeeAll,
    required this.onItemTap,
    required this.onRetry,
    required this.loading,
    required this.failed,
  });

  final String? selectedCategory;
  final List<ServiceCategory> items;
  final VoidCallback onSeeAll, onRetry;
  final ValueChanged<ServiceCategory> onItemTap;
  final bool loading, failed;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screen),
    child: Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'SERVICE CATEGORIES',
            style: AppTypography.caption.copyWith(
              color: AppColors.primaryStrong,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Choose a service',
            style: AppTypography.caption.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          ),
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _ServiceCategoryChip(
                  label: 'All services',
                  selected: !items.any((item) => item.code == selectedCategory),
                  onTap: onSeeAll,
                ),
                for (final item in items) ...[
                  const SizedBox(width: 8),
                  _ServiceCategoryChip(
                    label: item.name,
                    selected: item.code == selectedCategory,
                    onTap: () => onItemTap(item),
                  ),
                ],
              ],
            ),
          ),
          if (loading) ...[
            const SizedBox(height: 12),
            const LinearProgressIndicator(minHeight: 2),
          ] else if (failed) ...[
            const SizedBox(height: 8),
            const Text('Event Services could not be loaded.'),
            TextButton(onPressed: onRetry, child: const Text('Retry')),
          ] else if (items.isEmpty) ...[
            const SizedBox(height: 12),
            const Text('No event services are currently available.'),
          ],
        ],
      ),
    ),
  );
}

class _ServiceCategoryChip extends StatelessWidget {
  const _ServiceCategoryChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Semantics(
    selected: selected,
    button: true,
    child: Material(
      color: selected ? AppColors.primaryStrong : AppColors.surface,
      shape: StadiumBorder(
        side: BorderSide(
          color: selected ? AppColors.primaryStrong : AppColors.border,
        ),
      ),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          child: Text(
            label,
            style: AppTypography.bodySmall.copyWith(
              color: selected
                  ? AppColors.primaryForeground
                  : AppColors.mainText,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    ),
  );
}

class _PopularSection extends StatefulWidget {
  const _PopularSection({
    required this.selectedCategory,
    required this.repository,
    required this.onSeeAll,
    required this.onCategorySeeAll,
    required this.categories,
    required this.onRetry,
  });
  final String? selectedCategory;
  final FeastaRepository repository;
  final Future<List<ServiceCategory>> categories;
  final ValueChanged<String> onCategorySeeAll;
  final VoidCallback onSeeAll;
  final VoidCallback onRetry;

  @override
  State<_PopularSection> createState() => _PopularSectionState();
}

class _PopularSectionState extends State<_PopularSection> {
  late Stream<List<ProviderModel>> _providers;
  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _providers = widget.repository.searchAllVerifiedProviders(
      keyword: '',
      eventType: 'All',
      location: '',
      minBudget: null,
      maxBudget: null,
    );
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<List<ServiceCategory>>(
    future: widget.categories,
    builder: (context, categorySnapshot) {
      final categories = categorySnapshot.data ?? const <ServiceCategory>[];
      final names = serviceCategoryNameMap(categories);
      final selected = categories.any((c) => c.code == widget.selectedCategory)
          ? widget.selectedCategory
          : null;
      return StreamBuilder<List<ProviderModel>>(
        stream: _providers,
        builder: (context, snapshot) {
          final groups = groupDiscoverableProviders(snapshot.data ?? const []);
          final all = groups[''] ?? const <ProviderModel>[];
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (categorySnapshot.hasError || snapshot.hasError)
                Center(
                  child: TextButton(
                    onPressed: () {
                      setState(_load);
                      widget.onRetry();
                    },
                    child: const Text('Could not load providers. Retry'),
                  ),
                )
              else if (snapshot.connectionState == ConnectionState.waiting ||
                  categorySnapshot.connectionState != ConnectionState.done)
                const Center(child: CircularProgressIndicator())
              else if (all.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('No providers available yet.'),
                )
              else ...[
                for (final category in categories.where(
                  (c) => selected == null
                      ? (groups[c.code]?.isNotEmpty ?? false)
                      : c.code == selected,
                ))
                  _row(
                    context,
                    category.name,
                    groups[category.code] ?? const [],
                    names,
                    () => widget.onCategorySeeAll(category.code),
                    horizontal: selected == null,
                  ),
              ],
            ],
          );
        },
      );
    },
  );
  Widget _row(
    BuildContext context,
    String title,
    List<ProviderModel> providers,
    Map<String, String> names,
    VoidCallback onSeeAll, {
    required bool horizontal,
  }) => Column(
    children: [
      HomeSectionHeader(
        title: title,
        subtitle: horizontal
            ? 'Swipe to explore providers'
            : '${providers.length} providers',
        onSeeAll: horizontal && providers.length > 2 ? onSeeAll : null,
      ),
      if (providers.isEmpty)
        const Padding(
          padding: EdgeInsets.all(24),
          child: Text('No providers available yet.'),
        )
      else if (!horizontal)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screen),
          child: ProviderCardGrid(
            itemCount: providers.length,
            itemBuilder: (context, index) => ProviderGridCard(
              key: ValueKey(providers[index].id),
              provider: providers[index],
              categoryNames: names,
            ),
          ),
        )
      else
        LayoutBuilder(
          builder: (context, constraints) {
            final scale = MediaQuery.textScalerOf(context).scale(1);
            final width = scale > 1.6
                ? (constraints.maxWidth - AppSpacing.screen * 2).clamp(
                    220.0,
                    360.0,
                  )
                : ((constraints.maxWidth - AppSpacing.screen * 2 - 12) / 2)
                      .clamp(148.0, 220.0);
            return SingleChildScrollView(
              key: PageStorageKey('home-provider-row-$title'),
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screen,
              ),
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var index = 0; index < providers.length; index++) ...[
                      if (index > 0) const SizedBox(width: 12),
                      SizedBox(
                        width: width,
                        child: ProviderGridCard(
                          key: ValueKey(providers[index].id),
                          provider: providers[index],
                          categoryNames: names,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            );
          },
        ),
      const SizedBox(height: AppSpacing.md),
    ],
  );
}

class HomeSectionHeader extends StatelessWidget {
  const HomeSectionHeader({
    super.key,
    required this.title,
    required this.subtitle,
    required this.onSeeAll,
  });

  final String title;
  final String subtitle;
  final VoidCallback? onSeeAll;

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
                    color: HomeTextColors.primary,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: AppTypography.caption.copyWith(
                    color: HomeTextColors.secondary,
                  ),
                ),
              ],
            ),
          ),
          if (onSeeAll != null) ...[
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
        ],
      ),
    );
  }
}
