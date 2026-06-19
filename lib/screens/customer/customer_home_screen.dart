import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:custom_refresh_indicator/custom_refresh_indicator.dart';

import '../../core/helpers/auth_guard.dart';
import '../../core/helpers/provider_category_helper.dart';
import '../../models/customer_address_model.dart';
import '../../models/feasta_models.dart';
import '../../repositories/feasta_repository.dart';
import '../../services/customer_address_storage_service.dart';
import '../../widgets/loading_skeleton.dart';
import '../notifications/notifications_screen.dart';
import 'customer_search_screen.dart';
import 'location_picker_screen.dart';
import 'manual_address_screen.dart';
import 'provider_profile_screen.dart';
import '../../widgets/feasta_loading_logo.dart';


const TextStyle _headerTitleStyle = TextStyle(
  color: Colors.white,
  fontSize: 15,
  fontWeight: FontWeight.w800,
);

const TextStyle _headerSubtitleStyle = TextStyle(
  color: Colors.white70,
  fontSize: 11,
  fontWeight: FontWeight.w600,
);

const TextStyle _sectionTitleStyle = TextStyle(
  color: Color(0xFF2B211D),
  fontSize: 18,
  fontWeight: FontWeight.w900,
);

const TextStyle _smallLabelStyle = TextStyle(
  fontSize: 12,
  fontWeight: FontWeight.w800,
);

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
    _HomeCategoryItem('All', Icons.apps_outlined),
    _HomeCategoryItem('Wedding', Icons.favorite_border),
    _HomeCategoryItem('Birthday', Icons.cake_outlined),
    _HomeCategoryItem('Corporate', Icons.business_center_outlined),
    _HomeCategoryItem('Graduation', Icons.school_outlined),
    _HomeCategoryItem('Baptism', Icons.child_care_outlined),
    _HomeCategoryItem('Reunion', Icons.groups_outlined),
    _HomeCategoryItem('Anniversary', Icons.celebration_outlined),
    _HomeCategoryItem('Other', Icons.more_horiz),
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

            if (address != null && sheetContext.mounted) {
              Navigator.pop(sheetContext, address);
            }
          },
          onAddAddress: () async {
            final address = await Navigator.push<CustomerAddressModel>(
              context,
              MaterialPageRoute(builder: (_) => const ManualAddressScreen()),
            );

            if (address == null) return;

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
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
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

            SliverToBoxAdapter(
              child: _CategoryShortcutSection(
                categories: categories,
                selectedEventType: selectedEventType,
                onSelected: (eventType) {
                  setState(() {
                    selectedEventType = eventType;
                  });
                },
              ),
            ),

            SliverToBoxAdapter(
              child: _FilterChipSection(
                filters: filters,
                nearOrmocOnly: nearOrmocOnly,
                rating4PlusOnly: rating4PlusOnly,
                budgetFriendlyOnly: budgetFriendlyOnly,
                onFilterTap: (filterLabel) {
                  setState(() {
                    if (filterLabel == 'All') {
                      selectedEventType = 'All';
                      nearOrmocOnly = false;
                      rating4PlusOnly = false;
                      budgetFriendlyOnly = false;
                    } else if (filterLabel == 'Ratings 4.0+') {
                      rating4PlusOnly = !rating4PlusOnly;
                    } else if (filterLabel == 'Budget Friendly') {
                      budgetFriendlyOnly = !budgetFriendlyOnly;
                    }
                  });
                },
              ),
            ),

            SliverToBoxAdapter(
              child: _BookAgainSection(repository: _repository),
            ),

            SliverToBoxAdapter(
              child: _ProviderHorizontalSection(
                title: selectedEventType == 'All'
                    ? 'Popular Caterers'
                    : '$selectedEventType Caterers',
                subtitle: selectedEventType == 'All'
                    ? 'Catering providers customers often browse'
                    : 'Caterers with active $selectedEventType packages',
                stream: _repository.homeCateringProviders(
                  eventType: selectedEventType,
                  nearOrmoc: nearOrmocOnly,
                  rating4Plus: rating4PlusOnly,
                  budgetFriendly: budgetFriendlyOnly,
                ),
                emptyText: 'No verified caterers available yet.',
              ),
            ),

            SliverToBoxAdapter(
              child: _ProviderHorizontalSection(
                title: 'Event Services',
                subtitle:
                    'Photographers, coordinators, singers, rentals, and more',
                stream: _repository.verifiedAddonProviders(),
                emptyText: 'No verified event service providers available yet.',
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
    return _CurvedHomeHeader(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: _HomeLocationRow(
                  selectedAddressFuture: selectedAddressFuture,
                  onTap: onLocationTap,
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
          const SizedBox(height: 18),
          const _HomeSearchBar(),
          const SizedBox(height: 18),
          const Text(
            'What are you planning?',
            style: TextStyle(
              color: Colors.white,
              fontSize: 17,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.2,
            ),
          ),
        ],
      ),
    );
  }
}

class _HomeLocationRow extends StatelessWidget {
  final Future<CustomerAddressModel> selectedAddressFuture;
  final VoidCallback onTap;

  const _HomeLocationRow({
    required this.selectedAddressFuture,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<CustomerAddressModel>(
      future: selectedAddressFuture,
      builder: (context, snapshot) {
        return _LocationChip(
          address: snapshot.data ?? CustomerAddressModel.defaultOrmoc,
          isLoading: snapshot.connectionState == ConnectionState.waiting,
          onTap: onTap,
        );
      },
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
        IconButton(
          onPressed: onPressed,
          icon: const Icon(
            Icons.notifications_none_rounded,
            color: Colors.white,
            size: 26,
          ),
        ),
        if (unreadCount > 0)
          Positioned(
            right: -4,
            top: -4,
            child: Container(
              padding: const EdgeInsets.all(5),
              decoration: const BoxDecoration(
                color: Colors.red,
                shape: BoxShape.circle,
              ),
              child: Text(
                unreadCount > 9 ? '9+' : '$unreadCount',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _LocationChip extends StatelessWidget {
  final CustomerAddressModel address;
  final bool isLoading;
  final VoidCallback onTap;

  const _LocationChip({
    required this.address,
    required this.isLoading,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final title = isLoading ? 'Ormoc City' : address.displayTitle;
    final subtitle = isLoading ? 'Leyte' : address.displaySubtitle;

    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: Row(
        children: [
          const Icon(Icons.location_on_rounded, color: Colors.white, size: 24),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: _headerTitleStyle,
                ),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: _headerSubtitleStyle,
                ),
              ],
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

class _CurvedHomeHeader extends StatelessWidget {
  final Widget child;

  const _CurvedHomeHeader({required this.child});

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(22, 18, 22, 20),
      decoration: const BoxDecoration(color: primary),
      child: child,
    );
  }
}



class _HomeSearchBar extends StatelessWidget {
  const _HomeSearchBar();

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => const CustomerSearchScreen(autofocusSearch: true),
          ),
        );
      },
      child: Container(
        height: 52,
        padding: const EdgeInsets.symmetric(horizontal: 18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(999),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.10),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: const Row(
          children: [
            Icon(Icons.search, color: primary, size: 26),
            SizedBox(width: 12),
            Expanded(
              child: Text(
                'Search caterers, packages, and event services',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: Colors.grey,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            Icon(Icons.tune, color: Colors.grey, size: 22),
          ],
        ),
      ),
    );
  }
}

class _CategoryShortcutSection extends StatelessWidget {
  final List<_HomeCategoryItem> categories;
  final String selectedEventType;
  final ValueChanged<String> onSelected;

  const _CategoryShortcutSection({
    required this.categories,
    required this.selectedEventType,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Container(
      color: primary,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 24, 0, 14),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
        ),
        child: SizedBox(
          height: 88,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: categories.length,
            separatorBuilder: (_, _) => const SizedBox(width: 12),
            itemBuilder: (context, index) {
              final category = categories[index];
              final isSelected = selectedEventType == category.label;

              return SizedBox(
                width: 78,
                child: InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap: () => onSelected(category.label),
                  child: Column(
                    children: [
                      Container(
                        height: 54,
                        width: 54,
                        decoration: BoxDecoration(
                          color: isSelected
                              ? primary
                              : primary.withValues(alpha: 0.10),
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(
                            color: isSelected ? primary : Colors.transparent,
                            width: 2,
                          ),
                        ),
                        child: Icon(
                          category.icon,
                          color: isSelected ? Colors.white : primary,
                          size: 28,
                        ),
                      ),
                      const SizedBox(height: 7),
                      Text(
                        category.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: isSelected ? primary : Colors.black87,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _FilterChipSection extends StatelessWidget {
  final List<_HomeFilterItem> filters;
  final bool nearOrmocOnly;
  final bool rating4PlusOnly;
  final bool budgetFriendlyOnly;
  final ValueChanged<String> onFilterTap;

  const _FilterChipSection({
    required this.filters,
    required this.nearOrmocOnly,
    required this.rating4PlusOnly,
    required this.budgetFriendlyOnly,
    required this.onFilterTap,
  });

  bool _isSelected(String label) {
    if (label == 'Ratings 4.0+') return rating4PlusOnly;
    if (label == 'Budget Friendly') return budgetFriendlyOnly;
    return false;
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
      child: SizedBox(
        height: 46,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: filters.length,
          separatorBuilder: (_, _) => const SizedBox(width: 10),
          itemBuilder: (context, index) {
            final filter = filters[index];
            final isSelected = _isSelected(filter.label);

            return OutlinedButton.icon(
              onPressed: () => onFilterTap(filter.label),
              icon: Icon(filter.icon, size: 18),
              label: Text(
                filter.label == 'All' ? 'Reset' : filter.label,
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
              style: OutlinedButton.styleFrom(
                backgroundColor: isSelected
                    ? primary.withValues(alpha: 0.10)
                    : Colors.white,
                foregroundColor: isSelected ? primary : Colors.black87,
                side: BorderSide(
                  color: isSelected ? primary : const Color(0xFFD6D6D6),
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(24),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _BookAgainSection extends StatelessWidget {
  final FeastaRepository repository;

  const _BookAgainSection({required this.repository});

  @override
  Widget build(BuildContext context) {
    if (isGuestUser) {
      return const SizedBox.shrink();
    }
    return StreamBuilder<List<BookingModel>>(
      stream: repository.customerCompletedBookings(),
      builder: (context, snapshot) {
        final bookings = snapshot.data ?? [];

        if (snapshot.connectionState == ConnectionState.waiting) {
          return const SizedBox.shrink();
        }

        if (bookings.isEmpty) {
          return const SizedBox.shrink();
        }

        final recentBookings = bookings.take(5).toList();

        return Container(
          margin: const EdgeInsets.only(top: 18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _SectionHeader(
                title: 'Book Again',
                subtitle: 'Quickly rebook providers you used before',
              ),
              const SizedBox(height: 14),
              SizedBox(
                height: 132,
                child: ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: 22),
                  scrollDirection: Axis.horizontal,
                  itemCount: recentBookings.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 12),
                  itemBuilder: (context, index) {
                    final booking = recentBookings[index];

                    return _BookAgainCard(booking: booking);
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

class _BookAgainCard extends StatelessWidget {
  final BookingModel booking;

  const _BookAgainCard({required this.booking});

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Container(
      width: 220,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            booking.providerBusinessName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 6),
          Text(
            booking.packageName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.grey,
              fontWeight: FontWeight.w700,
            ),
          ),
          const Spacer(),
          SizedBox(
            width: double.infinity,
            height: 38,
            child: ElevatedButton(
              onPressed: () {
                // Later we can route this to provider profile or duplicate booking flow.
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: primary,
                foregroundColor: Colors.white,
              ),
              child: const Text(
                'Book Again',
                style: TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
          ),
        ],
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
          margin: const EdgeInsets.only(top: 22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _SectionHeader(title: title, subtitle: subtitle),
              const SizedBox(height: 14),

              if (snapshot.connectionState == ConnectionState.waiting)
                const FeastaSkeletonHorizontalCards(
                  height: 225,
                  width: 205,
                  padding: EdgeInsets.symmetric(horizontal: 22),
                )
              else if (providers.isEmpty)
                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 22),
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: const Color(0xFFE5E7EB)),
                  ),
                  child: Text(
                    emptyText,
                    style: const TextStyle(color: Colors.grey),
                  ),
                )
              else
                SizedBox(
                  height: 235,
                  child: ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 22),
                    scrollDirection: Axis.horizontal,
                    itemCount: providers.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 14),
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
                      if (provider.isVerified)
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
