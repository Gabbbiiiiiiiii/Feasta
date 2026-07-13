import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../models/verification/provider_verification.dart';
import 'provider_verification_list_item.dart';

class ProviderVerificationList extends StatefulWidget {
  final List<ProviderVerificationApplication> applications;
  final String? selectedApplicationId;
  final VerificationFilter selectedFilter;
  final ValueChanged<VerificationFilter> onFilterChanged;
  final ValueChanged<ProviderVerificationApplication> onApplicationSelected;
  final bool isLoading;
  final String? errorMessage;
  final VoidCallback? onRetry;
  final int pageSize;

  const ProviderVerificationList({
    super.key,
    required this.applications,
    required this.selectedApplicationId,
    required this.selectedFilter,
    required this.onFilterChanged,
    required this.onApplicationSelected,
    this.isLoading = false,
    this.errorMessage,
    this.onRetry,
    this.pageSize = 5,
  });

  @override
  State<ProviderVerificationList> createState() =>
      _ProviderVerificationListState();
}

class _ProviderVerificationListState
    extends State<ProviderVerificationList> {
  int _currentPage = 0;

  int get _totalPages {
    if (widget.applications.isEmpty) {
      return 1;
    }

    return (widget.applications.length / widget.pageSize).ceil();
  }

  List<ProviderVerificationApplication> get _visibleApplications {
    final safePage = _currentPage.clamp(0, _totalPages - 1);
    final startIndex = safePage * widget.pageSize;

    if (startIndex >= widget.applications.length) {
      return const [];
    }

    final endIndex = math.min(
      startIndex + widget.pageSize,
      widget.applications.length,
    );

    return widget.applications.sublist(startIndex, endIndex);
  }

  @override
  void didUpdateWidget(
    covariant ProviderVerificationList oldWidget,
  ) {
    super.didUpdateWidget(oldWidget);

    final filterChanged =
        oldWidget.selectedFilter != widget.selectedFilter;

    final applicationCountChanged =
        oldWidget.applications.length != widget.applications.length;

    if (filterChanged) {
      _currentPage = 0;
      return;
    }

    if (applicationCountChanged && _currentPage >= _totalPages) {
      _currentPage = math.max(0, _totalPages - 1);
    }
  }

  void _previousPage() {
    if (_currentPage <= 0) {
      return;
    }

    setState(() {
      _currentPage--;
    });
  }

  void _nextPage() {
    if (_currentPage >= _totalPages - 1) {
      return;
    }

    setState(() {
      _currentPage++;
    });
  }

  void _selectPage(int page) {
    if (page < 0 || page >= _totalPages) {
      return;
    }

    setState(() {
      _currentPage = page;
    });
  }

  void _changeFilter(VerificationFilter filter) {
    setState(() {
      _currentPage = 0;
    });

    widget.onFilterChanged(filter);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: const Color(0xFFE5E7EB),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.035),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        children: [
          _buildHeader(),
          const Divider(height: 1),
          Expanded(
            child: _buildBody(),
          ),
          if (!widget.isLoading &&
              widget.errorMessage == null &&
              widget.applications.isNotEmpty)
            _buildPagination(),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 15, 16, 5),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Applications',
                  style: TextStyle(
                    color: Color(0xFF111827),
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 9,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFFF3F4F6),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '${widget.applications.length}',
                  style: const TextStyle(
                    color: Color(0xFF4B5563),
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(14, 8, 14, 12),
          child: Row(
            children: VerificationFilter.values.map((filter) {
              final isSelected = widget.selectedFilter == filter;

              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(filter.label),
                  selected: isSelected,
                  showCheckmark: false,
                  onSelected: (_) => _changeFilter(filter),
                  labelStyle: TextStyle(
                    fontSize: 12,
                    fontWeight: isSelected
                        ? FontWeight.w700
                        : FontWeight.w600,
                    color: isSelected
                        ? const Color(0xFFFF6333)
                        : const Color(0xFF6B7280),
                  ),
                  backgroundColor: const Color(0xFFF9FAFB),
                  selectedColor: const Color(0xFFFFF1EC),
                  side: BorderSide(
                    color: isSelected
                        ? const Color(0xFFFFB49C)
                        : const Color(0xFFE5E7EB),
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(9),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
      ],
    );
  }

  Widget _buildBody() {
    if (widget.isLoading) {
      return const _ProviderListLoadingState();
    }

    if (widget.errorMessage != null) {
      return _ProviderListErrorState(
        message: widget.errorMessage!,
        onRetry: widget.onRetry,
      );
    }

    if (widget.applications.isEmpty) {
      return const _ProviderListEmptyState();
    }

    final visibleApplications = _visibleApplications;

    return ListView.separated(
      padding: const EdgeInsets.all(14),
      itemCount: visibleApplications.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        final application = visibleApplications[index];

        return ProviderVerificationListItem(
          application: application,
          isSelected:
              application.id == widget.selectedApplicationId,
          onTap: () => widget.onApplicationSelected(application),
        );
      },
    );
  }

  Widget _buildPagination() {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
      decoration: const BoxDecoration(
        border: Border(
          top: BorderSide(
            color: Color(0xFFE5E7EB),
          ),
        ),
      ),
      child: Row(
        children: [
          Text(
            'Page ${_currentPage + 1} of $_totalPages',
            style: const TextStyle(
              color: Color(0xFF6B7280),
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
          const Spacer(),
          IconButton(
            tooltip: 'Previous page',
            onPressed: _currentPage > 0 ? _previousPage : null,
            icon: const Icon(
              Icons.chevron_left_rounded,
              size: 20,
            ),
          ),
          ...List.generate(
            math.min(_totalPages, 3),
            (index) {
              final page = _paginationStartPage() + index;

              if (page >= _totalPages) {
                return const SizedBox.shrink();
              }

              final isSelected = page == _currentPage;

              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: InkWell(
                  onTap: () => _selectPage(page),
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    width: 32,
                    height: 32,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: isSelected
                          ? const Color(0xFFFF6333)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: isSelected
                            ? const Color(0xFFFF6333)
                            : const Color(0xFFE5E7EB),
                      ),
                    ),
                    child: Text(
                      '${page + 1}',
                      style: TextStyle(
                        color: isSelected
                            ? Colors.white
                            : const Color(0xFF4B5563),
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
          IconButton(
            tooltip: 'Next page',
            onPressed: _currentPage < _totalPages - 1
                ? _nextPage
                : null,
            icon: const Icon(
              Icons.chevron_right_rounded,
              size: 20,
            ),
          ),
        ],
      ),
    );
  }

  int _paginationStartPage() {
    if (_totalPages <= 3) {
      return 0;
    }

    if (_currentPage == 0) {
      return 0;
    }

    if (_currentPage >= _totalPages - 1) {
      return _totalPages - 3;
    }

    return _currentPage - 1;
  }
}

class _ProviderListEmptyState extends StatelessWidget {
  const _ProviderListEmptyState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(30),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.search_off_rounded,
              size: 42,
              color: Color(0xFFCBD5E1),
            ),
            SizedBox(height: 12),
            Text(
              'No applications found',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Color(0xFF1F2937),
                fontSize: 15,
                fontWeight: FontWeight.w700,
              ),
            ),
            SizedBox(height: 5),
            Text(
              'Try changing the status filter or search query.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Color(0xFF6B7280),
                fontSize: 12.5,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProviderListErrorState extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;

  const _ProviderListErrorState({
    required this.message,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(30),
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
              'Unable to load applications',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Color(0xFF1F2937),
                fontSize: 15,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 5),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Color(0xFF6B7280),
                fontSize: 12.5,
              ),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 14),
              OutlinedButton.icon(
                onPressed: onRetry,
                icon: const Icon(
                  Icons.refresh_rounded,
                  size: 18,
                ),
                label: const Text('Try again'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ProviderListLoadingState extends StatelessWidget {
  const _ProviderListLoadingState();

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.all(14),
      itemCount: 5,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, __) {
        return Container(
          height: 105,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFFF9FAFB),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: const Color(0xFFE5E7EB),
            ),
          ),
          child: const Row(
            children: [
              _LoadingBox(
                width: 48,
                height: 48,
                radius: 13,
              ),
              SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _LoadingBox(
                      width: 160,
                      height: 13,
                    ),
                    SizedBox(height: 9),
                    _LoadingBox(
                      width: 110,
                      height: 10,
                    ),
                    SizedBox(height: 10),
                    _LoadingBox(
                      width: 70,
                      height: 22,
                      radius: 8,
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _LoadingBox extends StatelessWidget {
  final double width;
  final double height;
  final double radius;

  const _LoadingBox({
    required this.width,
    required this.height,
    this.radius = 5,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: const Color(0xFFE5E7EB),
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}