import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_shadows.dart';
import '../../core/theme/app_sizes.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/event_customization_data.dart';
import '../../shared/models/feasta_models.dart';
import '../../shared/widgets/loading_skeleton.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'addon_marketplace_screen.dart';
import 'availability_check_screen.dart';

class EventCustomizationScreen extends StatefulWidget {
  const EventCustomizationScreen({
    required this.provider,
    required this.eventPackage,
    super.key,
  });

  final ProviderModel provider;
  final PackageModel eventPackage;

  @override
  State<EventCustomizationScreen> createState() =>
      _EventCustomizationScreenState();
}

class _EventCustomizationScreenState extends State<EventCustomizationScreen> {
  final FeastaRepository repository = FeastaRepository();

  final locationController = TextEditingController(text: 'Ormoc City');
  final addressController = TextEditingController();
  final specialRequestController = TextEditingController();
  final customerArrangedAddOnsController = TextEditingController();

  bool useCateringProviderAddOns = true;
  bool useMarketplaceAddOns = false;
  bool willArrangeOwnAddOns = false;

  final List<Map<String, dynamic>> selectedMarketplaceAddOns = [];
  final List<Map<String, dynamic>> selectedAddOns = [];

  String selectedEventType = 'Birthday';
  DateTime? selectedDate;
  TimeOfDay? selectedStartTime;
  TimeOfDay? selectedEndTime;

  late int guestCount;

  late List<String> selectedFoods;
  late List<String> selectedDecorations;
  late List<String> selectedFurniture;

  static const _eventTypes = <String>[
    'Birthday',
    'Wedding',
    'Anniversary',
    'Reunion',
    'Corporate',
    'Baptism',
    'Graduation',
    'Other',
  ];

  @override
  void initState() {
    super.initState();

    guestCount = widget.eventPackage.guestCapacity;

    final packageEventType = widget.eventPackage.eventType.trim();

    selectedEventType = _eventTypes.contains(packageEventType)
        ? packageEventType
        : 'Other';

    selectedFoods = List<String>.from(widget.eventPackage.foodInclusions);

    selectedDecorations = List<String>.from(
      widget.eventPackage.decorInclusions,
    );

    selectedFurniture = List<String>.from(
      widget.eventPackage.furnitureInclusions,
    );
  }

  @override
  void dispose() {
    locationController.dispose();
    addressController.dispose();
    specialRequestController.dispose();
    customerArrangedAddOnsController.dispose();

    super.dispose();
  }

  double get addOnsTotal {
    return selectedAddOns.fold<double>(0, (sum, addon) {
      final price = addon['price'];

      return sum + (price is num ? price.toDouble() : 0);
    });
  }

  double get estimatedTotal => widget.eventPackage.price + addOnsTotal;

  String _formatTime(TimeOfDay? time) {
    if (time == null) {
      return '';
    }

    final hour = time.hourOfPeriod == 0 ? 12 : time.hourOfPeriod;
    final minute = time.minute.toString().padLeft(2, '0');
    final period = time.period == DayPeriod.am ? 'AM' : 'PM';

    return '$hour:$minute $period';
  }

  String _formatDate(DateTime? date) {
    if (date == null) {
      return 'Select event date';
    }

    const months = <String>[
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

  Future<void> _pickDate() async {
    final now = DateTime.now();

    final initialDate =
        selectedDate != null &&
            !selectedDate!.isBefore(DateTime(now.year, now.month, now.day))
        ? selectedDate!
        : now;

    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 2),
      initialDate: initialDate,
    );

    if (!mounted || picked == null) {
      return;
    }

    setState(() {
      selectedDate = picked;
    });
  }

  Future<void> _pickStartTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: selectedStartTime ?? const TimeOfDay(hour: 14, minute: 0),
    );

    if (!mounted || picked == null) {
      return;
    }

    setState(() {
      selectedStartTime = picked;
    });
  }

  Future<void> _pickEndTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: selectedEndTime ?? const TimeOfDay(hour: 18, minute: 0),
    );

    if (!mounted || picked == null) {
      return;
    }

    setState(() {
      selectedEndTime = picked;
    });
  }

  void _decreaseGuests() {
    if (guestCount <= widget.eventPackage.minimumGuests) {
      return;
    }

    setState(() {
      guestCount--;
    });
  }

  void _increaseGuests() {
    if (guestCount >= widget.eventPackage.maximumGuests) {
      return;
    }

    setState(() {
      guestCount++;
    });
  }

  void _toggleStringItem({
    required String item,
    required List<String> selectedList,
    required bool value,
  }) {
    setState(() {
      if (value) {
        if (!selectedList.contains(item)) {
          selectedList.add(item);
        }
      } else {
        selectedList.remove(item);
      }
    });
  }

  Future<void> _openMarketplace() async {
    final result = await Navigator.push<List<Map<String, dynamic>>>(
      context,
      MaterialPageRoute(
        builder: (_) => AddonMarketplaceScreen(
          selectedExternalAddOns: selectedMarketplaceAddOns,
        ),
      ),
    );

    if (!mounted || result == null) {
      return;
    }

    setState(() {
      selectedMarketplaceAddOns
        ..clear()
        ..addAll(result);

      selectedAddOns.removeWhere(
        (addon) => addon['source'] == 'feasta_addon_provider',
      );

      selectedAddOns.addAll(selectedMarketplaceAddOns);
    });
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  void _continueToAvailability() {
    if (selectedDate == null) {
      _showMessage('Please select an event date.');
      return;
    }

    if (selectedStartTime == null) {
      _showMessage('Please select an event start time.');
      return;
    }

    if (selectedEndTime == null) {
      _showMessage('Please select an event end time.');
      return;
    }

    final startMinutes =
        selectedStartTime!.hour * 60 + selectedStartTime!.minute;
    final endMinutes = selectedEndTime!.hour * 60 + selectedEndTime!.minute;

    if (endMinutes <= startMinutes) {
      _showMessage('Event end time must be later than the start time.');
      return;
    }

    if (locationController.text.trim().isEmpty) {
      _showMessage('Please enter the event location.');
      return;
    }

    if (addressController.text.trim().isEmpty) {
      _showMessage('Please enter the event address.');
      return;
    }

    final customization = EventCustomizationData(
      eventType: selectedEventType,
      eventDate: selectedDate!,
      eventTime: _formatTime(selectedStartTime),
      eventEndTime: _formatTime(selectedEndTime),
      guestCount: guestCount,
      eventLocation: locationController.text.trim(),
      eventAddress: addressController.text.trim(),
      selectedFoods: selectedFoods,
      selectedDecorations: selectedDecorations,
      selectedFurniture: selectedFurniture,
      selectedAddOns: selectedAddOns,
      willArrangeOwnAddOns: willArrangeOwnAddOns,
      customerArrangedAddOnsNote: customerArrangedAddOnsController.text.trim(),
      specialRequest: specialRequestController.text.trim(),
    );

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => AvailabilityCheckScreen(
          provider: widget.provider,
          eventPackage: widget.eventPackage,
          customization: customization,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Text(
          'Customize Event',
          style: AppTypography.sectionTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screen,
          AppSpacing.sm,
          AppSpacing.screen,
          140,
        ),
        children: [
          _PackageSummaryCard(
            provider: widget.provider,
            eventPackage: widget.eventPackage,
          ),

          const SizedBox(height: AppSpacing.xl),

          const _SectionHeading(
            title: 'Event details',
            subtitle: 'Tell us when and where your event will happen.',
          ),

          const SizedBox(height: AppSpacing.md),

          _SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _FieldLabel(
                  icon: Icons.celebration_outlined,
                  text: 'Event type',
                ),
                const SizedBox(height: AppSpacing.sm),
                DropdownButtonFormField<String>(
                  initialValue: selectedEventType,
                  isExpanded: true,
                  decoration: _inputDecoration(hintText: 'Choose event type'),
                  items: _eventTypes
                      .map(
                        (type) => DropdownMenuItem<String>(
                          value: type,
                          child: Text(type),
                        ),
                      )
                      .toList(),
                  onChanged: (value) {
                    if (value == null) {
                      return;
                    }

                    setState(() {
                      selectedEventType = value;
                    });
                  },
                ),

                const SizedBox(height: AppSpacing.lg),

                const _FieldLabel(
                  icon: Icons.calendar_month_outlined,
                  text: 'Event date',
                ),
                const SizedBox(height: AppSpacing.sm),
                _PickerField(
                  text: _formatDate(selectedDate),
                  placeholder: selectedDate == null,
                  icon: Icons.calendar_today_outlined,
                  onTap: _pickDate,
                ),

                const SizedBox(height: AppSpacing.lg),

                LayoutBuilder(
                  builder: (context, constraints) {
                    final shouldStack = constraints.maxWidth < 320;

                    final startField = Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const _FieldLabel(
                          icon: Icons.schedule_rounded,
                          text: 'Start time',
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        _PickerField(
                          text: selectedStartTime == null
                              ? 'Select time'
                              : _formatTime(selectedStartTime),
                          placeholder: selectedStartTime == null,
                          icon: Icons.access_time_rounded,
                          onTap: _pickStartTime,
                        ),
                      ],
                    );

                    final endField = Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const _FieldLabel(
                          icon: Icons.schedule_rounded,
                          text: 'End time',
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        _PickerField(
                          text: selectedEndTime == null
                              ? 'Select time'
                              : _formatTime(selectedEndTime),
                          placeholder: selectedEndTime == null,
                          icon: Icons.access_time_rounded,
                          onTap: _pickEndTime,
                        ),
                      ],
                    );

                    if (shouldStack) {
                      return Column(
                        children: [
                          startField,
                          const SizedBox(height: AppSpacing.lg),
                          endField,
                        ],
                      );
                    }

                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: startField),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(child: endField),
                      ],
                    );
                  },
                ),
              ],
            ),
          ),

          const SizedBox(height: AppSpacing.md),

          _GuestCountCard(
            guestCount: guestCount,
            minimumGuests: widget.eventPackage.minimumGuests,
            maximumGuests: widget.eventPackage.maximumGuests,
            onDecrease: _decreaseGuests,
            onIncrease: _increaseGuests,
          ),

          const SizedBox(height: AppSpacing.md),

          _SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _FieldLabel(
                  icon: Icons.location_city_outlined,
                  text: 'Event location',
                ),
                const SizedBox(height: AppSpacing.sm),
                TextField(
                  controller: locationController,
                  textInputAction: TextInputAction.next,
                  decoration: _inputDecoration(hintText: 'Ormoc City'),
                ),

                const SizedBox(height: AppSpacing.lg),

                const _FieldLabel(
                  icon: Icons.location_on_outlined,
                  text: 'Full event address',
                ),
                const SizedBox(height: AppSpacing.sm),
                TextField(
                  controller: addressController,
                  textInputAction: TextInputAction.done,
                  decoration: _inputDecoration(
                    hintText: 'Enter the complete event address',
                  ),
                ),
              ],
            ),
          ),

          if (widget.eventPackage.foodInclusions.isNotEmpty ||
              widget.eventPackage.decorInclusions.isNotEmpty ||
              widget.eventPackage.furnitureInclusions.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xl),
            const _SectionHeading(
              title: 'Package selections',
              subtitle: 'Adjust the included options for your event.',
            ),
            const SizedBox(height: AppSpacing.md),
          ],

          _ChecklistSection(
            icon: Icons.restaurant_outlined,
            title: 'Food choices',
            items: widget.eventPackage.foodInclusions,
            selectedItems: selectedFoods,
            onChanged: (item, value) {
              _toggleStringItem(
                item: item,
                selectedList: selectedFoods,
                value: value,
              );
            },
          ),

          if (widget.eventPackage.foodInclusions.isNotEmpty &&
              widget.eventPackage.decorInclusions.isNotEmpty)
            const SizedBox(height: AppSpacing.md),

          _ChecklistSection(
            icon: Icons.auto_awesome_outlined,
            title: 'Decoration options',
            items: widget.eventPackage.decorInclusions,
            selectedItems: selectedDecorations,
            onChanged: (item, value) {
              _toggleStringItem(
                item: item,
                selectedList: selectedDecorations,
                value: value,
              );
            },
          ),

          if (widget.eventPackage.decorInclusions.isNotEmpty &&
              widget.eventPackage.furnitureInclusions.isNotEmpty)
            const SizedBox(height: AppSpacing.md),

          _ChecklistSection(
            icon: Icons.chair_outlined,
            title: 'Tables & chairs',
            items: widget.eventPackage.furnitureInclusions,
            selectedItems: selectedFurniture,
            onChanged: (item, value) {
              _toggleStringItem(
                item: item,
                selectedList: selectedFurniture,
                value: value,
              );
            },
          ),

          const SizedBox(height: AppSpacing.xl),

          const _SectionHeading(
            title: 'Add-ons',
            subtitle: 'Add optional services to complete your event.',
          ),

          const SizedBox(height: AppSpacing.md),

          _AddOnOptionCard(
            icon: Icons.storefront_outlined,
            title: 'Caterer add-ons',
            description:
                'Choose optional services offered directly by your caterer.',
            value: useCateringProviderAddOns,
            onChanged: (value) {
              setState(() {
                useCateringProviderAddOns = value;

                if (!value) {
                  selectedAddOns.removeWhere(
                    (addon) => addon['source'] == 'catering_provider',
                  );
                }
              });
            },
            child: useCateringProviderAddOns
                ? _CateringAddOns(
                    providerId: widget.provider.id,
                    repository: repository,
                    selectedAddOns: selectedAddOns,
                    onChanged: (addon, selected) {
                      setState(() {
                        if (selected) {
                          final alreadySelected = selectedAddOns.any(
                            (item) => item['addonId'] == addon.id,
                          );

                          if (!alreadySelected) {
                            selectedAddOns.add(
                              addon.toBookingMap(source: 'catering_provider'),
                            );
                          }
                        } else {
                          selectedAddOns.removeWhere(
                            (item) => item['addonId'] == addon.id,
                          );
                        }
                      });
                    },
                  )
                : null,
          ),

          const SizedBox(height: AppSpacing.md),

          _AddOnOptionCard(
            icon: Icons.grid_view_rounded,
            title: 'FEASTA add-on marketplace',
            description:
                'Find photographers, hosts, photo booths, lights and sounds, and more.',
            value: useMarketplaceAddOns,
            onChanged: (value) async {
              if (!value) {
                setState(() {
                  useMarketplaceAddOns = false;
                  selectedMarketplaceAddOns.clear();

                  selectedAddOns.removeWhere(
                    (addon) => addon['source'] == 'feasta_addon_provider',
                  );
                });

                return;
              }

              setState(() {
                useMarketplaceAddOns = true;
              });

              await _openMarketplace();
            },
            child: useMarketplaceAddOns
                ? _MarketplaceSelection(
                    addOns: selectedMarketplaceAddOns,
                    onOpenMarketplace: _openMarketplace,
                  )
                : null,
          ),

          const SizedBox(height: AppSpacing.md),

          _AddOnOptionCard(
            icon: Icons.person_outline_rounded,
            title: 'I will arrange my own add-ons',
            description:
                'Use this if you already have your own photographer, host, decorations, or other services.',
            value: willArrangeOwnAddOns,
            onChanged: (value) {
              setState(() {
                willArrangeOwnAddOns = value;

                if (!value) {
                  customerArrangedAddOnsController.clear();
                }
              });
            },
            child: willArrangeOwnAddOns
                ? TextField(
                    controller: customerArrangedAddOnsController,
                    maxLines: 4,
                    decoration: _inputDecoration(
                      hintText:
                          'Example: I will provide my own photographer and sound system.',
                    ),
                  )
                : null,
          ),

          const SizedBox(height: AppSpacing.xl),

          const _SectionHeading(
            title: 'Special request',
            subtitle:
                'Share anything else the caterer should know about your event.',
          ),

          const SizedBox(height: AppSpacing.md),

          _SectionCard(
            child: TextField(
              controller: specialRequestController,
              minLines: 4,
              maxLines: 6,
              decoration: _inputDecoration(
                hintText:
                    'Example: Please prepare a small vegetarian option for 5 guests.',
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: _CustomizationBottomBar(
        packagePrice: widget.eventPackage.price,
        addOnsTotal: addOnsTotal,
        estimatedTotal: estimatedTotal,
        onContinue: _continueToAvailability,
      ),
    );
  }
}

InputDecoration _inputDecoration({required String hintText}) {
  return InputDecoration(
    hintText: hintText,
    hintStyle: AppTypography.body.copyWith(
      color: AppColors.secondaryTextAccessible,
    ),
    filled: true,
    fillColor: AppColors.surface,
    contentPadding: const EdgeInsets.symmetric(
      horizontal: AppSpacing.md,
      vertical: AppSpacing.md,
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.large),
      borderSide: const BorderSide(color: AppColors.border),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.large),
      borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
    ),
    errorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.large),
      borderSide: const BorderSide(color: AppColors.error),
    ),
    focusedErrorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.large),
      borderSide: const BorderSide(color: AppColors.error, width: 1.5),
    ),
  );
}

class _PackageSummaryCard extends StatelessWidget {
  const _PackageSummaryCard({
    required this.provider,
    required this.eventPackage,
  });

  final ProviderModel provider;
  final PackageModel eventPackage;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.large),
            child: SizedBox(
              width: 84,
              height: 84,
              child: FeastaImage.network(
                imageUrl: eventPackage.imageUrl,
                description: '${eventPackage.name} package image',
                fallbackLabel: 'Package image unavailable',
                width: 84,
                height: 84,
                borderRadius: 0,
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  eventPackage.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.cardTitle.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  provider.businessName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                FeastaPriceText(
                  amount: eventPackage.price,
                  decimalDigits: 0,
                  style: AppTypography.label.copyWith(
                    color: AppColors.primaryStrong,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: AppTypography.sectionTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: AppSpacing.xxs),
        Text(
          subtitle,
          style: AppTypography.bodySmall.copyWith(
            color: AppColors.secondaryTextAccessible,
            height: 1.4,
          ),
        ),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: child,
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(
          icon,
          size: AppSizes.iconSmall,
          color: AppColors.secondaryTextAccessible,
        ),
        const SizedBox(width: AppSpacing.xs),
        Expanded(
          child: Text(
            text,
            style: AppTypography.label.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    );
  }
}

class _PickerField extends StatelessWidget {
  const _PickerField({
    required this.text,
    required this.placeholder,
    required this.icon,
    required this.onTap,
  });

  final String text;
  final bool placeholder;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(AppRadius.large),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.large),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.large),
            border: Border.all(color: AppColors.border),
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: AppSizes.inputHeight),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.sm,
              ),
              child: Row(
                children: [
                  Icon(
                    icon,
                    size: AppSizes.iconMedium,
                    color: AppColors.primaryStrong,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      text,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.body.copyWith(
                        color: placeholder
                            ? AppColors.secondaryTextAccessible
                            : AppColors.mainText,
                        fontWeight: placeholder
                            ? FontWeight.w500
                            : FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  const Icon(
                    Icons.chevron_right_rounded,
                    color: AppColors.secondaryTextAccessible,
                    size: AppSizes.iconMedium,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _GuestCountCard extends StatelessWidget {
  const _GuestCountCard({
    required this.guestCount,
    required this.minimumGuests,
    required this.maximumGuests,
    required this.onDecrease,
    required this.onIncrease,
  });

  final int guestCount;
  final int minimumGuests;
  final int maximumGuests;
  final VoidCallback onDecrease;
  final VoidCallback onIncrease;

  @override
  Widget build(BuildContext context) {
    final canDecrease = guestCount > minimumGuests;
    final canIncrease = guestCount < maximumGuests;

    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _FieldLabel(icon: Icons.groups_outlined, text: 'Guest count'),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              _CounterButton(
                icon: Icons.remove_rounded,
                enabled: canDecrease,
                semanticLabel: 'Decrease guest count',
                onPressed: onDecrease,
              ),
              Expanded(
                child: Column(
                  children: [
                    Text(
                      '$guestCount',
                      style: AppTypography.pageTitle.copyWith(
                        color: AppColors.mainText,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    Text(
                      'guests',
                      style: AppTypography.caption.copyWith(
                        color: AppColors.secondaryTextAccessible,
                      ),
                    ),
                  ],
                ),
              ),
              _CounterButton(
                icon: Icons.add_rounded,
                enabled: canIncrease,
                semanticLabel: 'Increase guest count',
                onPressed: onIncrease,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.xs,
              ),
              decoration: BoxDecoration(
                color: AppColors.surfaceMuted,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
              child: Text(
                '$minimumGuests–$maximumGuests guests allowed',
                style: AppTypography.caption.copyWith(
                  color: AppColors.secondaryTextAccessible,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CounterButton extends StatelessWidget {
  const _CounterButton({
    required this.icon,
    required this.enabled,
    required this.semanticLabel,
    required this.onPressed,
  });

  final IconData icon;
  final bool enabled;
  final String semanticLabel;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semanticLabel,
      enabled: enabled,
      child: Material(
        color: enabled ? AppColors.primarySubtle : AppColors.surfaceMuted,
        shape: const CircleBorder(),
        child: IconButton(
          onPressed: enabled ? onPressed : null,
          icon: Icon(icon),
          color: AppColors.primaryStrong,
          disabledColor: AppColors.secondaryTextAccessible,
        ),
      ),
    );
  }
}

class _ChecklistSection extends StatelessWidget {
  const _ChecklistSection({
    required this.icon,
    required this.title,
    required this.items,
    required this.selectedItems,
    required this.onChanged,
  });

  final IconData icon;
  final String title;
  final List<String> items;
  final List<String> selectedItems;
  final void Function(String item, bool value) onChanged;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const SizedBox.shrink();
    }

    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.primarySubtle,
                  borderRadius: BorderRadius.circular(AppRadius.medium),
                ),
                child: Icon(
                  icon,
                  color: AppColors.primaryStrong,
                  size: AppSizes.iconMedium,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  title,
                  style: AppTypography.cardTitle.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          for (var index = 0; index < items.length; index++) ...[
            _SelectionRow(
              label: items[index],
              selected: selectedItems.contains(items[index]),
              onChanged: (value) {
                onChanged(items[index], value);
              },
            ),
            if (index != items.length - 1)
              const Divider(height: AppSpacing.lg, color: AppColors.border),
          ],
        ],
      ),
    );
  }
}

class _SelectionRow extends StatelessWidget {
  const _SelectionRow({
    required this.label,
    required this.selected,
    required this.onChanged,
  });

  final String label;
  final bool selected;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(AppRadius.medium),
      onTap: () => onChanged(!selected),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: AppTypography.body.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Checkbox(
              value: selected,
              activeColor: AppColors.primary,
              onChanged: (value) {
                onChanged(value ?? false);
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _AddOnOptionCard extends StatelessWidget {
  const _AddOnOptionCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.value,
    required this.onChanged,
    this.child,
  });

  final IconData icon;
  final String title;
  final String description;
  final bool value;
  final ValueChanged<bool> onChanged;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: value
                      ? AppColors.primarySubtle
                      : AppColors.surfaceMuted,
                  borderRadius: BorderRadius.circular(AppRadius.medium),
                ),
                child: Icon(
                  icon,
                  color: value
                      ? AppColors.primaryStrong
                      : AppColors.secondaryTextAccessible,
                  size: AppSizes.iconMedium,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: AppTypography.cardTitle.copyWith(
                        color: AppColors.mainText,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      description,
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.secondaryTextAccessible,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.xs),
              Switch(
                value: value,
                activeTrackColor: AppColors.primary,
                activeThumbColor: AppColors.surface,
                onChanged: onChanged,
              ),
            ],
          ),
          if (child != null) ...[
            const SizedBox(height: AppSpacing.md),
            const Divider(height: 1, color: AppColors.border),
            const SizedBox(height: AppSpacing.md),
            Align(alignment: Alignment.centerLeft, child: child!),
          ],
        ],
      ),
    );
  }
}

class _CateringAddOns extends StatelessWidget {
  const _CateringAddOns({
    required this.providerId,
    required this.repository,
    required this.selectedAddOns,
    required this.onChanged,
  });

  final String providerId;
  final FeastaRepository repository;
  final List<Map<String, dynamic>> selectedAddOns;
  final void Function(AddonModel addon, bool selected) onChanged;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<AddonModel>>(
      stream: repository.addonsByProvider(providerId),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const FeastaSkeletonPulse(
            child: Column(
              children: [
                FeastaSkeletonBox(height: 76, radius: AppRadius.large),
                SizedBox(height: AppSpacing.sm),
                FeastaSkeletonBox(height: 76, radius: AppRadius.large),
              ],
            ),
          );
        }

        if (snapshot.hasError) {
          return Text(
            'Add-ons could not be loaded right now.',
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          );
        }

        final addons = snapshot.data ?? const <AddonModel>[];

        if (addons.isEmpty) {
          return Text(
            'This caterer has no add-ons available.',
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          );
        }

        return Column(
          children: [
            for (var index = 0; index < addons.length; index++) ...[
              _CateringAddOnRow(
                addon: addons[index],
                selected: selectedAddOns.any(
                  (item) => item['addonId'] == addons[index].id,
                ),
                onChanged: (value) {
                  onChanged(addons[index], value);
                },
              ),
              if (index != addons.length - 1)
                const Divider(height: AppSpacing.lg, color: AppColors.border),
            ],
          ],
        );
      },
    );
  }
}

class _CateringAddOnRow extends StatelessWidget {
  const _CateringAddOnRow({
    required this.addon,
    required this.selected,
    required this.onChanged,
  });

  final AddonModel addon;
  final bool selected;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(AppRadius.medium),
      onTap: () => onChanged(!selected),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Checkbox(
              value: selected,
              activeColor: AppColors.primary,
              onChanged: (value) {
                onChanged(value ?? false);
              },
            ),
            const SizedBox(width: AppSpacing.xs),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    addon.name,
                    style: AppTypography.label.copyWith(
                      color: AppColors.mainText,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  if (addon.description.trim().isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      addon.description.trim(),
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.secondaryTextAccessible,
                        height: 1.35,
                      ),
                    ),
                  ],
                  if (addon.providerBusinessName.trim().isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      addon.providerBusinessName,
                      style: AppTypography.caption.copyWith(
                        color: AppColors.secondaryTextAccessible,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '+',
                  style: AppTypography.caption.copyWith(
                    color: AppColors.primaryStrong,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                FeastaPriceText(
                  amount: addon.price,
                  decimalDigits: 0,
                  style: AppTypography.label.copyWith(
                    color: AppColors.primaryStrong,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MarketplaceSelection extends StatelessWidget {
  const _MarketplaceSelection({
    required this.addOns,
    required this.onOpenMarketplace,
  });

  final List<Map<String, dynamic>> addOns;
  final VoidCallback onOpenMarketplace;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (addOns.isEmpty)
          Text(
            'No marketplace add-ons selected yet.',
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          )
        else ...[
          Text(
            '${addOns.length} add-on${addOns.length == 1 ? '' : 's'} selected',
            style: AppTypography.label.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          for (var index = 0; index < addOns.length; index++) ...[
            _MarketplaceAddOnRow(addon: addOns[index]),
            if (index != addOns.length - 1)
              const Divider(height: AppSpacing.lg, color: AppColors.border),
          ],
        ],
        const SizedBox(height: AppSpacing.md),
        FeastaSecondaryButton(
          label: addOns.isEmpty ? 'Browse Add-ons' : 'Edit Add-ons',
          icon: const Icon(Icons.grid_view_rounded),
          onPressed: onOpenMarketplace,
        ),
      ],
    );
  }
}

class _MarketplaceAddOnRow extends StatelessWidget {
  const _MarketplaceAddOnRow({required this.addon});

  final Map<String, dynamic> addon;

  @override
  Widget build(BuildContext context) {
    final name = addon['name']?.toString() ?? 'Add-on';
    final provider = addon['providerBusinessName']?.toString() ?? '';
    final price = addon['price'];

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(
          Icons.add_circle_outline_rounded,
          color: AppColors.primaryStrong,
          size: AppSizes.iconMedium,
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: AppTypography.label.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (provider.trim().isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  provider,
                  style: AppTypography.caption.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        FeastaPriceText(
          amount: price is num ? price.toDouble() : 0,
          decimalDigits: 0,
          style: AppTypography.label.copyWith(
            color: AppColors.primaryStrong,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }
}

class _CustomizationBottomBar extends StatelessWidget {
  const _CustomizationBottomBar({
    required this.packagePrice,
    required this.addOnsTotal,
    required this.estimatedTotal,
    required this.onContinue,
  });

  final double packagePrice;
  final double addOnsTotal;
  final double estimatedTotal;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: const Border(top: BorderSide(color: AppColors.border)),
        boxShadow: AppShadows.navigation,
      ),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.sm,
        AppSpacing.screen,
        AppSpacing.md,
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Text(
                  'Estimated total',
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
                const Spacer(),
                FeastaPriceText(
                  amount: estimatedTotal,
                  decimalDigits: 0,
                  semanticLabel: 'Estimated booking total',
                  style: AppTypography.sectionTitle.copyWith(
                    color: AppColors.primaryStrong,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
            if (addOnsTotal > 0) ...[
              const SizedBox(height: AppSpacing.xxs),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Package + selected add-ons',
                      style: AppTypography.caption.copyWith(
                        color: AppColors.secondaryTextAccessible,
                      ),
                    ),
                  ),
                  FeastaPriceText(
                    amount: addOnsTotal,
                    decimalDigits: 0,
                    semanticLabel: 'Selected add-ons total',
                    style: AppTypography.caption.copyWith(
                      color: AppColors.secondaryTextAccessible,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: AppSpacing.sm),
            FeastaPrimaryButton(
              label: 'Check Availability',
              icon: const Icon(Icons.calendar_month_rounded),
              onPressed: onContinue,
            ),
          ],
        ),
      ),
    );
  }
}
