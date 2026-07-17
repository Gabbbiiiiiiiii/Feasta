import 'package:flutter/material.dart';

import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import '../../shared/widgets/loading_skeleton.dart';
import 'package_details_screen.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../core/helpers/auth_guard.dart';


class ProviderProfileScreen extends StatefulWidget {
  final ProviderModel provider;

  const ProviderProfileScreen({
    super.key,
    required this.provider,
  });

  @override
  State<ProviderProfileScreen> createState() => _ProviderProfileScreenState();
}

class _ProviderProfileScreenState extends State<ProviderProfileScreen> {
  final FeastaRepository _repository = FeastaRepository();

  int selectedTab = 0;

  final List<String> tabs = [
    'Packages',
    'Menu',
    'Photos',
    'Reviews',
  ];

   @override
  void initState() {
    super.initState();

    _repository.incrementProviderViewCount(widget.provider.id);
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Stack(
                children: [
                  widget.provider.coverImageUrl == null ||
                          widget.provider.coverImageUrl!.isEmpty
                      ? Container(
                          height: 230,
                          width: double.infinity,
                          color: Colors.grey.shade300,
                          child: const Icon(
                            Icons.image_outlined,
                            size: 70,
                            color: Colors.grey,
                          ),
                        )
                      : Image.network(
                          widget.provider.coverImageUrl!,
                          height: 230,
                          width: double.infinity,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) {
                            return Container(
                              height: 230,
                              width: double.infinity,
                              color: Colors.grey.shade300,
                              child: const Icon(Icons.broken_image),
                            );
                          },
                        ),

                  Positioned(
                    top: 14,
                    left: 14,
                    child: CircleAvatar(
                      backgroundColor: Colors.white,
                      child: IconButton(
                        icon: const Icon(Icons.chevron_left),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ),
                  ),

                  Positioned(
                    top: 14,
                    right: 14,
                    child: isGuestUser
                        ? CircleAvatar(
                            backgroundColor: Colors.white,
                            child: IconButton(
                              icon: const Icon(
                                Icons.favorite_border,
                                color: Colors.black,
                              ),
                              onPressed: () {
                                requireLogin(
                                  context,
                                  message:
                                      'Please log in or create an account to add providers to favorites.',
                                );
                              },
                            ),
                          )
                        : StreamBuilder(
                            stream: _repository.myFavorites(),
                            builder: (context, snapshot) {
                              final docs = snapshot.data?.docs ?? [];

                              final isFavorite = docs.any((doc) {
                                final data = doc.data() as Map<String, dynamic>;
                                return data['providerId'] == widget.provider.id;
                              });

                              return CircleAvatar(
                                backgroundColor: Colors.white,
                                child: IconButton(
                                  icon: Icon(
                                    isFavorite ? Icons.favorite : Icons.favorite_border,
                                    color: isFavorite
                                        ? const Color(0xFFFF6333)
                                        : Colors.black,
                                  ),
                                  onPressed: () async {
                                    try {
                                      if (isFavorite) {
                                        await _repository.removeFromFavorites(
                                          widget.provider.id,
                                        );

                                        if (!mounted) return;

                                        ScaffoldMessenger.of(context).showSnackBar(
                                          const SnackBar(
                                            content: Text('Removed from favorites.'),
                                          ),
                                        );
                                      } else {
                                        await _repository.addToFavorites(
                                          provider: widget.provider,
                                        );

                                        if (!mounted) return;

                                        ScaffoldMessenger.of(context).showSnackBar(
                                          const SnackBar(
                                            content: Text('Added to favorites.'),
                                          ),
                                        );
                                      }
                                    } catch (e) {
                                      if (!mounted) return;

                                      ScaffoldMessenger.of(context).showSnackBar(
                                        SnackBar(
                                          content: Text(
                                            e.toString().replaceAll('Exception: ', ''),
                                          ),
                                        ),
                                      );
                                    }
                                  },
                                ),
                              );
                            },
                          ),
                  ),
                ],
              ),
            ),
            SliverToBoxAdapter(
              child: Container(
                color: Colors.white,
                padding: const EdgeInsets.fromLTRB(22, 20, 22, 18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (widget.provider.logoUrl != null &&
                        widget.provider.logoUrl!.isNotEmpty)
                      ClipRRect(
                        borderRadius: BorderRadius.circular(14),
                        child: Image.network(
                          widget.provider.logoUrl!,
                          width: 72,
                          height: 72,
                          fit: BoxFit.cover,
                        ),
                      ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            widget.provider.businessName,
                            style: const TextStyle(
                              fontSize: 26,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                    if (widget.provider.isApproved)
                          const Icon(
                            Icons.verified,
                            color: Colors.green,
                            size: 26,
                          ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        const Icon(
                          Icons.star,
                          color: Colors.amber,
                          size: 22,
                        ),
                        const SizedBox(width: 5),
                        Text(
                          '${widget.provider.ratingAverage.toStringAsFixed(1)} (${widget.provider.reviewCount} reviews)',
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(width: 16),
                        const Icon(
                          Icons.location_on_outlined,
                          size: 20,
                          color: Colors.grey,
                        ),
                        Expanded(
                          child: Text(
                            widget.provider.location,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Colors.grey),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Text(
                      widget.provider.description,
                      style: const TextStyle(
                        color: Colors.grey,
                        height: 1.5,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 18),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () async {
                              final allowed = await requireLogin(
                                context,
                                message: 'Please log in or create an account to message this provider.',
                              );

                              if (!allowed || !context.mounted) return;

                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text(
                                    'You can message this provider after submitting a booking request.',
                                  ),
                                ),
                              );
                            },
                            icon: const Icon(Icons.chat_bubble_outline),
                            label: const Text('Chat'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: primary,
                              side: const BorderSide(color: primary),
                              minimumSize: const Size.fromHeight(52),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton(
                            onPressed: () async {
                              if (isGuestUser) {
                                await requireLogin(
                                  context,
                                  message:
                                      'Please log in or create an account before booking. You can browse packages first.',
                                );
                                return;
                              }

                              setState(() {
                                selectedTab = 0;
                              });

                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Please choose a package below to continue booking.'),
                                ),
                              );
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: primary,
                              foregroundColor: Colors.white,
                              minimumSize: const Size.fromHeight(52),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                            ),
                            child: const Text(
                              'Book Now',
                              style: TextStyle(fontWeight: FontWeight.w800),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Container(
                color: Colors.white,
                child: Row(
                  children: List.generate(tabs.length, (index) {
                    final isSelected = selectedTab == index;

                    return Expanded(
                      child: InkWell(
                        onTap: () {
                          setState(() {
                            selectedTab = index;
                          });
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          decoration: BoxDecoration(
                            border: Border(
                              bottom: BorderSide(
                                color: isSelected
                                    ? primary
                                    : const Color(0xFFE5E7EB),
                                width: isSelected ? 2 : 1,
                              ),
                            ),
                          ),
                          child: Text(
                            tabs[index],
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: isSelected ? primary : Colors.grey,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                    );
                  }),
                ),
              ),
            ),
            if (selectedTab == 0)
              StreamBuilder<List<PackageModel>>(
                stream: _repository.packagesByProvider(widget.provider.id),
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const SliverToBoxAdapter(
                      child: SizedBox(
                        height: 460,
                        child: FeastaSkeletonList(
                          itemCount: 3,
                          padding: EdgeInsets.all(22),
                          showLeading: false,
                          showTrailing: false,
                          showImage: true,
                          imageHeight: 160,
                        ),
                      ),
                    );
                  }

                  if (snapshot.hasError) {
                    return SliverFillRemaining(
                      child: Center(
                        child: Text('Error: ${snapshot.error}'),
                      ),
                    );
                  }

                  final packages = snapshot.data ?? [];

                  if (packages.isEmpty) {
                    return const SliverFillRemaining(
                      child: Center(
                        child: Text(
                          'No packages available yet.',
                          style: TextStyle(color: Colors.grey),
                        ),
                      ),
                    );
                  }

                  return SliverPadding(
                    padding: const EdgeInsets.all(22),
                    sliver: SliverList.separated(
                      itemCount: packages.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 18),
                      itemBuilder: (context, index) {
                        final eventPackage = packages[index];

                        return PackageCard(
                          eventPackage: eventPackage,
                          provider: widget.provider,
                        );
                      },
                    ),
                  );
                },
              )
            else if (selectedTab == 1)
              SliverToBoxAdapter(
                child: ProviderMenuSection(
                  providerId: widget.provider.id,
                  repository: _repository,
                ),
              )
            else if (selectedTab == 2)
              const SliverFillRemaining(
                child: Center(
                  child: Text('Photos will be connected next.'),
                ),
              )
            else
              StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                stream: _repository.providerReviews(widget.provider.id),
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const SliverToBoxAdapter(
                      child: SizedBox(
                        height: 360,
                        child: FeastaSkeletonList(
                          itemCount: 3,
                          padding: EdgeInsets.all(22),
                        ),
                      ),
                    );
                  }

                  if (snapshot.hasError) {
                    return SliverFillRemaining(
                      child: Center(
                        child: Text('Error: ${snapshot.error}'),
                      ),
                    );
                  }

                  final reviews = snapshot.data?.docs ?? [];

                  if (reviews.isEmpty) {
                    return const SliverFillRemaining(
                      child: Center(
                        child: Text(
                          'No reviews yet.',
                          style: TextStyle(color: Colors.grey),
                        ),
                      ),
                    );
                  }

                  return SliverPadding(
                    padding: const EdgeInsets.all(22),
                    sliver: SliverList.separated(
                      itemCount: reviews.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 14),
                      itemBuilder: (context, index) {
                        final data = reviews[index].data();

                        final customerFirstName =
                            data['customerFirstName'] ?? '';
                        final customerLastName =
                            data['customerLastName'] ?? '';
                        final rating = data['rating'] ?? 0;
                        final comment = data['comment'] ?? '';
                        final createdAt = data['createdAt'];

                        String dateText = '';

                        if (createdAt is Timestamp) {
                          final date = createdAt.toDate();
                          dateText = '${date.month}/${date.day}/${date.year}';
                        }

                        return Container(
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            border: Border.all(
                              color: const Color(0xFFE5E7EB),
                            ),
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  CircleAvatar(
                                    backgroundColor: primary.withOpacity(0.12),
                                    child: Text(
                                      customerFirstName.isNotEmpty
                                          ? customerFirstName[0].toUpperCase()
                                          : '?',
                                      style: const TextStyle(
                                        color: primary,
                                        fontWeight: FontWeight.w900,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Text(
                                      '$customerFirstName $customerLastName',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w900,
                                        fontSize: 16,
                                      ),
                                    ),
                                  ),
                                  if (dateText.isNotEmpty)
                                    Text(
                                      dateText,
                                      style: const TextStyle(
                                        color: Colors.grey,
                                        fontSize: 12,
                                      ),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: List.generate(5, (starIndex) {
                                  return Icon(
                                    starIndex < rating
                                        ? Icons.star
                                        : Icons.star_border,
                                    color: Colors.amber,
                                    size: 20,
                                  );
                                }),
                              ),
                              const SizedBox(height: 10),
                              Text(
                                comment,
                                style: const TextStyle(
                                  color: Colors.grey,
                                  height: 1.4,
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  );
                },
              ),
          ],
        ),
      ),
    );
  }
}

class PackageCard extends StatelessWidget {
  final PackageModel eventPackage;
  final ProviderModel provider;

  const PackageCard({
    super.key,
    required this.eventPackage,
    required this.provider,
  });

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => PackageDetailsScreen(
              provider: provider,
              eventPackage: eventPackage,
            ),
          ),
        );
      },
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: const Color(0xFFE5E7EB)),
          borderRadius: BorderRadius.circular(18),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            eventPackage.imageUrl == null || eventPackage.imageUrl!.isEmpty
                ? Container(
                    height: 180,
                    width: double.infinity,
                    color: Colors.grey.shade300,
                    child: const Icon(
                      Icons.image_outlined,
                      size: 60,
                      color: Colors.grey,
                    ),
                  )
                : Image.network(
                    eventPackage.imageUrl!,
                    height: 180,
                    width: double.infinity,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) {
                      return Container(
                        height: 180,
                        color: Colors.grey.shade300,
                        child: const Icon(Icons.broken_image),
                      );
                    },
                  ),
            Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    eventPackage.name,
                    style: const TextStyle(
                      fontSize: 21,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      const Icon(
                        Icons.people_outline,
                        color: Colors.grey,
                        size: 20,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Good for ${eventPackage.guestCapacity} guests',
                        style: const TextStyle(color: Colors.grey),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Text(
                        '₱${eventPackage.price.toStringAsFixed(0)}',
                        style: const TextStyle(
                          color: primary,
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const Spacer(),
                      const Icon(
                        Icons.chevron_right,
                        color: Colors.grey,
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

class ProviderMenuSection extends StatelessWidget {
  final String providerId;
  final FeastaRepository repository;

  const ProviderMenuSection({
    super.key,
    required this.providerId,
    required this.repository,
  });

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return StreamBuilder<List<MenuItemModel>>(
      stream: repository.menuItemsByProvider(providerId),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const SizedBox(
            height: 340,
            child: FeastaSkeletonList(
              itemCount: 3,
              padding: EdgeInsets.all(22),
              showLeading: false,
              showTrailing: false,
            ),
          );
        }

        if (snapshot.hasError) {
          return Padding(
            padding: const EdgeInsets.all(24),
            child: Text('Error: ${snapshot.error}'),
          );
        }

        final items = snapshot.data ?? [];

        if (items.isEmpty) {
          return const Padding(
            padding: EdgeInsets.all(24),
            child: Center(
              child: Text(
                'No menu items available yet.',
                style: TextStyle(color: Colors.grey),
              ),
            ),
          );
        }

        return ListView.separated(
          padding: const EdgeInsets.all(20),
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: items.length,
          separatorBuilder: (_, __) => const SizedBox(height: 14),
          itemBuilder: (context, index) {
            final item = items[index];

            return Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: const Color(0xFFE5E7EB)),
                borderRadius: BorderRadius.circular(18),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (item.imageUrl != null && item.imageUrl!.isNotEmpty)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: Image.network(
                        item.imageUrl!,
                        width: 88,
                        height: 88,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) {
                          return Container(
                            width: 88,
                            height: 88,
                            color: Colors.grey.shade300,
                            child: const Icon(Icons.broken_image),
                          );
                        },
                      ),
                    )
                  else
                    Container(
                      width: 88,
                      height: 88,
                      decoration: BoxDecoration(
                        color: primary.withOpacity(0.10),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(
                        Icons.restaurant_menu,
                        color: primary,
                      ),
                    ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.name,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          item.category,
                          style: const TextStyle(
                            color: Colors.grey,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          item.description,
                          style: const TextStyle(
                            color: Colors.grey,
                            height: 1.3,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '₱${item.pricePerServing.toStringAsFixed(0)} per serving',
                          style: const TextStyle(
                            color: primary,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}
