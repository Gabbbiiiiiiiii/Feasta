import 'package:flutter/material.dart';

import '../../core/helpers/provider_category_helper.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import '../../shared/widgets/loading_skeleton.dart';
import 'provider_profile_screen.dart';

const Color kCard = Colors.white;
const Color kBorder = Color(0xFFE8E1DB);
const Color kTextPrimary = Color(0xFF2B211D);
const Color kTextSecondary = Color(0xFF8C817A);
const Color kPrimary = Color(0xFFFF6333);
const Color kChipBg = Color(0xFFFFF1EB);

class CustomerSearchScreen extends StatefulWidget {
  final String initialEventType;
  final String initialLocation;
  final double? initialMinBudget;
  final double? initialMaxBudget;
  final bool autofocusSearch;

  const CustomerSearchScreen({
    super.key,
    this.initialEventType = 'All',
    this.initialLocation = '',
    this.initialMinBudget,
    this.initialMaxBudget,
    this.autofocusSearch = false,
  });

  @override
  State<CustomerSearchScreen> createState() => _CustomerSearchScreenState();
}

class _CustomerSearchScreenState extends State<CustomerSearchScreen> {
  final FeastaRepository repository = FeastaRepository();

  final TextEditingController searchController = TextEditingController();
  final TextEditingController locationController = TextEditingController();
  final TextEditingController minBudgetController = TextEditingController();
  final TextEditingController maxBudgetController = TextEditingController();

  final FocusNode searchFocusNode = FocusNode();

  final List<String> recentSearches = [];

  final List<String> popularSearches = const [
    'Catering Service',
    'Photographer',
    'Event Coordinator',
    'Singer / Band',
    'Lights and Sounds',
    'Photo Booth',
    'Cake Provider',
    'Venue Provider',
    'Car Rental',
  ];

  String selectedEventType = 'All';
  bool showFilters = false;

  final List<String> eventTypes = const [
    'All',
    'Birthday',
    'Wedding',
    'Anniversary',
    'Reunion',
    'Corporate',
    'Baptism',
    'Graduation',
    'Other',
  ];

  bool get hasActiveSearch {
    return searchController.text.trim().isNotEmpty ||
        selectedEventType != 'All' ||
        locationController.text.trim().isNotEmpty ||
        minBudgetController.text.trim().isNotEmpty ||
        maxBudgetController.text.trim().isNotEmpty;
  }

  double? get minBudget {
    final value = minBudgetController.text.trim();
    if (value.isEmpty) return null;
    return double.tryParse(value);
  }

  double? get maxBudget {
    final value = maxBudgetController.text.trim();
    if (value.isEmpty) return null;
    return double.tryParse(value);
  }

  @override
  void initState() {
    super.initState();

    if (eventTypes.contains(widget.initialEventType)) {
      selectedEventType = widget.initialEventType;
    }

    locationController.text = widget.initialLocation;

    if (widget.initialMinBudget != null) {
      minBudgetController.text = widget.initialMinBudget!.toStringAsFixed(0);
    }

    if (widget.initialMaxBudget != null) {
      maxBudgetController.text = widget.initialMaxBudget!.toStringAsFixed(0);
    }

    if (widget.autofocusSearch) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          searchFocusNode.requestFocus();
        }
      });
    }
  }

  void _refreshSearch() {
    setState(() {});
  }

  void _clearFilters() {
    setState(() {
      searchController.clear();
      locationController.clear();
      minBudgetController.clear();
      maxBudgetController.clear();
      selectedEventType = 'All';
    });
  }

  void _saveRecentSearch(String value) {
    final search = value.trim();
    if (search.isEmpty) return;

    setState(() {
      recentSearches.remove(search);
      recentSearches.insert(0, search);

      if (recentSearches.length > 5) {
        recentSearches.removeLast();
      }
    });
  }

  @override
  void dispose() {
    searchController.dispose();
    locationController.dispose();
    minBudgetController.dispose();
    maxBudgetController.dispose();
    searchFocusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final canGoBack = Navigator.of(context).canPop();

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          children: [
            _DirectSearchHeader(
              canGoBack: canGoBack,
              showFilters: showFilters,
              searchController: searchController,
              searchFocusNode: searchFocusNode,
              onBack: () => Navigator.of(context).maybePop(),
              onChanged: (_) => _refreshSearch(),
              onSubmitted: _saveRecentSearch,
              onToggleFilters: () {
                setState(() {
                  showFilters = !showFilters;
                });
              },
            ),
            if (showFilters)
              _SearchFilterPanel(
                showSearchField: false,
                searchController: searchController,
                locationController: locationController,
                minBudgetController: minBudgetController,
                maxBudgetController: maxBudgetController,
                searchFocusNode: searchFocusNode,
                autofocusSearch: widget.autofocusSearch,
                showFilters: true,
                selectedEventType: selectedEventType,
                eventTypes: eventTypes,
                onSearchChanged: (_) => _refreshSearch(),
                onSubmitted: _saveRecentSearch,
                onSelectedEventType: (value) {
                  setState(() {
                    selectedEventType = value;
                  });
                },
                onClear: _clearFilters,
                onApply: () {
                  FocusScope.of(context).unfocus();
                  _refreshSearch();
                },
              ),
            Expanded(
              child: hasActiveSearch
                  ? _SearchResultsList(
                      repository: repository,
                      searchController: searchController,
                      selectedEventType: selectedEventType,
                      locationController: locationController,
                      minBudget: minBudget,
                      maxBudget: maxBudget,
                    )
                  : _SearchLandingContent(
                      repository: repository,
                      recentSearches: recentSearches,
                      popularSearches: popularSearches,
                      onSearchTap: (value) {
                        setState(() {
                          searchController.text = value;
                          searchController.selection =
                              TextSelection.fromPosition(
                            TextPosition(
                              offset: searchController.text.length,
                            ),
                          );

                          recentSearches.remove(value);
                          recentSearches.insert(0, value);

                          if (recentSearches.length > 5) {
                            recentSearches.removeLast();
                          }
                        });
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DirectSearchHeader extends StatelessWidget {
  final bool canGoBack;
  final bool showFilters;
  final TextEditingController searchController;
  final FocusNode searchFocusNode;
  final VoidCallback onBack;
  final ValueChanged<String> onChanged;
  final ValueChanged<String> onSubmitted;
  final VoidCallback onToggleFilters;

  const _DirectSearchHeader({
    required this.canGoBack,
    required this.showFilters,
    required this.searchController,
    required this.searchFocusNode,
    required this.onBack,
    required this.onChanged,
    required this.onSubmitted,
    required this.onToggleFilters,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(8, 10, 12, 10),
      child: Row(
        children: [
          if (canGoBack)
            IconButton(
              onPressed: onBack,
              icon: const Icon(
                Icons.arrow_back_rounded,
                color: kTextPrimary,
                size: 30,
              ),
            )
          else
            const SizedBox(width: 4),
          Expanded(
            child: _CollapsedSearchBar(
              searchController: searchController,
              searchFocusNode: searchFocusNode,
              onChanged: onChanged,
              onSubmitted: onSubmitted,
            ),
          ),
          const SizedBox(width: 8),
          Tooltip(
            message: 'Filters',
            child: Material(
              color: showFilters ? kPrimary : const Color(0xFFF5F5F3),
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: onToggleFilters,
                child: SizedBox(
                  height: 46,
                  width: 46,
                  child: Icon(
                    showFilters
                        ? Icons.tune_rounded
                        : Icons.tune_outlined,
                    color: showFilters ? Colors.white : kTextPrimary,
                    size: 23,
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

class _SearchFilterPanel extends StatelessWidget {
  final bool showSearchField;
  final TextEditingController searchController;
  final TextEditingController locationController;
  final TextEditingController minBudgetController;
  final TextEditingController maxBudgetController;
  final FocusNode searchFocusNode;
  final bool autofocusSearch;
  final bool showFilters;
  final String selectedEventType;
  final List<String> eventTypes;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<String> onSubmitted;
  final ValueChanged<String> onSelectedEventType;
  final VoidCallback onClear;
  final VoidCallback onApply;

  const _SearchFilterPanel({
    super.key,
    this.showSearchField = true,
    required this.searchController,
    required this.locationController,
    required this.minBudgetController,
    required this.maxBudgetController,
    required this.searchFocusNode,
    required this.autofocusSearch,
    required this.showFilters,
    required this.selectedEventType,
    required this.eventTypes,
    required this.onSearchChanged,
    required this.onSubmitted,
    required this.onSelectedEventType,
    required this.onClear,
    required this.onApply,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFFFFFBF8),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: kBorder),
        ),
        child: Column(
          children: [
            if (showSearchField) ...[
              TextField(
                controller: searchController,
                focusNode: searchFocusNode,
                autofocus: autofocusSearch,
                textInputAction: TextInputAction.search,
                onSubmitted: onSubmitted,
                onChanged: onSearchChanged,
                decoration: _softInputDecoration(
                  hintText: 'Search caterers, packages, and services',
                  prefixIcon: const Icon(
                    Icons.search_rounded,
                    color: kTextSecondary,
                  ),
                  suffixIcon: searchController.text.isEmpty
                      ? null
                      : IconButton(
                          onPressed: () {
                            searchController.clear();
                            onSearchChanged('');
                          },
                          icon: const Icon(Icons.close_rounded),
                        ),
                ),
              ),
              const SizedBox(height: 12),
            ],
            if (showFilters) ...[
              DropdownButtonFormField<String>(
                value: selectedEventType,
                decoration: _softInputDecoration(
                  hintText: 'Event Type',
                  prefixIcon: const Icon(
                    Icons.celebration_outlined,
                    color: kTextSecondary,
                  ),
                ),
                dropdownColor: Colors.white,
                style: const TextStyle(
                  color: kTextPrimary,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
                items: eventTypes.map((type) {
                  return DropdownMenuItem(
                    value: type,
                    child: Text(type),
                  );
                }).toList(),
                onChanged: (value) {
                  if (value == null) return;
                  onSelectedEventType(value);
                },
              ),
              const SizedBox(height: 12),
              TextField(
                controller: locationController,
                onChanged: onSearchChanged,
                decoration: _softInputDecoration(
                  hintText: 'Location',
                  prefixIcon: const Icon(
                    Icons.location_on_outlined,
                    color: kTextSecondary,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: minBudgetController,
                      keyboardType: TextInputType.number,
                      onChanged: onSearchChanged,
                      decoration: _softInputDecoration(
                        hintText: 'Min Budget',
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: maxBudgetController,
                      keyboardType: TextInputType.number,
                      onChanged: onSearchChanged,
                      decoration: _softInputDecoration(
                        hintText: 'Max Budget',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: onClear,
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(46),
                        foregroundColor: kPrimary,
                        side: const BorderSide(color: kBorder),
                        backgroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(18),
                        ),
                      ),
                      child: const Text(
                        'Clear',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 15,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: onApply,
                      style: ElevatedButton.styleFrom(
                        minimumSize: const Size.fromHeight(46),
                        backgroundColor: kPrimary,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(18),
                        ),
                      ),
                      child: const Text(
                        'Apply',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 15,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CollapsedSearchBar extends StatelessWidget {
  final TextEditingController searchController;
  final FocusNode searchFocusNode;
  final ValueChanged<String> onChanged;
  final ValueChanged<String> onSubmitted;

  const _CollapsedSearchBar({
    super.key,
    required this.searchController,
    required this.searchFocusNode,
    required this.onChanged,
    required this.onSubmitted,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 50,
      child: TextField(
        controller: searchController,
        focusNode: searchFocusNode,
        textInputAction: TextInputAction.search,
        onChanged: onChanged,
        onSubmitted: onSubmitted,
        style: const TextStyle(
          color: kTextPrimary,
          fontSize: 16,
          fontWeight: FontWeight.w700,
        ),
        decoration: InputDecoration(
          hintText: 'Search caterers, packages, services',
          hintStyle: const TextStyle(
            color: Color(0xFF777777),
            fontSize: 16,
            fontWeight: FontWeight.w500,
          ),
          prefixIcon: const Icon(
            Icons.search_rounded,
            color: Color(0xFF5F6664),
            size: 28,
          ),
          suffixIcon: searchController.text.isEmpty
              ? null
              : IconButton(
                  onPressed: () {
                    searchController.clear();
                    onChanged('');
                  },
                  icon: const Icon(
                    Icons.close_rounded,
                    color: kTextPrimary,
                  ),
                ),
          filled: true,
          fillColor: const Color(0xFFF5F5F3),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 12,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(999),
            borderSide: BorderSide.none,
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(999),
            borderSide: const BorderSide(
              color: kPrimary,
              width: 1.2,
            ),
          ),
        ),
      ),
    );
  }
}

class _SearchResultsList extends StatelessWidget {
  final FeastaRepository repository;
  final TextEditingController searchController;
  final String selectedEventType;
  final TextEditingController locationController;
  final double? minBudget;
  final double? maxBudget;

  const _SearchResultsList({
    required this.repository,
    required this.searchController,
    required this.selectedEventType,
    required this.locationController,
    required this.minBudget,
    required this.maxBudget,
  });

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<ProviderModel>>(
      stream: repository.searchAllVerifiedProviders(
        keyword: searchController.text,
        eventType: selectedEventType,
        location: locationController.text,
        minBudget: minBudget,
        maxBudget: maxBudget,
      ),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const FeastaSkeletonList(
            itemCount: 5,
            padding: EdgeInsets.fromLTRB(16, 18, 16, 28),
            showLeading: false,
            showTrailing: false,
            showImage: true,
            imageHeight: 120,
          );
        }

        if (snapshot.hasError) {
          return Center(
            child: Text(
              'Error: ${snapshot.error}',
              textAlign: TextAlign.center,
            ),
          );
        }

        final providers = snapshot.data ?? [];

        if (providers.isEmpty) {
          return const _EmptySearchState();
        }

        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
          itemCount: providers.length + 1,
          separatorBuilder: (_, __) => const SizedBox(height: 12),
          itemBuilder: (context, index) {
            if (index == 0) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Text(
                  '${providers.length} provider${providers.length == 1 ? '' : 's'} found',
                  style: const TextStyle(
                    color: kTextSecondary,
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                  ),
                ),
              );
            }

            final provider = providers[index - 1];

            return SearchProviderCard(provider: provider);
          },
        );
      },
    );
  }
}

class _SearchLandingContent extends StatelessWidget {
  final FeastaRepository repository;
  final List<String> recentSearches;
  final List<String> popularSearches;
  final ValueChanged<String> onSearchTap;

  const _SearchLandingContent({
    required this.repository,
    required this.recentSearches,
    required this.popularSearches,
    required this.onSearchTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
      children: [
        const _SearchSectionTitle(title: 'Popular services'),
        const SizedBox(height: 12),
        _PopularServiceRail(onSearchTap: onSearchTap),

        if (recentSearches.isNotEmpty) ...[
          const SizedBox(height: 28),
          const _SearchSectionTitle(title: 'Recent searches'),
          const SizedBox(height: 8),
          ...recentSearches.map(
            (search) => _RecentSearchTile(
              label: search,
              onTap: () => onSearchTap(search),
            ),
          ),
        ],

        const SizedBox(height: 28),

        const _SearchSectionTitle(
          title: 'Popular searches',
          subtitle: 'Quickly browse common event services',
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: popularSearches.map((search) {
            return _SoftSearchChip(
              label: search,
              onTap: () => onSearchTap(search),
            );
          }).toList(),
        ),

        const SizedBox(height: 30),

        const _SearchSectionTitle(
          title: 'Recommended caterers',
          subtitle: 'Popular providers for your next event',
        ),
        const SizedBox(height: 12),
        _ProviderMiniSlider(
          stream: repository.verifiedProviders(),
          emptyText: 'No recommended caterers available yet.',
        ),

        const SizedBox(height: 28),

        const _SearchSectionTitle(
          title: 'Event services',
          subtitle: 'Photographers, coordinators, performers, and rentals',
        ),
        const SizedBox(height: 12),
        _ProviderMiniSlider(
          stream: repository.verifiedAddonProviders(),
          emptyText: 'No event service providers available yet.',
        ),
      ],
    );
  }
}

class _PopularServiceRail extends StatelessWidget {
  final ValueChanged<String> onSearchTap;

  const _PopularServiceRail({
    required this.onSearchTap,
  });

  static const List<_PopularServiceShortcut> items = [
    _PopularServiceShortcut(
      label: 'Catering',
      icon: Icons.restaurant_menu_rounded,
    ),
    _PopularServiceShortcut(
      label: 'Photo',
      searchValue: 'Photographer',
      icon: Icons.photo_camera_rounded,
    ),
    _PopularServiceShortcut(
      label: 'Cake',
      searchValue: 'Cake Provider',
      icon: Icons.cake_rounded,
    ),
    _PopularServiceShortcut(
      label: 'Venue',
      searchValue: 'Venue Provider',
      icon: Icons.location_city_rounded,
    ),
    _PopularServiceShortcut(
      label: 'Music',
      searchValue: 'Singer / Band',
      icon: Icons.music_note_rounded,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 118,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (context, index) {
          final item = items[index];

          return SizedBox(
            width: 92,
            child: InkWell(
              borderRadius: BorderRadius.circular(22),
              onTap: () => onSearchTap(item.searchValue ?? item.label),
              child: Column(
                children: [
                  Container(
                    height: 76,
                    width: 92,
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3F1F0),
                      borderRadius: BorderRadius.circular(22),
                    ),
                    child: Icon(
                      item.icon,
                      color: kPrimary,
                      size: 34,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    item.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: kTextPrimary,
                      fontWeight: FontWeight.w900,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _PopularServiceShortcut {
  final String label;
  final String? searchValue;
  final IconData icon;

  const _PopularServiceShortcut({
    required this.label,
    this.searchValue,
    required this.icon,
  });
}

class _ProviderMiniSlider extends StatelessWidget {
  final Stream<List<ProviderModel>> stream;
  final String emptyText;

  const _ProviderMiniSlider({
    required this.stream,
    required this.emptyText,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 185,
      child: StreamBuilder<List<ProviderModel>>(
        stream: stream,
        builder: (context, snapshot) {
          final providers = (snapshot.data ?? []).take(6).toList();

          if (snapshot.connectionState == ConnectionState.waiting) {
            return const FeastaSkeletonHorizontalCards();
          }

          if (providers.isEmpty) {
            return Container(
              padding: const EdgeInsets.all(16),
              decoration: _softCardDecoration(),
              child: Text(
                emptyText,
                style: const TextStyle(
                  color: kTextSecondary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            );
          }

          return ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: providers.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, index) {
              return _MiniProviderCard(provider: providers[index]);
            },
          );
        },
      ),
    );
  }
}

class _SearchSectionTitle extends StatelessWidget {
  final String title;
  final String? subtitle;

  const _SearchSectionTitle({
    required this.title,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w900,
              color: kTextPrimary,
              height: 1.1,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 5),
            Text(
              subtitle!,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: kTextSecondary,
                height: 1.3,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _RecentSearchTile extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _RecentSearchTile({
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      dense: true,
      leading: Container(
        height: 38,
        width: 38,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: kBorder),
        ),
        child: const Icon(
          Icons.history_rounded,
          color: kTextSecondary,
          size: 20,
        ),
      ),
      title: Text(
        label,
        style: const TextStyle(
          color: kTextPrimary,
          fontWeight: FontWeight.w800,
        ),
      ),
      trailing: const Icon(
        Icons.north_west_rounded,
        color: kTextSecondary,
        size: 18,
      ),
      onTap: onTap,
    );
  }
}

class _SoftSearchChip extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _SoftSearchChip({
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: kChipBg,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: 15,
            vertical: 11,
          ),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: const Color(0xFFFFD8CA)),
          ),
          child: Text(
            label,
            style: const TextStyle(
              color: kTextPrimary,
              fontWeight: FontWeight.w800,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }
}

class _MiniProviderCard extends StatelessWidget {
  final ProviderModel provider;

  const _MiniProviderCard({
    required this.provider,
  });

  @override
  Widget build(BuildContext context) {
    final imageUrl = provider.coverImageUrl ?? '';

    return InkWell(
      borderRadius: BorderRadius.circular(22),
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
        decoration: _softCardDecoration(),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            imageUrl.isEmpty
                ? Container(
                    height: 86,
                    width: double.infinity,
                    color: const Color(0xFFF1ECE8),
                    child: const Icon(
                      Icons.image_outlined,
                      color: kTextSecondary,
                      size: 34,
                    ),
                  )
                : Image.network(
                    imageUrl,
                    height: 86,
                    width: double.infinity,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) {
                      return Container(
                        height: 86,
                        width: double.infinity,
                        color: const Color(0xFFF1ECE8),
                        child: const Icon(
                          Icons.broken_image_outlined,
                          color: kTextSecondary,
                        ),
                      );
                    },
                  ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    provider.businessName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 15,
                      color: kTextPrimary,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    providerCategoryLabel(provider.providerCategory),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: kPrimary,
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(
                        Icons.star_rounded,
                        color: Colors.amber,
                        size: 16,
                      ),
                      const SizedBox(width: 3),
                      Text(
                        provider.ratingAverage.toStringAsFixed(1),
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                          color: kTextPrimary,
                        ),
                      ),
                      const SizedBox(width: 3),
                      Text(
                        '(${provider.reviewCount})',
                        style: const TextStyle(
                          fontSize: 11,
                          color: kTextSecondary,
                          fontWeight: FontWeight.w700,
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

class SearchProviderCard extends StatelessWidget {
  final ProviderModel provider;

  const SearchProviderCard({
    super.key,
    required this.provider,
  });

  @override
  Widget build(BuildContext context) {
    final imageUrl = provider.coverImageUrl ?? '';

    return InkWell(
      borderRadius: BorderRadius.circular(22),
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ProviderProfileScreen(provider: provider),
          ),
        );
      },
      child: Container(
        height: 152,
        decoration: _softCardDecoration(),
        clipBehavior: Clip.antiAlias,
        child: Row(
          children: [
            imageUrl.isEmpty
                ? Container(
                    width: 120,
                    height: double.infinity,
                    color: const Color(0xFFF1ECE8),
                    child: const Icon(
                      Icons.image_outlined,
                      color: kTextSecondary,
                      size: 38,
                    ),
                  )
                : Image.network(
                    imageUrl,
                    width: 120,
                    height: double.infinity,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) {
                      return Container(
                        width: 120,
                        height: double.infinity,
                        color: const Color(0xFFF1ECE8),
                        child: const Icon(
                          Icons.broken_image_outlined,
                          color: kTextSecondary,
                        ),
                      );
                    },
                  ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(13, 12, 13, 12),
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
                              fontSize: 16,
                              fontWeight: FontWeight.w900,
                              color: kTextPrimary,
                            ),
                          ),
                        ),
                        if (provider.isVerified)
                          const Icon(
                            Icons.verified_rounded,
                            color: Colors.green,
                            size: 19,
                          ),
                      ],
                    ),
                    const SizedBox(height: 7),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 9,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: kChipBg,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        providerCategoryLabel(provider.providerCategory),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: kPrimary,
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    const Spacer(),
                    Row(
                      children: [
                        const Icon(
                          Icons.star_rounded,
                          color: Colors.amber,
                          size: 17,
                        ),
                        const SizedBox(width: 3),
                        Text(
                          provider.ratingAverage.toStringAsFixed(1),
                          style: const TextStyle(
                            fontWeight: FontWeight.w900,
                            color: kTextPrimary,
                          ),
                        ),
                        const SizedBox(width: 3),
                        Text(
                          '(${provider.reviewCount})',
                          style: const TextStyle(
                            color: kTextSecondary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 7),
                    Text(
                      '₱${provider.minPrice.toStringAsFixed(0)} - ₱${provider.maxPrice.toStringAsFixed(0)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: kPrimary,
                        fontWeight: FontWeight.w900,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 7),
                    Row(
                      children: [
                        const Icon(
                          Icons.location_on_outlined,
                          color: kTextSecondary,
                          size: 16,
                        ),
                        const SizedBox(width: 3),
                        Expanded(
                          child: Text(
                            provider.location,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: kTextSecondary,
                              fontWeight: FontWeight.w600,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptySearchState extends StatelessWidget {
  const _EmptySearchState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(28),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.search_off_rounded,
              size: 76,
              color: kTextSecondary,
            ),
            SizedBox(height: 18),
            Text(
              'No results found',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w900,
                color: kTextPrimary,
              ),
            ),
            SizedBox(height: 8),
            Text(
              'Try changing your search keyword or filters.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: kTextSecondary,
                height: 1.4,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

BoxDecoration _softCardDecoration() {
  return BoxDecoration(
    color: kCard,
    borderRadius: BorderRadius.circular(22),
    border: Border.all(color: kBorder),
    boxShadow: const [
      BoxShadow(
        color: Color(0x0F000000),
        blurRadius: 18,
        offset: Offset(0, 8),
      ),
    ],
  );
}

InputDecoration _softInputDecoration({
  required String hintText,
  Widget? prefixIcon,
  Widget? suffixIcon,
}) {
  return InputDecoration(
    hintText: hintText,
    hintStyle: const TextStyle(
      color: kTextSecondary,
      fontSize: 14,
      fontWeight: FontWeight.w600,
    ),
    prefixIcon: prefixIcon,
    suffixIcon: suffixIcon,
    filled: true,
    fillColor: Colors.white,
    contentPadding: const EdgeInsets.symmetric(
      horizontal: 16,
      vertical: 15,
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(18),
      borderSide: const BorderSide(color: kBorder),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(18),
      borderSide: const BorderSide(color: kPrimary, width: 1.3),
    ),
  );
}
