import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:feasta/core/constants/firestore_collections.dart';
import 'dart:async';

import '../models/admin_user.dart';
import '../models/admin_user_page.dart';
import '../services/admin_user_service.dart';
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

  Timer? _searchDebounce;

  List<AdminUser> _searchResults = const [];

  bool _isSearching = false;
  String? _searchError;

  AdminUserPage _page = const AdminUserPage.empty();

  final List<DocumentSnapshot<Map<String, dynamic>>> _pageCursors = [];

  bool _isLoading = true;
  String? _errorMessage;

  String _selectedRole = 'all';
  String _selectedStatus = 'all';

  int _currentPage = 1;
  int _pageSize = 10;

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

  Future<void> _loadFirstPage() async {
    _pageCursors.clear();
    _currentPage = 1;

    await _loadUsers();
  }

  Future<void> _loadUsers({
    DocumentSnapshot<Map<String, dynamic>>? startAfter,
  }) async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final result = await _service.loadUsers(
        limit: _pageSize,
        role: _selectedRole,
        accountStatus: _selectedStatus,
        startAfter: startAfter,
      );

      if (!mounted) return;

      setState(() {
        _page = result;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _isLoading = false;
        _errorMessage = error.toString();
      });
    }
  }

  Future<void> _nextPage() async {
    if (!_page.hasMore || _page.lastDocument == null || _isLoading) {
      return;
    }

    _pageCursors.add(_page.lastDocument!);
    _currentPage++;

    await _loadUsers(startAfter: _page.lastDocument);
  }

  Future<void> _previousPage() async {
    if (_currentPage <= 1 || _isLoading) return;

    _pageCursors.removeLast();
    _currentPage--;

    final cursor =
        _pageCursors.isEmpty ? null : _pageCursors.last;

    await _loadUsers(startAfter: cursor);
  }

  bool get _hasSearchQuery {
    return _searchController.text.trim().isNotEmpty;
  }

  List<AdminUser> get _visibleUsers {
    if (_hasSearchQuery) {
      return _searchResults;
    }

    return _page.users;
  }

  Future<void> _refresh() async {
    await _rerunSearchIfNeeded();
  }

  void _onSearchChanged(String value) {
  _searchDebounce?.cancel();

  final query = value.trim();

  if (query.isEmpty) {
    setState(() {
      _searchResults = const [];
      _searchError = null;
      _isSearching = false;
    });

    return;
  }

  _searchDebounce = Timer(
    const Duration(milliseconds: 450),
    () => _searchAllUsers(query),
  );
}

Future<void> _searchAllUsers(String query) async {
  setState(() {
    _isSearching = true;
    _searchError = null;
  });

  try {
    final results = await _service.searchUsers(
      searchText: query,
      role: _selectedRole,
      accountStatus: _selectedStatus,
    );

    if (!mounted) return;

    // Ignore an outdated response if the text changed while loading.
    if (_searchController.text.trim() != query) {
      return;
    }

    setState(() {
      _searchResults = results;
      _isSearching = false;
    });
  } catch (error) {
    if (!mounted) return;

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

  await _searchAllUsers(query);
}

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isNarrow = constraints.maxWidth < 900;

        return SingleChildScrollView(
          child: Align(
            alignment: Alignment.topLeft,
            child: ConstrainedBox(
              constraints: const BoxConstraints(
                maxWidth: 1500,
              ),
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
          'Monitor and manage all platform accounts.',
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
      icon: const Icon(
        Icons.download_rounded,
        size: 18,
      ),
      label: const Text('Export'),
      style: OutlinedButton.styleFrom(
        foregroundColor: const Color(0xFF334155),
        backgroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(
          horizontal: 18,
          vertical: 17,
        ),
        side: const BorderSide(
          color: Color(0xFFE2E8F0),
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(11),
        ),
      ),
    );

    final refreshButton = OutlinedButton(
      onPressed: _isLoading ? null : _refresh,
      style: OutlinedButton.styleFrom(
        foregroundColor: const Color(0xFF334155),
        backgroundColor: Colors.white,
        minimumSize: const Size(48, 52),
        padding: EdgeInsets.zero,
        side: const BorderSide(
          color: Color(0xFFE2E8F0),
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(11),
        ),
      ),
      child: const Icon(
        Icons.refresh_rounded,
        size: 20,
      ),
    );

    final actions = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        exportButton,
        const SizedBox(width: 12),
        refreshButton,
      ],
    );

    if (isNarrow) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          titleSection,
          const SizedBox(height: 16),
          actions,
        ],
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
                  style: TextStyle(
                    color: Color(0xFFDC2626),
                  ),
                ),
              );
            }

            if (!userSnapshot.hasData || !providerSnapshot.hasData) {
              return const SizedBox(
                height: 198,
                child: Center(
                  child: CircularProgressIndicator(),
                ),
              );
            }

            var totalAccounts = 0;
            var customers = 0;
            var providers = 0;
            var administrators = 0;
            var restrictedAccounts = 0;

            var registeredThisMonth = 0;
            var registeredLastMonth = 0;

            final now = DateTime.now();

            final startOfThisMonth = DateTime(
              now.year,
              now.month,
              1,
            );

            final startOfNextMonth = DateTime(
              now.year,
              now.month + 1,
              1,
            );

            final startOfLastMonth = DateTime(
              now.year,
              now.month - 1,
              1,
            );
            

            var verifiedProviders = 0;
            var pendingProviders = 0;

            if (userSnapshot.hasData) {
              totalAccounts = userSnapshot.data!.size;

              for (final document in userSnapshot.data!.docs) {
                final data = document.data();

                final role =
                    data['role']?.toString().trim().toLowerCase() ?? '';

                final isActive = data['isActive'] != false;
                final isBlocked = data['isBlocked'] == true;

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

                switch (role) {
                  case 'customer':
                    customers++;
                    break;

                  case 'provider':
                    providers++;
                    break;

                  case 'admin':
                    administrators++;
                    break;
                }

                if (!isActive || isBlocked) {
                  restrictedAccounts++;
                }
              }
            }

            if (providerSnapshot.hasData) {
              for (final document in providerSnapshot.data!.docs) {
                final data = document.data();

                final verificationStatus = data['verificationStatus']
                        ?.toString()
                        .trim()
                        .toLowerCase() ??
                    'pending';

                if (verificationStatus == 'verified') {
                  verifiedProviders++;
                }

                if (verificationStatus == 'pending') {
                  pendingProviders++;
                }
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

                return Wrap(
                  spacing: 16,
                  runSpacing: 16,
                  children: [
                    _AccountSummaryCard(
                      width: cardWidth,
                      totalAccounts: totalAccounts,
                      customers: customers,
                      providers: providers,
                      administrators: administrators,
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
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: const Color(0xFFE7EBF1),
        ),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(20),
            child: _buildFilters(isNarrow),
          ),
          const Divider(height: 1),
          _buildContent(),
          const Divider(height: 1),
          _buildPagination(),
        ],
      ),
    );
  }

  Widget _buildFilters(bool isNarrow) {
    final searchField = TextField(
      controller: _searchController,
      onChanged: _onSearchChanged,
      decoration: InputDecoration(
        hintText: 'Search by name, email, phone, or business name...',
        prefixIcon: const Icon(Icons.search_rounded),
        suffixIcon: _hasSearchQuery
        ? IconButton(
            tooltip: 'Clear search',
            onPressed: () {
              _searchDebounce?.cancel();
              _searchController.clear();

              setState(() {
                _searchResults = const [];
                _searchError = null;
                _isSearching = false;
              });
            },
            icon: const Icon(Icons.close_rounded),
          )
        : null,
        filled: true,
        fillColor: const Color(0xFFF8FAFC),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(
            color: Color(0xFFE2E8F0),
          ),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(
            color: Color(0xFFE2E8F0),
          ),
        ),
      ),
    );

    final roleFilter = DropdownButtonFormField<String>(
      initialValue: _selectedRole,
      decoration: const InputDecoration(
        labelText: 'Role',
        border: OutlineInputBorder(),
      ),
      items: const [
        DropdownMenuItem(
          value: 'all',
          child: Text('All roles'),
        ),
        DropdownMenuItem(
          value: 'customer',
          child: Text('Customer'),
        ),
        DropdownMenuItem(
          value: 'provider',
          child: Text('Provider'),
        ),
        DropdownMenuItem(
          value: 'admin',
          child: Text('Administrator'),
        ),
      ],
      onChanged: (value) {
        if (value == null) return;

        setState(() {
          _selectedRole = value;
        });

        _rerunSearchIfNeeded();
      },
    );

    final statusFilter = DropdownButtonFormField<String>(
      initialValue: _selectedStatus,
      decoration: const InputDecoration(
        labelText: 'Status',
        border: OutlineInputBorder(),
      ),
      items: const [
        DropdownMenuItem(
          value: 'all',
          child: Text('All statuses'),
        ),
        DropdownMenuItem(
          value: 'active',
          child: Text('Active'),
        ),
        DropdownMenuItem(
          value: 'disabled',
          child: Text('Disabled'),
        ),
        DropdownMenuItem(
          value: 'blocked',
          child: Text('Blocked'),
        ),
      ],
      onChanged: (value) {
        if (value == null) return;

        setState(() {
          _selectedStatus = value;
        });

        _rerunSearchIfNeeded();
      },
    );

    if (isNarrow) {
      return Column(
        children: [
          searchField,
          const SizedBox(height: 12),
          roleFilter,
          const SizedBox(height: 12),
          statusFilter,
        ],
      );
    }

    return Row(
      children: [
        Expanded(
          flex: 2,
          child: searchField,
        ),
        const SizedBox(width: 12),
        SizedBox(
          width: 190,
          child: roleFilter,
        ),
        const SizedBox(width: 12),
        SizedBox(
          width: 190,
          child: statusFilter,
        ),
      ],
    );
  }

  Widget _buildContent() {
    if (_isSearching) {
      return const SizedBox(
        height: 240,
        child: Center(
          child: CircularProgressIndicator(),
        ),
      );
    }

    if (_searchError != null) {
      return SizedBox(
        height: 240,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.search_off_rounded,
                  size: 42,
                  color: Color(0xFFDC2626),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Unable to search accounts',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  _searchError!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Color(0xFF64748B),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    if (_isLoading && !_hasSearchQuery) {
      return const SizedBox(
        height: 320,
        child: Center(
          child: CircularProgressIndicator(),
        ),
      );
    }

    if (_errorMessage != null && !_hasSearchQuery) {
      return SizedBox(
        height: 320,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.error_outline_rounded,
                  size: 42,
                  color: Color(0xFFDC2626),
                ),
                const SizedBox(height: 12),
                Text(
                  'Unable to load users',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 6),
                Text(
                  _errorMessage!,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: const Color(0xFF64748B),
                      ),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _refresh,
                  child: const Text('Try again'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final users = _visibleUsers;

    if (users.isEmpty) {
      return SizedBox(
        height: 300,
        child: Center(
          child: Text(
            _hasSearchQuery
                ? 'No accounts match your search.'
                : 'No user accounts found.',
          ),
        ),
      );
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        headingRowHeight: 54,
        dataRowMinHeight: 72,
        dataRowMaxHeight: 82,
        columnSpacing: 34,
        columns: const [
          DataColumn(label: Text('Account')),
          DataColumn(label: Text('Role')),
          DataColumn(label: Text('Verification')),
          DataColumn(label: Text('Status')),
          DataColumn(label: Text('Registered')),
          DataColumn(label: Text('Last Login')),
          DataColumn(label: Text('Actions')),
        ],
        rows: users.map(_buildUserRow).toList(),
      ),
    );
  }

  DataRow _buildUserRow(AdminUser user) {
    return DataRow(
      cells: [
        DataCell(
          SizedBox(
            width: 270,
            child: Row(
              children: [
                _UserAvatar(user: user),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user.fullName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
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
                          fontSize: 12,
                        ),
                      ),
                      if ((user.businessName ?? '').isNotEmpty)
                        Text(
                          user.businessName!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Color(0xFF94A3B8),
                            fontSize: 11,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        DataCell(
          UserRoleBadge(role: user.role),
        ),
        DataCell(
          VerificationBadge(
            status: user.verificationStatus,
            isProvider: user.isProvider,
          ),
        ),
        DataCell(
          UserStatusBadge(
            isActive: user.isActive,
            isBlocked: user.isBlocked,
          ),
        ),
        DataCell(
          Text(_formatDate(user.createdAt)),
        ),
        DataCell(
          Text(_formatDateTime(user.lastLoginAt)),
        ),
        DataCell(
          PopupMenuButton<String>(
            tooltip: 'Account actions',
            onSelected: (value) => _handleAction(value, user),
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: 'view',
                child: Text('View details'),
              ),
              PopupMenuItem(
                value: user.isActive ? 'disable' : 'enable',
                child: Text(
                  user.isActive
                      ? 'Disable account'
                      : 'Enable account',
                ),
              ),
              PopupMenuItem(
                value: user.isBlocked ? 'unblock' : 'block',
                child: Text(
                  user.isBlocked
                      ? 'Unblock account'
                      : 'Block account',
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _handleAction(
    String action,
    AdminUser user,
  ) async {
    switch (action) {
      case 'view':
        _showUserDetails(user);
        break;

      case 'disable':
        await _confirmAccountStatus(
          user: user,
          isActive: false,
        );
        break;

      case 'enable':
        await _confirmAccountStatus(
          user: user,
          isActive: true,
        );
        break;

      case 'block':
        await _confirmBlockedStatus(
          user: user,
          isBlocked: true,
        );
        break;

      case 'unblock':
        await _confirmBlockedStatus(
          user: user,
          isBlocked: false,
        );
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
          title: Text(
            isActive ? 'Enable account?' : 'Disable account?',
          ),
          content: Text(
            isActive
                ? 'This will restore access for ${user.fullName}.'
                : 'This will restrict access for ${user.fullName}.',
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
      () => _service.updateAccountStatus(
        user: user,
        isActive: isActive,
      ),
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
          title: Text(
            isBlocked ? 'Block account?' : 'Unblock account?',
          ),
          content: Text(
            isBlocked
                ? '${user.fullName} will be marked as blocked.'
                : '${user.fullName} will be allowed to use the account again.',
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
      () => _service.updateBlockedStatus(
        user: user,
        isBlocked: isBlocked,
      ),
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

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(successMessage),
        ),
      );

      if (_hasSearchQuery) {
        await _searchAllUsers(
          _searchController.text.trim(),
        );
      } else {
        await _loadUsers(
          startAfter:
              _pageCursors.isEmpty ? null : _pageCursors.last,
        );
      }
    } 
    catch (error) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error.toString()),
        ),
      );
    }
  }

  void _showUserDetails(AdminUser user) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return Align(
          alignment: Alignment.centerRight,
          child: Container(
            width: 440,
            height: MediaQuery.sizeOf(context).height,
            padding: const EdgeInsets.all(24),
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.horizontal(
                left: Radius.circular(24),
              ),
            ),
            child: SafeArea(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      _UserAvatar(
                        user: user,
                        radius: 30,
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment:
                              CrossAxisAlignment.start,
                          children: [
                            Text(
                              user.fullName,
                              style: Theme.of(context)
                                  .textTheme
                                  .titleLarge
                                  ?.copyWith(
                                    fontWeight: FontWeight.w700,
                                  ),
                            ),
                            Text(
                              user.email,
                              style: const TextStyle(
                                color: Color(0xFF64748B),
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  _DetailTile(
                    label: 'Phone',
                    value: user.phoneNumber.isEmpty
                        ? 'Not provided'
                        : user.phoneNumber,
                  ),
                  _DetailTile(
                    label: 'Role',
                    value: user.role,
                  ),
                  _DetailTile(
                    label: 'Account status',
                    value: user.accountStatus,
                  ),
                  _DetailTile(
                    label: 'Email verified',
                    value: user.isEmailVerified ? 'Yes' : 'No',
                  ),
                  _DetailTile(
                    label: 'Phone verified',
                    value: user.isPhoneVerified ? 'Yes' : 'No',
                  ),
                  if (user.isProvider) ...[
                    const Divider(height: 32),
                    _DetailTile(
                      label: 'Business name',
                      value: user.businessName ?? 'Not available',
                    ),
                    _DetailTile(
                      label: 'Service type',
                      value:
                          user.providerServiceType ?? 'Not available',
                    ),
                    _DetailTile(
                      label: 'Category',
                      value:
                          user.providerCategory ?? 'Not available',
                    ),
                    _DetailTile(
                      label: 'Verification',
                      value:
                          user.verificationStatus ?? 'Pending',
                    ),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildPagination() {

    if (_hasSearchQuery) {
      return Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: 18,
          vertical: 16,
        ),
        child: Row(
          children: [
            Text(
              '${_searchResults.length} search result'
              '${_searchResults.length == 1 ? '' : 's'}',
              style: const TextStyle(
                color: Color(0xFF64748B),
              ),
            ),
          ],
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: 18,
        vertical: 14,
      ),
      child: Row(
        children: [
          Text(
            'Page $_currentPage',
            style: const TextStyle(
              color: Color(0xFF64748B),
            ),
          ),
          const Spacer(),
          const Text('Rows per page'),
          const SizedBox(width: 8),
          DropdownButton<int>(
            value: _pageSize,
            items: const [
              DropdownMenuItem(value: 10, child: Text('10')),
              DropdownMenuItem(value: 20, child: Text('20')),
              DropdownMenuItem(value: 50, child: Text('50')),
            ],
            onChanged: (value) {
              if (value == null) return;

              setState(() {
                _pageSize = value;
              });

              _loadFirstPage();
            },
          ),
          const SizedBox(width: 16),
          IconButton(
            onPressed:
                _currentPage > 1 && !_isLoading
                    ? _previousPage
                    : null,
            icon: const Icon(Icons.chevron_left_rounded),
          ),
          IconButton(
            onPressed:
                _page.hasMore && !_isLoading
                    ? _nextPage
                    : null,
            icon: const Icon(Icons.chevron_right_rounded),
          ),
        ],
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

  String _formatDateTime(DateTime? date) {
    if (date == null) return 'Never';

    final hour = date.hour == 0
        ? 12
        : date.hour > 12
            ? date.hour - 12
            : date.hour;

    final minute = date.minute.toString().padLeft(2, '0');
    final period = date.hour >= 12 ? 'PM' : 'AM';

    return '${_formatDate(date)} · $hour:$minute $period';
  }
}

class _AccountSummaryCard extends StatelessWidget {
    final double width;
    final int totalAccounts;
    final int customers;
    final int providers;
    final int administrators;
    final _AccountGrowth accountGrowth;

    const _AccountSummaryCard({
      required this.width,
      required this.totalAccounts,
      required this.customers,
      required this.providers,
      required this.administrators,
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
              _AccountBreakdownRow(
                color: const Color(0xFFF97316),
                label: 'Administrators',
                value: administrators,
              ),
              const Spacer(),

              if (accountGrowth.shouldShow)
              _AccountGrowthIndicator(
                growth: accountGrowth,
              ),
            ],
          ),
        ),
      );
    }
  }

  class _AccountGrowthIndicator extends StatelessWidget {
  final _AccountGrowth growth;

  const _AccountGrowthIndicator({
    required this.growth,
  });

  @override
  Widget build(BuildContext context) {
    final isIncrease =
        growth.direction == _GrowthDirection.increase;

    final color = isIncrease
        ? const Color(0xFF16A34A)
        : const Color(0xFFDC2626);

    final icon = isIncrease
        ? Icons.arrow_upward_rounded
        : Icons.arrow_downward_rounded;

    return Row(
      children: [
        Icon(
          icon,
          size: 14,
          color: color,
        ),
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
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: Color(0xFF334155),
                fontSize: 11,
              ),
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
        decoration: BoxDecoration(
          color: backgroundColor,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: Icon(
          icon,
          size: 21,
          color: foregroundColor,
        ),
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
    final imageUrl = user.profileImageUrl;

    return CircleAvatar(
      radius: radius,
      backgroundColor: const Color(0xFFFFE9DB),
      backgroundImage:
          imageUrl != null && imageUrl.isNotEmpty
              ? NetworkImage(imageUrl)
              : null,
      child: imageUrl == null || imageUrl.isEmpty
          ? Text(
              user.initials,
              style: const TextStyle(
                color: Color(0xFFE85D04),
                fontWeight: FontWeight.w700,
              ),
            )
          : null,
    );
  }
}

class _DetailTile extends StatelessWidget {
  final String label;
  final String value;

  const _DetailTile({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: Color(0xFF94A3B8),
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

BoxDecoration _summaryCardDecoration() {
  return BoxDecoration(
    color: Colors.white,
    borderRadius: BorderRadius.circular(18),
    border: Border.all(
      color: const Color(0xFFE6EAF0),
    ),
    boxShadow: const [
      BoxShadow(
        color: Color(0x080F172A),
        blurRadius: 18,
        offset: Offset(0, 6),
      ),
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

enum _GrowthDirection {
  increase,
  decrease,
  unchanged,
}

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

  final percentage =
      ((currentMonth - previousMonth) / previousMonth) * 100;

  return _AccountGrowth(
    currentMonthCount: currentMonth,
    previousMonthCount: previousMonth,
    percentage: percentage,
    direction: percentage > 0
        ? _GrowthDirection.increase
        : _GrowthDirection.decrease,
  );
}