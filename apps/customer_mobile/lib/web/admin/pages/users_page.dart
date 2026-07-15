import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:feasta/core/constants/firestore_collections.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/user/admin_user.dart';
import '../models/user/admin_user_page.dart';
import '../services/user/admin_user_service.dart';
import '../widgets/users/user_role_badge.dart';
import '../widgets/users/user_status_badge.dart';
import '../widgets/users/verification_badge.dart';

class UsersPage extends StatefulWidget {
  const UsersPage({super.key});

  @override
  State<UsersPage> createState() => _UsersPageState();
}

class _UsersPageState extends State<UsersPage> {
  final AdminUserService _service = AdminUserService();
  final TextEditingController _searchController = TextEditingController();

  final List<DocumentSnapshot<Map<String, dynamic>>> _pageCursors = [];
  final Set<String> _selectedAccountIds = <String>{};

  Timer? _searchDebounce;

  AdminUserPage _page = const AdminUserPage.empty();
  List<AdminUser> _searchResults = const [];

  bool _isLoading = true;
  bool _isSearching = false;

  String? _errorMessage;
  String? _searchError;

  String _selectedRole = 'all';
  String _selectedStatus = 'all';
  String _selectedVerification = 'all';

  int _currentPage = 1;
  int _pageSize = 10;
  int _searchRequestId = 0;
  int _loadRequestId = 0;

  AdminUser? _inspectedUser;

  static const double _desktopInspectorWidth = 420;
  static const double _mobileInspectorMaxWidth = 460;

  bool _isInspectorLoading = false;
  String? _inspectorError;

  int _selectedInspectorTab = 0;

  bool get _isInspectorOpen => _inspectedUser != null;

  @override
  void initState() {
    super.initState();
    _loadFirstPage();
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  bool get _hasSearchQuery {
    return _searchController.text.trim().isNotEmpty;
  }

  bool get _hasValidSearchQuery {
    return _searchController.text.trim().length >= 2;
  }

  List<AdminUser> get _visibleUsers {
    final users = _hasValidSearchQuery ? _searchResults : _page.users;

    return users.where((user) => user.isCustomer || user.isProvider).toList();
  }

  void _clearSelection() {
    _selectedAccountIds.clear();
  }

  void _resetSearchState({bool invalidateRequest = true}) {
    if (invalidateRequest) {
      _searchRequestId++;
    }

    _searchResults = const [];
    _searchError = null;
    _isSearching = false;
    _clearSelection();
  }

  Future<void> _loadFirstPage() async {
    _pageCursors.clear();
    _currentPage = 1;

    await _loadUsers();
  }

  Future<bool> _loadUsers({
    DocumentSnapshot<Map<String, dynamic>>? startAfter,
  }) async {
    final requestId = ++_loadRequestId;

    if (!mounted) return false;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final result = await _service.loadUsers(
        limit: _pageSize,
        role: _selectedRole,
        accountStatus: _selectedStatus,
        verificationStatus: _selectedVerification,
        startAfter: startAfter,
      );

      if (!mounted || requestId != _loadRequestId) {
        return false;
      }

      setState(() {
        _page = result;
        _clearSelection();
        _isLoading = false;
      });

      return true;
    } catch (error) {
      if (!mounted || requestId != _loadRequestId) {
        return false;
      }

      setState(() {
        _isLoading = false;
        _errorMessage = error.toString();
      });

      return false;
    }
  }

  Future<void> _nextPage() async {
    if (_isLoading || !_page.hasMore || _page.lastDocument == null) {
      return;
    }

    final cursor = _page.lastDocument!;
    final requestIdBeforeLoad = _loadRequestId;

    final loaded = await _loadUsers(startAfter: cursor);

    if (!mounted || !loaded || _loadRequestId != requestIdBeforeLoad + 1) {
      return;
    }

    setState(() {
      _pageCursors.add(cursor);
      _currentPage++;
    });
  }

  Future<void> _previousPage() async {
    if (_isLoading || _currentPage <= 1) {
      return;
    }

    final targetCursors = List<DocumentSnapshot<Map<String, dynamic>>>.from(
      _pageCursors,
    );

    if (targetCursors.isNotEmpty) {
      targetCursors.removeLast();
    }

    final cursor = targetCursors.isEmpty ? null : targetCursors.last;

    final requestIdBeforeLoad = _loadRequestId;

    final loaded = await _loadUsers(startAfter: cursor);

    if (!mounted || !loaded || _loadRequestId != requestIdBeforeLoad + 1) {
      return;
    }

    setState(() {
      _pageCursors
        ..clear()
        ..addAll(targetCursors);

      _currentPage--;
    });
  }

  Future<void> _refresh() async {
    await _rerunSearchIfNeeded();
  }

  Future<void> _applyFilters() async {
    _searchDebounce?.cancel();

    setState(() {
      _clearSelection();
    });

    await _rerunSearchIfNeeded();
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();

    final query = value.trim();

    if (query.isEmpty) {
      setState(_resetSearchState);
      _loadFirstPage();
      return;
    }

    if (query.length < 2) {
      setState(() {
        _loadRequestId++;
        _searchRequestId++;

        _isLoading = false;
        _isSearching = false;

        _searchResults = const [];
        _searchError = null;
        _errorMessage = null;

        _clearSelection();
      });

      return;
    }

    _searchDebounce = Timer(
      const Duration(milliseconds: 450),
      () => _searchAllUsers(query),
    );
  }

  Future<void> _clearSearch() async {
    _searchDebounce?.cancel();
    _searchController.clear();

    setState(_resetSearchState);

    await _loadFirstPage();
  }

  Future<void> _searchAllUsers(String query) async {
    final normalizedQuery = query.trim();

    if (normalizedQuery.length < 2) {
      if (!mounted) return;

      setState(() {
        _loadRequestId++;
        _searchRequestId++;

        _isLoading = false;
        _isSearching = false;

        _searchResults = const [];
        _searchError = null;
        _errorMessage = null;

        _clearSelection();
      });

      return;
    }

    _loadRequestId++;

    final requestId = ++_searchRequestId;

    if (!mounted) return;

    setState(() {
      _isSearching = true;
      _searchError = null;
      _errorMessage = null;
      _clearSelection();
    });

    try {
      final results = await _service.searchUsers(
        searchText: normalizedQuery,
        role: _selectedRole,
        accountStatus: _selectedStatus,
        verificationStatus: _selectedVerification,
      );

      if (!mounted || requestId != _searchRequestId) {
        return;
      }

      if (_searchController.text.trim() != normalizedQuery) {
        return;
      }

      setState(() {
        _searchResults = results;
        _isSearching = false;
      });
    } catch (error) {
      if (!mounted || requestId != _searchRequestId) {
        return;
      }

      setState(() {
        _searchResults = const [];
        _searchError = error.toString();
        _isSearching = false;
      });
    }
  }

  Future<void> _rerunSearchIfNeeded() async {
    final query = _searchController.text.trim();

    if (query.isEmpty) {
      await _loadFirstPage();
      return;
    }

    if (query.length < 2) {
      if (!mounted) return;

      setState(() {
        _loadRequestId++;
        _searchRequestId++;

        _isLoading = false;
        _isSearching = false;

        _searchResults = const [];
        _searchError = null;
        _errorMessage = null;

        _clearSelection();
      });

      return;
    }

    await _searchAllUsers(query);
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isDesktop = constraints.maxWidth >= 1180;

        final inspectorWidth = isDesktop
            ? _desktopInspectorWidth
            : constraints.maxWidth < _mobileInspectorMaxWidth
            ? constraints.maxWidth
            : _mobileInspectorMaxWidth;

        final effectiveMainWidth = isDesktop && _isInspectorOpen
            ? constraints.maxWidth - inspectorWidth - 16
            : constraints.maxWidth;

        final isNarrow = effectiveMainWidth < 900;

        final mainContent = SingleChildScrollView(
          child: Align(
            alignment: Alignment.topLeft,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1500),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildHeader(isNarrow),
                  const SizedBox(height: 20),
                  _buildSummaryCards(),
                  const SizedBox(height: 20),
                  _buildUserCard(isNarrow),
                ],
              ),
            ),
          ),
        );

        return CallbackShortcuts(
          bindings: {
            const SingleActivator(LogicalKeyboardKey.escape):
                _closeUserInspector,
          },
          child: Focus(
            autofocus: true,
            child: isDesktop
                ? Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(
                        child: AnimatedPadding(
                          duration: const Duration(milliseconds: 260),
                          curve: Curves.easeOutCubic,
                          padding: EdgeInsets.only(
                            right: _isInspectorOpen ? 16 : 0,
                          ),
                          child: mainContent,
                        ),
                      ),
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 260),
                        curve: Curves.easeOutCubic,
                        width: _isInspectorOpen ? inspectorWidth : 0,
                        clipBehavior: Clip.antiAlias,
                        decoration: const BoxDecoration(
                          color: Colors.white,
                          border: Border(
                            left: BorderSide(color: Color(0xFFE5EAF0)),
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: Color(0x140F172A),
                              blurRadius: 28,
                              offset: Offset(-8, 0),
                            ),
                          ],
                        ),
                        child: _isInspectorOpen && _inspectedUser != null
                            ? SizedBox(
                                width: inspectorWidth,
                                child: _UserDetailsInspector(
                                  user: _inspectedUser!,
                                  isLoading: _isInspectorLoading,
                                  errorMessage: _inspectorError,
                                  selectedTab: _selectedInspectorTab,
                                  onTabChanged: (index) {
                                    setState(() {
                                      _selectedInspectorTab = index;
                                    });
                                  },
                                  onClose: _closeUserInspector,
                                  onRetry: () {
                                    final user = _inspectedUser;

                                    if (user != null) {
                                      _openUserInspector(user, resetTab: false);
                                    }
                                  },
                                  onToggleActive: () {
                                    final user = _inspectedUser;

                                    if (user != null) {
                                      _confirmAccountStatus(
                                        user: user,
                                        isActive: !user.isActive,
                                      );
                                    }
                                  },
                                  onToggleBlocked: () {
                                    final user = _inspectedUser;

                                    if (user != null) {
                                      _confirmBlockedStatus(
                                        user: user,
                                        isBlocked: !user.isBlocked,
                                      );
                                    }
                                  },
                                ),
                              )
                            : const SizedBox.shrink(),
                      ),
                    ],
                  )
                : Stack(
                    fit: StackFit.expand,
                    children: [
                      mainContent,
                      if (_isInspectorOpen)
                        Positioned.fill(
                          child: GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: _closeUserInspector,
                            child: Container(
                              color: Colors.black.withValues(alpha: 0.22),
                            ),
                          ),
                        ),
                      AnimatedPositioned(
                        duration: const Duration(milliseconds: 260),
                        curve: Curves.easeOutCubic,
                        top: 0,
                        right: _isInspectorOpen ? 0 : -inspectorWidth,
                        bottom: 0,
                        width: inspectorWidth,
                        child: IgnorePointer(
                          ignoring: !_isInspectorOpen,
                          child: DecoratedBox(
                            decoration: const BoxDecoration(
                              color: Colors.white,
                              boxShadow: [
                                BoxShadow(
                                  color: Color(0x220F172A),
                                  blurRadius: 28,
                                  offset: Offset(-8, 0),
                                ),
                              ],
                            ),
                            child: _inspectedUser == null
                                ? const SizedBox.shrink()
                                : _UserDetailsInspector(
                                    user: _inspectedUser!,
                                    isLoading: _isInspectorLoading,
                                    errorMessage: _inspectorError,
                                    selectedTab: _selectedInspectorTab,
                                    onTabChanged: (index) {
                                      setState(() {
                                        _selectedInspectorTab = index;
                                      });
                                    },
                                    onClose: _closeUserInspector,
                                    onRetry: () {
                                      final user = _inspectedUser;

                                      if (user != null) {
                                        _openUserInspector(
                                          user,
                                          resetTab: false,
                                        );
                                      }
                                    },
                                    onToggleActive: () {
                                      final user = _inspectedUser;

                                      if (user != null) {
                                        _confirmAccountStatus(
                                          user: user,
                                          isActive: !user.isActive,
                                        );
                                      }
                                    },
                                    onToggleBlocked: () {
                                      final user = _inspectedUser;

                                      if (user != null) {
                                        _confirmBlockedStatus(
                                          user: user,
                                          isBlocked: !user.isBlocked,
                                        );
                                      }
                                    },
                                  ),
                          ),
                        ),
                      ),
                    ],
                  ),
          ),
        );
      },
    );
  }

  Widget _buildHeader(bool isNarrow) {
    final titleSection = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'User Management',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w700,
            color: const Color(0xFF111827),
            letterSpacing: -0.4,
          ),
        ),
        const SizedBox(height: 5),
        Text(
          'Monitor and manage customer and provider accounts.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: const Color(0xFF64748B),
            fontWeight: FontWeight.w400,
          ),
        ),
      ],
    );

    final exportButton = OutlinedButton.icon(
      onPressed: () {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Export will be added in the next phase.'),
          ),
        );
      },
      icon: const Icon(Icons.download_rounded, size: 18),
      label: const Text('Export'),
      style: OutlinedButton.styleFrom(
        foregroundColor: const Color(0xFF334155),
        backgroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 17),
        side: const BorderSide(color: Color(0xFFE2E8F0)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(11)),
      ),
    );

    final refreshButton = OutlinedButton(
      onPressed: _isLoading || _isSearching ? null : _refresh,
      style: OutlinedButton.styleFrom(
        foregroundColor: const Color(0xFF334155),
        backgroundColor: Colors.white,
        minimumSize: const Size(48, 52),
        padding: EdgeInsets.zero,
        side: const BorderSide(color: Color(0xFFE2E8F0)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(11)),
      ),
      child: const Icon(Icons.refresh_rounded, size: 20),
    );

    final actions = Row(
      mainAxisSize: MainAxisSize.min,
      children: [exportButton, const SizedBox(width: 12), refreshButton],
    );

    if (isNarrow) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [titleSection, const SizedBox(height: 16), actions],
      );
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(child: titleSection),
        actions,
      ],
    );
  }

  Widget _buildSummaryCards() {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection(FirestoreCollections.users)
          .snapshots(),
      builder: (context, userSnapshot) {
        return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: FirebaseFirestore.instance
              .collection(FirestoreCollections.providers)
              .snapshots(),
          builder: (context, providerSnapshot) {
            if (userSnapshot.hasError || providerSnapshot.hasError) {
              return Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: _summaryCardDecoration(),
                child: const Text(
                  'Unable to load account statistics.',
                  style: TextStyle(color: Color(0xFFDC2626)),
                ),
              );
            }

            if (!userSnapshot.hasData || !providerSnapshot.hasData) {
              return const SizedBox(
                height: 198,
                child: Center(child: CircularProgressIndicator()),
              );
            }

            var totalAccounts = 0;
            var customers = 0;
            var providers = 0;

            var restrictedAccounts = 0;

            var registeredThisMonth = 0;
            var registeredLastMonth = 0;

            final now = DateTime.now();

            final startOfThisMonth = DateTime(now.year, now.month, 1);

            final startOfNextMonth = DateTime(now.year, now.month + 1, 1);

            final startOfLastMonth = DateTime(now.year, now.month - 1, 1);

            var verifiedProviders = 0;
            var pendingProviders = 0;

            final providerUserIds = <String>{};
            final providerStatusByOwnerId = <String, String>{};

            for (final document in userSnapshot.data!.docs) {
              final data = document.data();

              final role = data['role']?.toString().trim().toLowerCase() ?? '';

              if (role != 'customer' && role != 'provider') {
                continue;
              }

              totalAccounts++;

              final isActive = data['isActive'] != false;
              final isBlocked = data['isBlocked'] == true;

              if (role == 'customer') {
                customers++;
              } else {
                providers++;
                providerUserIds.add(document.id);
              }

              if (!isActive || isBlocked) {
                restrictedAccounts++;
              }
              final createdAt = _dateFromValue(data['createdAt']);

              if (createdAt != null) {
                if (!createdAt.isBefore(startOfThisMonth) &&
                    createdAt.isBefore(startOfNextMonth)) {
                  registeredThisMonth++;
                } else if (!createdAt.isBefore(startOfLastMonth) &&
                    createdAt.isBefore(startOfThisMonth)) {
                  registeredLastMonth++;
                }
              }
            }

            for (final document in providerSnapshot.data!.docs) {
              final data = document.data();

              final ownerId = data['ownerId']?.toString().trim() ?? '';

              // Ignore provider records without a valid provider user.
              if (ownerId.isEmpty || !providerUserIds.contains(ownerId)) {
                continue;
              }

              final rawStatus =
                  data['verificationStatus']?.toString().trim().toLowerCase() ??
                  'pending';

              final normalizedStatus = switch (rawStatus) {
                'verified' || 'approved' => 'verified',
                'rejected' => 'rejected',
                'pending' => 'pending',
                _ => 'pending',
              };

              final existingStatus = providerStatusByOwnerId[ownerId];

              /*
                * Resolve duplicate provider documents deterministically:
                * verified has priority, followed by pending, then rejected.
                */
              if (existingStatus == null ||
                  normalizedStatus == 'verified' ||
                  (normalizedStatus == 'pending' &&
                      existingStatus == 'rejected')) {
                providerStatusByOwnerId[ownerId] = normalizedStatus;
              }
            }

            for (final verificationStatus in providerStatusByOwnerId.values) {
              if (verificationStatus == 'verified') {
                verifiedProviders++;
              } else if (verificationStatus == 'pending') {
                pendingProviders++;
              }
            }

            final verifiedPercentage = providers == 0
                ? 0.0
                : (verifiedProviders / providers) * 100;

            final pendingPercentage = providers == 0
                ? 0.0
                : (pendingProviders / providers) * 100;

            final restrictedPercentage = totalAccounts == 0
                ? 0.0
                : (restrictedAccounts / totalAccounts) * 100;

            final accountGrowth = _calculateAccountGrowth(
              currentMonth: registeredThisMonth,
              previousMonth: registeredLastMonth,
            );

            return LayoutBuilder(
              builder: (context, constraints) {
                final availableWidth = constraints.maxWidth;

                final cardWidth = availableWidth >= 1180
                    ? (availableWidth - 48) / 4
                    : availableWidth >= 650
                    ? (availableWidth - 16) / 2
                    : availableWidth;

                return AnimatedSize(
                  duration: const Duration(milliseconds: 260),
                  curve: Curves.easeOutCubic,
                  alignment: Alignment.topLeft,
                  child: Wrap(
                    spacing: 16,
                    runSpacing: 16,
                    children: [
                      _AccountSummaryCard(
                        width: cardWidth,
                        totalAccounts: totalAccounts,
                        customers: customers,
                        providers: providers,
                        accountGrowth: accountGrowth,
                      ),
                      _MetricSummaryCard(
                        width: cardWidth,
                        title: 'Verified Providers',
                        value: verifiedProviders.toString(),
                        description:
                            '${verifiedPercentage.toStringAsFixed(1)}% of total providers',
                        icon: Icons.verified_user_outlined,
                        iconColor: const Color(0xFF16A34A),
                        iconBackground: const Color(0xFFDCFCE7),
                      ),
                      _MetricSummaryCard(
                        width: cardWidth,
                        title: 'Pending Verification',
                        value: pendingProviders.toString(),
                        description:
                            '${pendingPercentage.toStringAsFixed(1)}% of total providers',
                        icon: Icons.schedule_rounded,
                        iconColor: const Color(0xFFF59E0B),
                        iconBackground: const Color(0xFFFFF3D6),
                      ),
                      _MetricSummaryCard(
                        width: cardWidth,
                        title: 'Disabled / Blocked',
                        value: restrictedAccounts.toString(),
                        description:
                            '${restrictedPercentage.toStringAsFixed(1)}% of total accounts',
                        icon: Icons.person_off_outlined,
                        iconColor: const Color(0xFFEF4444),
                        iconBackground: const Color(0xFFFFE8E8),
                      ),
                    ],
                  ),
                );
              },
            );
          },
        );
      },
    );
  }

  Widget _buildUserCard(bool isNarrow) {
    return Container(
      width: double.infinity,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE4E9F0)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x080F172A),
            blurRadius: 24,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 18),
            child: _buildFilters(isNarrow),
          ),
          _buildContent(),
          _buildPagination(),
        ],
      ),
    );
  }

  Widget _buildFilters(bool isNarrow) {
    final searchField = SizedBox(
      height: 46,
      child: TextField(
        controller: _searchController,
        onChanged: _onSearchChanged,
        style: const TextStyle(color: Color(0xFF1E293B), fontSize: 13),
        decoration: InputDecoration(
          hintText: 'Search by name, email, phone, or business name...',
          hintStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
          prefixIcon: const Icon(
            Icons.search_rounded,
            size: 21,
            color: Color(0xFF64748B),
          ),
          suffixIcon: _hasSearchQuery
              ? IconButton(
                  tooltip: 'Clear search',
                  onPressed: _clearSearch,
                  icon: const Icon(Icons.close_rounded, size: 18),
                )
              : null,
          filled: true,
          fillColor: const Color(0xFFFBFCFE),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 12,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFFDDE3EC)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFFDDE3EC)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFFFF6333), width: 1.4),
          ),
        ),
      ),
    );

    final roleFilter = _buildCompactDropdown(
      value: _selectedRole,
      items: const {
        'all': 'All Roles',
        'customer': 'Customers',
        'provider': 'Providers',
      },
      onChanged: (value) {
        setState(() {
          _selectedRole = value;

          if (value != 'provider') {
            _selectedVerification = 'all';
          }
        });

        _applyFilters();
      },
    );

    final statusFilter = _buildCompactDropdown(
      value: _selectedStatus,
      items: const {
        'all': 'All Statuses',
        'active': 'Active',
        'disabled': 'Disabled',
        'blocked': 'Blocked',
      },
      onChanged: (value) {
        setState(() {
          _selectedStatus = value;
        });

        _applyFilters();
      },
    );

    final verificationFilter = _buildCompactDropdown(
      value: _selectedVerification,
      enabled: _selectedRole == 'provider',
      items: const {
        'all': 'All Verification',
        'verified': 'Verified',
        'pending': 'Pending',
        'rejected': 'Rejected',
      },
      onChanged: (value) {
        setState(() {
          _selectedVerification = value;
        });

        _applyFilters();
      },
    );

    final moreFiltersButton = SizedBox(
      height: 46,
      child: OutlinedButton.icon(
        onPressed: _showMoreFilters,
        icon: const Icon(Icons.filter_alt_outlined, size: 19),
        label: const Text('More Filters'),
        style: OutlinedButton.styleFrom(
          foregroundColor: const Color(0xFF334155),
          backgroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 15),
          side: const BorderSide(color: Color(0xFFDDE3EC)),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
          textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
        ),
      ),
    );

    if (isNarrow) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          searchField,
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              SizedBox(width: 180, child: roleFilter),
              SizedBox(width: 180, child: statusFilter),
              SizedBox(width: 190, child: verificationFilter),
              moreFiltersButton,
            ],
          ),
        ],
      );
    }

    return Row(
      children: [
        Expanded(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 470),
            child: searchField,
          ),
        ),
        const Spacer(),
        SizedBox(width: 142, child: roleFilter),
        const SizedBox(width: 10),
        SizedBox(width: 150, child: statusFilter),
        const SizedBox(width: 10),
        SizedBox(width: 174, child: verificationFilter),
        const SizedBox(width: 10),
        moreFiltersButton,
      ],
    );
  }

  Widget _buildContent() {
    if (_isSearching) {
      return const SizedBox(
        height: 320,
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (_searchError != null) {
      return _buildTableMessage(
        icon: Icons.search_off_rounded,
        title: 'Unable to search accounts',
        message: _searchError!,
        iconColor: const Color(0xFFDC2626),
      );
    }

    if (_isLoading && !_hasValidSearchQuery) {
      return const SizedBox(
        height: 320,
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (_errorMessage != null && !_hasValidSearchQuery) {
      return _buildTableMessage(
        icon: Icons.error_outline_rounded,
        title: 'Unable to load users',
        message: _errorMessage!,
        iconColor: const Color(0xFFDC2626),
        action: FilledButton(
          onPressed: _refresh,
          child: const Text('Try again'),
        ),
      );
    }

    if (_hasSearchQuery && !_hasValidSearchQuery) {
      return _buildTableMessage(
        icon: Icons.search_rounded,
        title: 'Continue typing',
        message: 'Enter at least 2 characters to search accounts.',
        iconColor: const Color(0xFF94A3B8),
      );
    }

    final users = _visibleUsers;

    if (users.isEmpty) {
      return _buildTableMessage(
        icon: Icons.people_outline_rounded,
        title: 'No accounts found',
        message: _hasValidSearchQuery
            ? 'No accounts match your search and filters.'
            : 'No user accounts are currently available.',
        iconColor: const Color(0xFF94A3B8),
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final minimumTableWidth = _isInspectorOpen ? 980.0 : 1120.0;
        final tableWidth = constraints.maxWidth > minimumTableWidth
            ? constraints.maxWidth
            : minimumTableWidth;

        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: SizedBox(
            width: tableWidth,
            child: Theme(
              data: Theme.of(context).copyWith(
                dividerColor: const Color(0xFFEDF1F5),
                dataTableTheme: const DataTableThemeData(
                  headingTextStyle: TextStyle(
                    color: Color(0xFF334155),
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                  dataTextStyle: TextStyle(
                    color: Color(0xFF475569),
                    fontSize: 12,
                  ),
                ),
              ),
              child: DataTable(
                showCheckboxColumn: false,
                headingRowHeight: 54,
                dataRowMinHeight: 74,
                dataRowMaxHeight: 78,
                horizontalMargin: 18,
                columnSpacing: 24,
                dividerThickness: 1,
                columns: [
                  DataColumn(
                    label: Checkbox(
                      value: _allVisibleUsersSelectionValue,
                      tristate: true,
                      side: const BorderSide(color: Color(0xFF94A3B8)),
                      onChanged: (_) {
                        _toggleAllVisibleUsers();
                      },
                    ),
                  ),
                  const DataColumn(label: Text('Account')),
                  const DataColumn(label: Text('Role')),
                  const DataColumn(label: Text('Verification')),
                  const DataColumn(label: Text('Status')),
                  const DataColumn(label: Text('Registered')),
                  const DataColumn(label: Text('Last Login')),
                  const DataColumn(label: Text('Actions')),
                ],
                rows: users.map(_buildUserRow).toList(),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildTableMessage({
    required IconData icon,
    required String title,
    required String message,
    required Color iconColor,
    Widget? action,
  }) {
    return SizedBox(
      height: 320,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 42, color: iconColor),
              const SizedBox(height: 12),
              Text(
                title,
                style: const TextStyle(
                  color: Color(0xFF0F172A),
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Text(
                  message,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Color(0xFF64748B),
                    fontSize: 12,
                  ),
                ),
              ),
              if (action != null) ...[const SizedBox(height: 16), action],
            ],
          ),
        ),
      ),
    );
  }

  bool? get _allVisibleUsersSelectionValue {
    final users = _visibleUsers;

    if (users.isEmpty) {
      return false;
    }

    final selectedCount = users
        .where((user) => _selectedAccountIds.contains(user.id))
        .length;

    if (selectedCount == 0) {
      return false;
    }

    if (selectedCount == users.length) {
      return true;
    }

    return null;
  }

  void _toggleAllVisibleUsers() {
    final users = _visibleUsers;

    final allSelected = users.every(
      (user) => _selectedAccountIds.contains(user.id),
    );

    setState(() {
      if (allSelected) {
        _selectedAccountIds.removeAll(users.map((user) => user.id));
      } else {
        _selectedAccountIds.addAll(users.map((user) => user.id));
      }
    });
  }

  void _toggleUserSelection(AdminUser user, bool selected) {
    setState(() {
      if (selected) {
        _selectedAccountIds.add(user.id);
      } else {
        _selectedAccountIds.remove(user.id);
      }
    });
  }

  DataRow _buildUserRow(AdminUser user) {
    final isSelected = _selectedAccountIds.contains(user.id);

    return DataRow(
      selected: isSelected,
      color: WidgetStateProperty.resolveWith<Color?>((states) {
        if (states.contains(WidgetState.selected)) {
          return const Color(0xFFFFF7F3);
        }

        if (states.contains(WidgetState.hovered)) {
          return const Color(0xFFFAFBFC);
        }

        return Colors.white;
      }),
      cells: [
        DataCell(
          Checkbox(
            value: isSelected,
            side: const BorderSide(color: Color(0xFF94A3B8)),
            activeColor: const Color(0xFFFF6333),
            onChanged: (value) {
              _toggleUserSelection(user, value ?? false);
            },
          ),
        ),
        DataCell(
          SizedBox(
            width: 245,
            child: Row(
              children: [
                _UserAvatar(user: user, radius: 21),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user.isProvider &&
                                (user.businessName ?? '').trim().isNotEmpty
                            ? user.businessName!
                            : user.fullName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xFF0F172A),
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        user.email,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xFF64748B),
                          fontSize: 11,
                        ),
                      ),
                      if (user.phoneNumber.trim().isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          user.phoneNumber,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Color(0xFF64748B),
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
          onTap: () => _openUserInspector(user),
        ),
        DataCell(UserRoleBadge(role: user.role)),
        DataCell(
          VerificationBadge(
            status: user.verificationStatus,
            isProvider: user.isProvider,
          ),
        ),
        DataCell(
          UserStatusBadge(isActive: user.isActive, isBlocked: user.isBlocked),
        ),
        DataCell(
          Text(
            _formatDate(user.createdAt),
            style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
          ),
        ),
        DataCell(_LastLoginCell(date: user.lastLoginAt)),
        DataCell(_buildActionMenu(user)),
      ],
    );
  }

  Widget _buildActionMenu(AdminUser user) {
    return Container(
      width: 34,
      height: 34,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(9),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: PopupMenuButton<String>(
        tooltip: 'Account actions',
        padding: EdgeInsets.zero,
        icon: const Icon(
          Icons.more_vert_rounded,
          size: 19,
          color: Color(0xFF334155),
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        onSelected: (value) => _handleAction(value, user),
        itemBuilder: (context) {
          return [
            const PopupMenuItem(
              value: 'view',
              child: _ActionMenuItem(
                icon: Icons.visibility_outlined,
                label: 'View details',
              ),
            ),
            PopupMenuItem(
              value: user.isActive ? 'disable' : 'enable',
              child: _ActionMenuItem(
                icon: user.isActive
                    ? Icons.person_off_outlined
                    : Icons.person_outline_rounded,
                label: user.isActive ? 'Disable account' : 'Enable account',
              ),
            ),
            PopupMenuItem(
              value: user.isBlocked ? 'unblock' : 'block',
              child: _ActionMenuItem(
                icon: user.isBlocked
                    ? Icons.lock_open_rounded
                    : Icons.block_rounded,
                label: user.isBlocked ? 'Unblock account' : 'Block account',
                color: user.isBlocked
                    ? const Color(0xFF16A34A)
                    : const Color(0xFFDC2626),
              ),
            ),
          ];
        },
      ),
    );
  }

  Future<void> _handleAction(String action, AdminUser user) async {
    switch (action) {
      case 'view':
        await _openUserInspector(user);
        break;

      case 'disable':
        await _confirmAccountStatus(user: user, isActive: false);
        break;

      case 'enable':
        await _confirmAccountStatus(user: user, isActive: true);
        break;

      case 'block':
        await _confirmBlockedStatus(user: user, isBlocked: true);
        break;

      case 'unblock':
        await _confirmBlockedStatus(user: user, isBlocked: false);
        break;
    }
  }

  Future<void> _confirmAccountStatus({
    required AdminUser user,
    required bool isActive,
  }) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text(isActive ? 'Enable account?' : 'Disable account?'),
          content: Text(
            isActive
                ? user.isBlocked
                      ? '${user.fullName} will be enabled, but the account will remain blocked until it is unblocked.'
                      : 'This will restore access for ${user.fullName}.'
                : 'This will disable access for ${user.fullName}.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: Text(isActive ? 'Enable' : 'Disable'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) return;

    await _performAction(
      () => _service.updateAccountStatus(user: user, isActive: isActive),
      successMessage: isActive
          ? 'Account enabled successfully.'
          : 'Account disabled successfully.',
    );
  }

  Future<void> _confirmBlockedStatus({
    required AdminUser user,
    required bool isBlocked,
  }) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text(isBlocked ? 'Block account?' : 'Unblock account?'),
          content: Text(
            isBlocked
                ? '${user.fullName} will be blocked from using the account.'
                : user.isActive
                ? '${user.fullName} will be allowed to use the account again.'
                : '${user.fullName} will be unblocked, but the account will remain disabled until it is enabled.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: Text(isBlocked ? 'Block' : 'Unblock'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) return;

    await _performAction(
      () => _service.updateBlockedStatus(user: user, isBlocked: isBlocked),
      successMessage: isBlocked
          ? 'Account blocked successfully.'
          : 'Account unblocked successfully.',
    );
  }

  Future<void> _performAction(
    Future<void> Function() operation, {
    required String successMessage,
  }) async {
    try {
      await operation();

      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(successMessage)));

      final inspectedUserId = _inspectedUser?.id;

      setState(() {
        _clearSelection();
      });

      await _rerunSearchIfNeeded();

      if (!mounted || inspectedUserId == null) {
        return;
      }

      final refreshedUser = await _service.getUserById(inspectedUserId);

      if (!mounted || _inspectedUser?.id != inspectedUserId) {
        return;
      }

      if (refreshedUser == null ||
          (!refreshedUser.isCustomer && !refreshedUser.isProvider)) {
        _closeUserInspector();
        return;
      }

      setState(() {
        _inspectedUser = refreshedUser;
      });
    } catch (error) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  Future<void> _openUserInspector(
    AdminUser user, {
    bool resetTab = true,
  }) async {
    if (!user.isCustomer && !user.isProvider) {
      return;
    }

    final isDifferentUser = _inspectedUser?.id != user.id;

    setState(() {
      _inspectedUser = user;

      if (resetTab || isDifferentUser) {
        _selectedInspectorTab = 0;
      }

      _isInspectorLoading = true;
      _inspectorError = null;
    });

    try {
      final refreshedUser = await _service.getUserById(user.id);

      if (!mounted || _inspectedUser?.id != user.id) {
        return;
      }

      if (refreshedUser == null ||
          (!refreshedUser.isCustomer && !refreshedUser.isProvider)) {
        _closeUserInspector();

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('This account is no longer available.'),
            ),
          );
        }

        return;
      }

      setState(() {
        _inspectedUser = refreshedUser;
        _isInspectorLoading = false;
      });
    } catch (error) {
      if (!mounted || _inspectedUser?.id != user.id) {
        return;
      }

      setState(() {
        _isInspectorLoading = false;
        _inspectorError = error.toString();
      });
    }
  }

  void _closeUserInspector() {
    setState(() {
      _inspectedUser = null;
      _selectedInspectorTab = 0;
      _isInspectorLoading = false;
      _inspectorError = null;
    });
  }

  Widget _buildCompactDropdown({
    required String value,
    required Map<String, String> items,
    required ValueChanged<String> onChanged,
    bool enabled = true,
  }) {
    return SizedBox(
      height: 46,
      child: DropdownButtonFormField<String>(
        initialValue: value,
        isExpanded: true,
        icon: const Icon(Icons.keyboard_arrow_down_rounded, size: 19),
        style: const TextStyle(
          color: Color(0xFF334155),
          fontSize: 12,
          fontWeight: FontWeight.w500,
        ),
        decoration: InputDecoration(
          filled: true,
          fillColor: enabled ? Colors.white : const Color(0xFFF8FAFC),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 13,
            vertical: 8,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFFDDE3EC)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFFDDE3EC)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFFFF6333)),
          ),
        ),
        items: items.entries.map((entry) {
          return DropdownMenuItem<String>(
            value: entry.key,
            child: Text(entry.value, overflow: TextOverflow.ellipsis),
          );
        }).toList(),
        onChanged: !enabled
            ? null
            : (newValue) {
                if (newValue != null) {
                  onChanged(newValue);
                }
              },
      ),
    );
  }

  void _showMoreFilters() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return Container(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 28),
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
          ),
          child: SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'More Filters',
                        style: TextStyle(
                          color: Color(0xFF0F172A),
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close_rounded),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                const Text(
                  'Additional date, location, and account filters can be added here.',
                  style: TextStyle(color: Color(0xFF64748B), fontSize: 13),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildPagination() {
    final users = _visibleUsers;

    if (_hasSearchQuery && !_hasValidSearchQuery) {
      return const SizedBox.shrink();
    }

    if (_hasValidSearchQuery) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: Color(0xFFEDF1F5))),
        ),
        child: Row(
          children: [
            Text(
              'Showing ${users.length} search result'
              '${users.length == 1 ? '' : 's'}',
              style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
            ),
            const Spacer(),
            _PaginationIconButton(
              icon: Icons.chevron_left_rounded,
              onPressed: null,
            ),
            const SizedBox(width: 8),
            _PageNumberButton(label: '1', selected: true, onPressed: () {}),
            const SizedBox(width: 8),
            _PaginationIconButton(
              icon: Icons.chevron_right_rounded,
              onPressed: null,
            ),
          ],
        ),
      );
    }

    final firstVisible = users.isEmpty
        ? 0
        : ((_currentPage - 1) * _pageSize) + 1;

    final lastVisible = users.isEmpty ? 0 : firstVisible + users.length - 1;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: Color(0xFFEDF1F5))),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final isCompact = constraints.maxWidth < 720;

          final resultText = Text(
            users.isEmpty
                ? 'No accounts to display'
                : 'Showing $firstVisible to $lastVisible · Page $_currentPage',
            style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
          );

          final controls = Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                height: 40,
                padding: const EdgeInsets.only(left: 12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(9),
                  border: Border.all(color: const Color(0xFFDDE3EC)),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<int>(
                    value: _pageSize,
                    borderRadius: BorderRadius.circular(10),
                    style: const TextStyle(
                      color: Color(0xFF334155),
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                    items: const [
                      DropdownMenuItem(value: 10, child: Text('10 per page')),
                      DropdownMenuItem(value: 20, child: Text('20 per page')),
                      DropdownMenuItem(value: 50, child: Text('50 per page')),
                    ],
                    onChanged: _isLoading
                        ? null
                        : (value) {
                            if (value == null || value == _pageSize) {
                              return;
                            }

                            setState(() {
                              _pageSize = value;
                              _clearSelection();
                            });

                            _loadFirstPage();
                          },
                  ),
                ),
              ),
              const SizedBox(width: 28),
              _PaginationIconButton(
                icon: Icons.chevron_left_rounded,
                onPressed: _currentPage > 1 && !_isLoading
                    ? _previousPage
                    : null,
              ),
              const SizedBox(width: 8),
              if (_currentPage > 1) ...[
                _PageNumberButton(
                  label: '${_currentPage - 1}',
                  onPressed: _previousPage,
                ),
                const SizedBox(width: 8),
              ],
              _PageNumberButton(
                label: '$_currentPage',
                selected: true,
                onPressed: () {},
              ),
              if (_page.hasMore) ...[
                const SizedBox(width: 8),
                _PageNumberButton(
                  label: '${_currentPage + 1}',
                  onPressed: _nextPage,
                ),
              ],
              const SizedBox(width: 8),
              _PaginationIconButton(
                icon: Icons.chevron_right_rounded,
                onPressed: _page.hasMore && !_isLoading ? _nextPage : null,
              ),
            ],
          );

          if (isCompact) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                resultText,
                const SizedBox(height: 14),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: controls,
                ),
              ],
            );
          }

          return Row(children: [resultText, const Spacer(), controls]);
        },
      ),
    );
  }

  String _formatDate(DateTime? date) {
    if (date == null) return '—';

    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    return '${months[date.month - 1]} ${date.day}, ${date.year}';
  }
}

class _UserDetailsInspector extends StatelessWidget {
  final AdminUser user;
  final bool isLoading;
  final String? errorMessage;
  final int selectedTab;
  final ValueChanged<int> onTabChanged;
  final VoidCallback onClose;
  final VoidCallback onRetry;
  final VoidCallback onToggleActive;
  final VoidCallback onToggleBlocked;

  const _UserDetailsInspector({
    super.key,
    required this.user,
    required this.isLoading,
    required this.errorMessage,
    required this.selectedTab,
    required this.onTabChanged,
    required this.onClose,
    required this.onRetry,
    required this.onToggleActive,
    required this.onToggleBlocked,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      child: SafeArea(
        top: false,
        bottom: false,
        child: Column(
          children: [
            _InspectorHeader(
              user: user,
              onClose: onClose,
              onToggleActive: onToggleActive,
              onToggleBlocked: onToggleBlocked,
            ),
            const Divider(height: 1, color: Color(0xFFE5EAF0)),
            _InspectorTabs(
              selectedIndex: selectedTab,
              onChanged: onTabChanged,
              isProvider: user.isProvider,
            ),
            const Divider(height: 1, color: Color(0xFFE5EAF0)),
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 220),
                switchInCurve: Curves.easeOut,
                switchOutCurve: Curves.easeIn,
                transitionBuilder: (child, animation) {
                  return FadeTransition(
                    opacity: animation,
                    child: SlideTransition(
                      position: Tween<Offset>(
                        begin: const Offset(0.025, 0),
                        end: Offset.zero,
                      ).animate(animation),
                      child: child,
                    ),
                  );
                },
                child: _buildBody(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (isLoading) {
      return _InspectorLoadingSkeleton(key: ValueKey('loading-${user.id}'));
    }

    if (errorMessage != null) {
      return _InspectorErrorState(
        key: ValueKey('error-${user.id}'),
        message: errorMessage!,
        onRetry: onRetry,
      );
    }

    if (user.isProvider) {
      switch (selectedTab) {
        case 1:
          return _InspectorBookingsTab(
            key: ValueKey('bookings-${user.id}'),
            user: user,
          );

        case 2:
          return _InspectorBusinessTab(
            key: ValueKey('business-${user.id}'),
            user: user,
          );

        case 3:
          return _InspectorDocumentsTab(
            key: ValueKey('documents-${user.id}'),
            user: user,
          );

        case 0:
        default:
          return _InspectorOverviewTab(
            key: ValueKey('overview-${user.id}'),
            user: user,
          );
      }
    }

    switch (selectedTab) {
      case 1:
        return _InspectorBookingsTab(
          key: ValueKey('bookings-${user.id}'),
          user: user,
        );

      case 2:
        return _InspectorActivityTab(
          key: ValueKey('activity-${user.id}'),
          user: user,
        );

      case 3:
        return _InspectorPermissionsTab(
          key: ValueKey('permissions-${user.id}'),
          user: user,
        );

      case 0:
      default:
        return _InspectorOverviewTab(
          key: ValueKey('overview-${user.id}'),
          user: user,
        );
    }
  }
}

class _InspectorBusinessTab extends StatelessWidget {
  final AdminUser user;

  const _InspectorBusinessTab({super.key, required this.user});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(22),
      children: [
        const _InspectorSectionTitle(title: 'Business Information'),
        const SizedBox(height: 14),
        _InspectorSectionCard(
          children: [
            _InspectorValueRow(
              label: 'Business Name',
              value: user.businessName ?? 'Not available',
            ),
            _InspectorValueRow(
              label: 'Business Type',
              value: user.providerServiceType ?? 'Not available',
            ),
            _InspectorValueRow(
              label: 'Category',
              value: user.providerCategory ?? 'Not available',
            ),
            _InspectorValueRow(
              label: 'Verification',
              child: VerificationBadge(
                status: user.verificationStatus,
                isProvider: true,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _InspectorPermissionsTab extends StatelessWidget {
  final AdminUser user;

  const _InspectorPermissionsTab({super.key, required this.user});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(22),
      children: [
        const _InspectorSectionTitle(title: 'Account Permissions'),
        const SizedBox(height: 14),
        _InspectorSectionCard(
          children: [
            _InspectorVerificationRow(
              label: 'Email access',
              verified: user.isEmailVerified,
            ),
            _InspectorVerificationRow(
              label: 'Phone access',
              verified: user.isPhoneVerified,
            ),
            _InspectorValueRow(label: 'Role', value: user.role),
            _InspectorValueRow(
              label: 'Account status',
              value: user.accountStatus,
            ),
          ],
        ),
      ],
    );
  }
}

class _InspectorSectionCard extends StatelessWidget {
  final List<Widget> children;

  const _InspectorSectionCard({required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 3),
      decoration: BoxDecoration(
        color: const Color(0xFFFBFCFE),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE3E8EF)),
      ),
      child: Column(children: children),
    );
  }
}

class _InspectorHeader extends StatelessWidget {
  final AdminUser user;
  final VoidCallback onClose;
  final VoidCallback onToggleActive;
  final VoidCallback onToggleBlocked;

  const _InspectorHeader({
    required this.user,
    required this.onClose,
    required this.onToggleActive,
    required this.onToggleBlocked,
  });

  @override
  Widget build(BuildContext context) {
    final title = user.isProvider && (user.businessName ?? '').trim().isNotEmpty
        ? user.businessName!
        : user.fullName;

    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 12, 14, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'User Details',
                  style: TextStyle(
                    color: Color(0xFF0F172A),
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Close details',
                onPressed: onClose,
                icon: const Icon(Icons.close_rounded, color: Color(0xFF475569)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _UserAvatar(user: user, radius: 40),
              const SizedBox(width: 20),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          title,
                          style: const TextStyle(
                            color: Color(0xFF0F172A),
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        UserStatusBadge(
                          isActive: user.isActive,
                          isBlocked: user.isBlocked,
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 7,
                      runSpacing: 7,
                      children: [
                        UserRoleBadge(role: user.role),
                        VerificationBadge(
                          status: user.verificationStatus,
                          isProvider: user.isProvider,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          _InspectorContactRow(
            icon: Icons.mail_outline_rounded,
            value: user.email.isEmpty ? 'Email not provided' : user.email,
          ),
          const SizedBox(height: 11),
          _InspectorContactRow(
            icon: Icons.phone_outlined,
            value: user.phoneNumber.isEmpty
                ? 'Phone not provided'
                : user.phoneNumber,
          ),
          const SizedBox(height: 11),
          _InspectorContactRow(
            icon: Icons.badge_outlined,
            value: 'User ID: ${_shortId(user.id)}',
            trailing: IconButton(
              tooltip: 'Copy user ID',
              visualDensity: VisualDensity.compact,
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: user.id));

                if (!context.mounted) return;

                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('User ID copied.')),
                );
              },
              icon: const Icon(Icons.copy_rounded, size: 15),
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onToggleActive,
                  icon: Icon(
                    user.isActive
                        ? Icons.person_off_outlined
                        : Icons.person_outline_rounded,
                    size: 17,
                  ),
                  label: Text(user.isActive ? 'Disable' : 'Enable'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF334155),
                    side: const BorderSide(color: Color(0xFFDDE3EC)),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(9),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onToggleBlocked,
                  icon: Icon(
                    user.isBlocked
                        ? Icons.lock_open_rounded
                        : Icons.block_rounded,
                    size: 17,
                  ),
                  label: Text(user.isBlocked ? 'Unblock' : 'Block'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: user.isBlocked
                        ? const Color(0xFF16A34A)
                        : const Color(0xFFDC2626),
                    side: BorderSide(
                      color: user.isBlocked
                          ? const Color(0xFFBBF7D0)
                          : const Color(0xFFFECACA),
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(9),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  static String _shortId(String value) {
    if (value.length <= 14) {
      return value;
    }

    return '${value.substring(0, 7)}...'
        '${value.substring(value.length - 4)}';
  }
}

class _InspectorContactRow extends StatelessWidget {
  final IconData icon;
  final String value;
  final Widget? trailing;

  const _InspectorContactRow({
    required this.icon,
    required this.value,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 17, color: const Color(0xFF64748B)),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

class _InspectorTabs extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onChanged;
  final bool isProvider;

  const _InspectorTabs({
    required this.selectedIndex,
    required this.onChanged,
    required this.isProvider,
  });

  @override
  Widget build(BuildContext context) {
    final tabs = isProvider
        ? const ['Overview', 'Bookings', 'Business', 'Documents']
        : const ['Overview', 'Bookings', 'Activity', 'Permissions'];

    return SizedBox(
      height: 48,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: tabs.length,
        separatorBuilder: (_, __) => const SizedBox(width: 4),
        itemBuilder: (context, index) {
          final selected = index == selectedIndex;

          return InkWell(
            onTap: () => onChanged(index),
            child: Container(
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(
                    color: selected
                        ? const Color(0xFFFF6333)
                        : Colors.transparent,
                    width: 2,
                  ),
                ),
              ),
              child: Text(
                tabs[index],
                style: TextStyle(
                  color: selected
                      ? const Color(0xFF0F172A)
                      : const Color(0xFF64748B),
                  fontSize: 12,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _InspectorOverviewTab extends StatelessWidget {
  final AdminUser user;

  const _InspectorOverviewTab({super.key, required this.user});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(22, 20, 22, 32),
      children: [
        const _InspectorSectionTitle(title: 'Account Information'),
        const SizedBox(height: 14),
        _InspectorValueRow(
          label: 'Registered',
          value: _formatInspectorDate(user.createdAt),
        ),
        _InspectorValueRow(
          label: 'Last Login',
          value: user.lastLoginAt == null
              ? 'Never'
              : _relativeTime(user.lastLoginAt!),
        ),
        _InspectorValueRow(
          label: 'Status',
          child: UserStatusBadge(
            isActive: user.isActive,
            isBlocked: user.isBlocked,
          ),
        ),
        _InspectorVerificationRow(
          label: 'Email Verified',
          verified: user.isEmailVerified,
        ),
        _InspectorVerificationRow(
          label: 'Phone Verified',
          verified: user.isPhoneVerified,
        ),
        if (user.isProvider) ...[
          const _InspectorSectionDivider(),
          const _InspectorSectionTitle(title: 'Business Information'),
          const SizedBox(height: 14),
          _InspectorValueRow(
            label: 'Business Name',
            value: user.businessName ?? 'Not available',
          ),
          _InspectorValueRow(
            label: 'Business Type',
            value: user.providerServiceType ?? 'Not available',
          ),
          _InspectorValueRow(
            label: 'Category',
            value: user.providerCategory ?? 'Not available',
          ),
          _InspectorValueRow(
            label: 'Verification',
            child: VerificationBadge(
              status: user.verificationStatus,
              isProvider: true,
            ),
          ),
        ],
        const _InspectorSectionDivider(),
        const _InspectorSectionTitle(title: 'Quick Summary'),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: _InspectorStatisticCard(
                label: 'Role',
                value: _displayRole(user.role),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _InspectorStatisticCard(
                label: 'Account',
                value: user.accountStatus,
              ),
            ),
          ],
        ),
      ],
    );
  }

  static String _displayRole(String role) {
    if (role.isEmpty) {
      return 'Unknown';
    }

    return '${role[0].toUpperCase()}${role.substring(1)}';
  }
}

class _InspectorBookingsTab extends StatelessWidget {
  final AdminUser user;

  const _InspectorBookingsTab({super.key, required this.user});

  @override
  Widget build(BuildContext context) {
    return _InspectorEmptyTab(
      icon: Icons.calendar_month_outlined,
      title: 'Booking history',
      message: user.isProvider
          ? 'Provider bookings will appear here.'
          : 'Customer bookings will appear here.',
    );
  }
}

class _InspectorActivityTab extends StatelessWidget {
  final AdminUser user;

  const _InspectorActivityTab({super.key, required this.user});

  @override
  Widget build(BuildContext context) {
    return const _InspectorEmptyTab(
      icon: Icons.history_rounded,
      title: 'Account activity',
      message:
          'Login activity, account changes, and administrative actions will appear here.',
    );
  }
}

class _InspectorDocumentsTab extends StatelessWidget {
  final AdminUser user;

  const _InspectorDocumentsTab({super.key, required this.user});

  @override
  Widget build(BuildContext context) {
    return const _InspectorEmptyTab(
      icon: Icons.description_outlined,
      title: 'Provider documents',
      message:
          'Business Permit, DTI, BIR, and verification documents will appear here.',
    );
  }
}

class _InspectorEmptyTab extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;

  const _InspectorEmptyTab({
    required this.icon,
    required this.title,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(30),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 42, color: const Color(0xFF94A3B8)),
            const SizedBox(height: 14),
            Text(
              title,
              style: const TextStyle(
                color: Color(0xFF0F172A),
                fontSize: 15,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 7),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Color(0xFF64748B),
                fontSize: 12,
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InspectorSectionTitle extends StatelessWidget {
  final String title;

  const _InspectorSectionTitle({required this.title});

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: const TextStyle(
        color: Color(0xFF0F172A),
        fontSize: 13,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

class _InspectorValueRow extends StatelessWidget {
  final String label;
  final String? value;
  final Widget? child;

  const _InspectorValueRow({required this.label, this.value, this.child});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 13),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 140,
            child: Text(
              label,
              style: const TextStyle(color: Color(0xFF64748B), fontSize: 11),
            ),
          ),
          Expanded(
            child:
                child ??
                Text(
                  value ?? '—',
                  style: const TextStyle(
                    color: Color(0xFF334155),
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                  ),
                ),
          ),
        ],
      ),
    );
  }
}

class _InspectorVerificationRow extends StatelessWidget {
  final String label;
  final bool verified;

  const _InspectorVerificationRow({
    required this.label,
    required this.verified,
  });

  @override
  Widget build(BuildContext context) {
    return _InspectorValueRow(
      label: label,
      child: Row(
        children: [
          Icon(
            verified
                ? Icons.check_circle_outline_rounded
                : Icons.cancel_outlined,
            size: 16,
            color: verified ? const Color(0xFF16A34A) : const Color(0xFF94A3B8),
          ),
          const SizedBox(width: 6),
          Text(
            verified ? 'Verified' : 'Not verified',
            style: TextStyle(
              color: verified
                  ? const Color(0xFF16A34A)
                  : const Color(0xFF64748B),
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _InspectorSectionDivider extends StatelessWidget {
  const _InspectorSectionDivider();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 18),
      child: Divider(height: 1, color: Color(0xFFE5EAF0)),
    );
  }
}

class _InspectorStatisticCard extends StatelessWidget {
  final String label;
  final String value;

  const _InspectorStatisticCard({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: const Color(0xFFFBFCFE),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFE3E8EF)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(color: Color(0xFF64748B), fontSize: 10),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Color(0xFF0F172A),
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _InspectorLoadingSkeleton extends StatefulWidget {
  const _InspectorLoadingSkeleton({super.key});

  @override
  State<_InspectorLoadingSkeleton> createState() =>
      _InspectorLoadingSkeletonState();
}

class _InspectorLoadingSkeletonState extends State<_InspectorLoadingSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _opacity;

  @override
  void initState() {
    super.initState();

    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);

    _opacity = Tween<double>(
      begin: 0.42,
      end: 0.82,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _opacity,
      child: ListView(
        padding: const EdgeInsets.all(22),
        children: const [
          _SkeletonLine(width: 150, height: 16),
          SizedBox(height: 20),
          _SkeletonLine(width: double.infinity, height: 44),
          SizedBox(height: 12),
          _SkeletonLine(width: double.infinity, height: 44),
          SizedBox(height: 12),
          _SkeletonLine(width: double.infinity, height: 44),
          SizedBox(height: 28),
          _SkeletonLine(width: 130, height: 16),
          SizedBox(height: 16),
          _SkeletonLine(width: double.infinity, height: 120),
          SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _SkeletonLine(width: double.infinity, height: 78),
              ),
              SizedBox(width: 12),
              Expanded(
                child: _SkeletonLine(width: double.infinity, height: 78),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SkeletonLine extends StatelessWidget {
  final double width;
  final double height;

  const _SkeletonLine({required this.width, required this.height});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: const Color(0xFFE8EDF3),
          borderRadius: BorderRadius.circular(8),
        ),
      ),
    );
  }
}

class _InspectorErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _InspectorErrorState({
    super.key,
    required this.message,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.error_outline_rounded,
              size: 42,
              color: Color(0xFFDC2626),
            ),
            const SizedBox(height: 12),
            const Text(
              'Unable to load user details',
              style: TextStyle(
                color: Color(0xFF0F172A),
                fontSize: 15,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 7),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ),
      ),
    );
  }
}

class _ActionMenuItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color? color;

  const _ActionMenuItem({required this.icon, required this.label, this.color});

  @override
  Widget build(BuildContext context) {
    final foreground = color ?? const Color(0xFF334155);

    return Row(
      children: [
        Icon(icon, size: 18, color: foreground),
        const SizedBox(width: 10),
        Text(label, style: TextStyle(color: foreground, fontSize: 13)),
      ],
    );
  }
}

class _PaginationIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onPressed;

  const _PaginationIconButton({required this.icon, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 38,
      height: 38,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          padding: EdgeInsets.zero,
          foregroundColor: const Color(0xFF475569),
          disabledForegroundColor: const Color(0xFFCBD5E1),
          side: const BorderSide(color: Color(0xFFDDE3EC)),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
        ),
        child: Icon(icon, size: 18),
      ),
    );
  }
}

class _PageNumberButton extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback? onPressed;

  const _PageNumberButton({
    required this.label,
    this.selected = false,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 38,
      height: 38,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          padding: EdgeInsets.zero,
          foregroundColor: selected
              ? const Color(0xFFFF6333)
              : const Color(0xFF475569),
          backgroundColor: selected ? const Color(0xFFFFF3EE) : Colors.white,
          side: BorderSide(
            color: selected ? const Color(0xFFFFD9C9) : const Color(0xFFDDE3EC),
          ),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

class _LastLoginCell extends StatelessWidget {
  final DateTime? date;

  const _LastLoginCell({required this.date});

  @override
  Widget build(BuildContext context) {
    if (date == null) {
      return const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _LoginStatusDot(active: false),
          SizedBox(width: 8),
          Text(
            'Never',
            style: TextStyle(color: Color(0xFF64748B), fontSize: 12),
          ),
        ],
      );
    }

    final difference = DateTime.now().difference(date!);
    final recentlyActive = difference.inHours < 24;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _LoginStatusDot(active: recentlyActive),
        const SizedBox(width: 8),
        Text(
          _relativeTime(date!),
          style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
        ),
      ],
    );
  }
}

class _LoginStatusDot extends StatelessWidget {
  final bool active;

  const _LoginStatusDot({required this.active});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 6,
      height: 6,
      decoration: BoxDecoration(
        color: active ? const Color(0xFF16A34A) : const Color(0xFF94A3B8),
        shape: BoxShape.circle,
      ),
    );
  }
}

String _relativeTime(DateTime date) {
  final difference = DateTime.now().difference(date);

  if (difference.isNegative || difference.inMinutes < 1) {
    return 'Just now';
  }

  if (difference.inMinutes < 60) {
    final value = difference.inMinutes;
    return '$value minute${value == 1 ? '' : 's'} ago';
  }

  if (difference.inHours < 24) {
    final value = difference.inHours;
    return '$value hour${value == 1 ? '' : 's'} ago';
  }

  if (difference.inDays == 1) {
    return 'Yesterday';
  }

  if (difference.inDays < 7) {
    return '${difference.inDays} days ago';
  }

  if (difference.inDays < 30) {
    final weeks = difference.inDays ~/ 7;
    return '$weeks week${weeks == 1 ? '' : 's'} ago';
  }

  final months = difference.inDays ~/ 30;

  if (months < 12) {
    return '$months month${months == 1 ? '' : 's'} ago';
  }

  final years = difference.inDays ~/ 365;
  return '$years year${years == 1 ? '' : 's'} ago';
}

String _formatInspectorDate(DateTime? date) {
  if (date == null) {
    return 'Not available';
  }

  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  return '${months[date.month - 1]} ${date.day}, ${date.year}';
}

class _AccountSummaryCard extends StatelessWidget {
  final double width;
  final int totalAccounts;
  final int customers;
  final int providers;

  final _AccountGrowth accountGrowth;

  const _AccountSummaryCard({
    required this.width,
    required this.totalAccounts,
    required this.customers,
    required this.providers,

    required this.accountGrowth,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width,
      height: 198,
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 20, 18, 18),
        decoration: _summaryCardDecoration(),
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
                        'Total Accounts',
                        style: TextStyle(
                          color: Color(0xFF475569),
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        _formatNumber(totalAccounts),
                        style: const TextStyle(
                          color: Color(0xFF0F172A),
                          fontSize: 26,
                          height: 1,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                _SummaryIcon(
                  icon: Icons.people_alt_outlined,
                  foregroundColor: const Color(0xFF7C5CFC),
                  backgroundColor: const Color(0xFFF0ECFF),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _AccountBreakdownRow(
              color: const Color(0xFF8B5CF6),
              label: 'Customers',
              value: customers,
            ),
            const SizedBox(height: 7),
            _AccountBreakdownRow(
              color: const Color(0xFF3B82F6),
              label: 'Providers',
              value: providers,
            ),
            const SizedBox(height: 7),

            const Spacer(),

            if (accountGrowth.shouldShow)
              _AccountGrowthIndicator(growth: accountGrowth),
          ],
        ),
      ),
    );
  }
}

class _AccountGrowthIndicator extends StatelessWidget {
  final _AccountGrowth growth;

  const _AccountGrowthIndicator({required this.growth});

  @override
  Widget build(BuildContext context) {
    final isIncrease = growth.direction == _GrowthDirection.increase;

    final color = isIncrease
        ? const Color(0xFF16A34A)
        : const Color(0xFFDC2626);

    final icon = isIncrease
        ? Icons.arrow_upward_rounded
        : Icons.arrow_downward_rounded;

    return Row(
      children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 3),
        Flexible(
          child: Text(
            growth.message,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}

class _AccountBreakdownRow extends StatelessWidget {
  final Color color;
  final String label;
  final int value;

  const _AccountBreakdownRow({
    required this.color,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 6,
          height: 6,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            label,
            style: const TextStyle(color: Color(0xFF334155), fontSize: 11),
          ),
        ),
        Text(
          _formatNumber(value),
          style: const TextStyle(
            color: Color(0xFF0F172A),
            fontSize: 11,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _MetricSummaryCard extends StatelessWidget {
  final double width;
  final String title;
  final String value;
  final String description;
  final IconData icon;
  final Color iconColor;
  final Color iconBackground;

  const _MetricSummaryCard({
    required this.width,
    required this.title,
    required this.value,
    required this.description,
    required this.icon,
    required this.iconColor,
    required this.iconBackground,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width,
      height: 198,
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 20, 18, 12),
        decoration: _summaryCardDecoration(),
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
                      Text(
                        title,
                        style: const TextStyle(
                          color: Color(0xFF475569),
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        value,
                        style: const TextStyle(
                          color: Color(0xFF0F172A),
                          fontSize: 26,
                          height: 1,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        description,
                        style: const TextStyle(
                          color: Color(0xFF64748B),
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
                _SummaryIcon(
                  icon: icon,
                  foregroundColor: iconColor,
                  backgroundColor: iconBackground,
                ),
              ],
            ),
            const Spacer(),
            Text(
              value == '0' ? 'No matching accounts' : 'Updated in real time',
              style: const TextStyle(
                color: Color(0xFF94A3B8),
                fontSize: 11,
                fontWeight: FontWeight.w400,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryIcon extends StatelessWidget {
  final IconData icon;
  final Color foregroundColor;
  final Color backgroundColor;

  const _SummaryIcon({
    required this.icon,
    required this.foregroundColor,
    required this.backgroundColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(color: backgroundColor, shape: BoxShape.circle),
      alignment: Alignment.center,
      child: Icon(icon, size: 21, color: foregroundColor),
    );
  }
}

class _UserAvatar extends StatelessWidget {
  final AdminUser user;
  final double radius;

  const _UserAvatar({
    required this.user,
    this.radius = 22,
  });

  @override
  Widget build(BuildContext context) {
    final imageUrl = user.profileImageUrl?.trim() ?? '';
    final diameter = radius * 2;

    Widget fallback() {
      return Container(
        width: diameter,
        height: diameter,
        alignment: Alignment.center,
        color: const Color(0xFFFFE9DB),
        child: Text(
          user.initials,
          style: TextStyle(
            color: const Color(0xFFE85D04),
            fontSize: radius * 0.72,
            fontWeight: FontWeight.w700,
          ),
        ),
      );
    }

    return ClipOval(
      child: SizedBox(
        width: diameter,
        height: diameter,
        child: imageUrl.isEmpty
            ? fallback()
            : Image.network(
                imageUrl,
                width: diameter,
                height: diameter,
                fit: BoxFit.cover,
                filterQuality: FilterQuality.medium,
                webHtmlElementStrategy:
                    WebHtmlElementStrategy.fallback,
                errorBuilder: (context, error, stackTrace) {
                  debugPrint('Profile image failed: $error');
                  debugPrint('Profile image URL: $imageUrl');

                  return fallback();
                },
                loadingBuilder: (context, child, loadingProgress) {
                  if (loadingProgress == null) {
                    return child;
                  }

                  return Container(
                    width: diameter,
                    height: diameter,
                    alignment: Alignment.center,
                    color: const Color(0xFFFFE9DB),
                    child: SizedBox(
                      width: radius * 0.75,
                      height: radius * 0.75,
                      child: const CircularProgressIndicator(
                        strokeWidth: 2,
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}

class _DetailTile extends StatelessWidget {
  final String label;
  final String value;

  const _DetailTile({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
          ),
          const SizedBox(height: 4),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

BoxDecoration _summaryCardDecoration() {
  return BoxDecoration(
    color: Colors.white,
    borderRadius: BorderRadius.circular(18),
    border: Border.all(color: const Color(0xFFE6EAF0)),
    boxShadow: const [
      BoxShadow(color: Color(0x080F172A), blurRadius: 18, offset: Offset(0, 6)),
    ],
  );
}

String _formatNumber(int value) {
  final text = value.toString();
  final buffer = StringBuffer();

  for (var index = 0; index < text.length; index++) {
    final positionFromEnd = text.length - index;

    buffer.write(text[index]);

    if (positionFromEnd > 1 && positionFromEnd % 3 == 1) {
      buffer.write(',');
    }
  }

  return buffer.toString();
}

DateTime? _dateFromValue(dynamic value) {
  if (value is Timestamp) {
    return value.toDate();
  }

  if (value is DateTime) {
    return value;
  }

  if (value is int) {
    return DateTime.fromMillisecondsSinceEpoch(value);
  }

  if (value is String) {
    return DateTime.tryParse(value);
  }

  return null;
}

class _AccountGrowth {
  final int currentMonthCount;
  final int previousMonthCount;
  final double? percentage;
  final _GrowthDirection direction;

  const _AccountGrowth({
    required this.currentMonthCount,
    required this.previousMonthCount,
    required this.percentage,
    required this.direction,
  });

  bool get shouldShow {
    if (currentMonthCount == 0 && previousMonthCount == 0) {
      return false;
    }

    return currentMonthCount != previousMonthCount;
  }

  String get message {
    if (previousMonthCount == 0) {
      return currentMonthCount == 1
          ? '1 new account this month'
          : '$currentMonthCount new accounts this month';
    }

    final percentageValue = percentage?.abs() ?? 0;

    if (direction == _GrowthDirection.increase) {
      return '${percentageValue.toStringAsFixed(1)}% more than last month';
    }

    if (direction == _GrowthDirection.decrease) {
      return '${percentageValue.toStringAsFixed(1)}% fewer than last month';
    }

    return '';
  }
}

enum _GrowthDirection { increase, decrease, unchanged }

_AccountGrowth _calculateAccountGrowth({
  required int currentMonth,
  required int previousMonth,
}) {
  if (currentMonth == previousMonth) {
    return _AccountGrowth(
      currentMonthCount: currentMonth,
      previousMonthCount: previousMonth,
      percentage: 0,
      direction: _GrowthDirection.unchanged,
    );
  }

  if (previousMonth == 0) {
    return _AccountGrowth(
      currentMonthCount: currentMonth,
      previousMonthCount: previousMonth,
      percentage: null,
      direction: currentMonth > 0
          ? _GrowthDirection.increase
          : _GrowthDirection.unchanged,
    );
  }

  final percentage = ((currentMonth - previousMonth) / previousMonth) * 100;

  return _AccountGrowth(
    currentMonthCount: currentMonth,
    previousMonthCount: previousMonth,
    percentage: percentage,
    direction: percentage > 0
        ? _GrowthDirection.increase
        : _GrowthDirection.decrease,
  );
}
