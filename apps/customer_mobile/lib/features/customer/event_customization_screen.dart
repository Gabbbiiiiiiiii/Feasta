import 'package:flutter/material.dart';

import '../../shared/models/event_customization_data.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import '../../shared/widgets/loading_skeleton.dart';
import 'availability_check_screen.dart';
import 'addon_marketplace_screen.dart';

class EventCustomizationScreen extends StatefulWidget {
  final ProviderModel provider;
  final PackageModel eventPackage;

  const EventCustomizationScreen({
    super.key,
    required this.provider,
    required this.eventPackage,
  });

  @override
  State<EventCustomizationScreen> createState() =>
      _EventCustomizationScreenState();
}

class _EventCustomizationScreenState extends State<EventCustomizationScreen> {
  final FeastaRepository repository = FeastaRepository();

  final locationController = TextEditingController(text: 'Ormoc City');
  final addressController = TextEditingController();
  final specialRequestController = TextEditingController();

  bool useCateringProviderAddOns = true;
  bool useMarketplaceAddOns = false;
  bool willArrangeOwnAddOns = false;

  final customerArrangedAddOnsController = TextEditingController();

  final List<Map<String, dynamic>> selectedMarketplaceAddOns = [];

  String selectedEventType = 'Birthday';
  DateTime? selectedDate;
  TimeOfDay? selectedStartTime;
  TimeOfDay? selectedEndTime;

  late int guestCount;

  late List<String> selectedFoods;
  late List<String> selectedDecorations;
  late List<String> selectedFurniture;

  final List<Map<String, dynamic>> selectedAddOns = [];

  @override
  void initState() {
    super.initState();

    guestCount = widget.eventPackage.guestCapacity;
    selectedEventType = widget.eventPackage.eventType;

    selectedFoods = List<String>.from(widget.eventPackage.foodInclusions);
    selectedDecorations = List<String>.from(widget.eventPackage.decorInclusions);
    selectedFurniture = List<String>.from(widget.eventPackage.furnitureInclusions);
  }

  double get addOnsTotal {
    return selectedAddOns.fold<double>(
      0,
      (sum, addon) => sum + ((addon['price'] ?? 0) as num).toDouble(),
    );
  }

  double get estimatedTotal => widget.eventPackage.price + addOnsTotal;

  String _formatTime(TimeOfDay? time) {
    if (time == null) return '';
    final hour = time.hourOfPeriod == 0 ? 12 : time.hourOfPeriod;
    final minute = time.minute.toString().padLeft(2, '0');
    final period = time.period == DayPeriod.am ? 'AM' : 'PM';
    return '$hour:$minute $period';
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();

    final picked = await showDatePicker(
      context: context,
      firstDate: now,
      lastDate: DateTime(now.year + 2),
      initialDate: selectedDate ?? now,
    );

    if (picked != null) {
      setState(() {
        selectedDate = picked;
      });
    }
  }

  Future<void> _pickStartTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: selectedStartTime ?? const TimeOfDay(hour: 14, minute: 0),
    );

    if (picked != null) {
      setState(() {
        selectedStartTime = picked;
      });
    }
  }

  Future<void> _pickEndTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: selectedEndTime ?? const TimeOfDay(hour: 18, minute: 0),
    );

    if (picked != null) {
      setState(() {
        selectedEndTime = picked;
      });
    }
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

  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  void _toggleStringItem({
    required String item,
    required List<String> selectedList,
    required bool value,
  }) {
    setState(() {
      if (value) {
        selectedList.add(item);
      } else {
        selectedList.remove(item);
      }
    });
  }

  void _toggleAddon({
    required AddonModel addon,
    required bool value,
  }) {
    setState(() {
      if (value) {
        selectedAddOns.add(addon.toBookingMap());
      } else {
        selectedAddOns.removeWhere((item) => item['addonId'] == addon.id);
      }
    });
  }

  @override
  void dispose() {
    locationController.dispose();
    addressController.dispose();
    specialRequestController.dispose();
    customerArrangedAddOnsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Customize Event'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _Label('Event Type'),
          DropdownButtonFormField<String>(
            value: selectedEventType,
            decoration: const InputDecoration(),
            items: const [
              'Birthday',
              'Wedding',
              'Anniversary',
              'Reunion',
              'Corporate',
              'Baptism',
              'Graduation',
              'Other',
            ].map((type) {
              return DropdownMenuItem(
                value: type,
                child: Text(type),
              );
            }).toList(),
            onChanged: (value) {
              if (value == null) return;
              setState(() {
                selectedEventType = value;
              });
            },
          ),
          const SizedBox(height: 18),

          _Label('Event Date'),
          _PickerButton(
            text: selectedDate == null
                ? 'Select event date'
                : '${selectedDate!.month}/${selectedDate!.day}/${selectedDate!.year}',
            icon: Icons.calendar_month_outlined,
            onTap: _pickDate,
          ),
          const SizedBox(height: 18),

          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Label('Start Time'),
                    _PickerButton(
                      text: selectedStartTime == null
                          ? 'Start'
                          : _formatTime(selectedStartTime),
                      icon: Icons.access_time,
                      onTap: _pickStartTime,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Label('End Time'),
                    _PickerButton(
                      text: selectedEndTime == null
                          ? 'End'
                          : _formatTime(selectedEndTime),
                      icon: Icons.access_time,
                      onTap: _pickEndTime,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),

          _Label('Guest Count'),
          Row(
            children: [
              IconButton(
                onPressed: () {
                  if (guestCount > widget.eventPackage.minimumGuests) {
                    setState(() {
                      guestCount -= 1;
                    });
                  }
                },
                icon: const Icon(Icons.remove_circle_outline),
              ),
              Expanded(
                child: Center(
                  child: Text(
                    '$guestCount guests',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ),
              IconButton(
                onPressed: () {
                  if (guestCount < widget.eventPackage.maximumGuests) {
                    setState(() {
                      guestCount += 1;
                    });
                  }
                },
                icon: const Icon(Icons.add_circle_outline),
              ),
            ],
          ),
          Text(
            'Allowed: ${widget.eventPackage.minimumGuests} - ${widget.eventPackage.maximumGuests} guests',
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.grey),
          ),
          const SizedBox(height: 22),

          _Label('Event Location'),
          TextField(
            controller: locationController,
            decoration: const InputDecoration(
              hintText: 'Ormoc City',
            ),
          ),
          const SizedBox(height: 18),

          _Label('Event Address'),
          TextField(
            controller: addressController,
            decoration: const InputDecoration(
              hintText: 'Enter full event address',
            ),
          ),
          const SizedBox(height: 24),

          _ChecklistSection(
            title: 'Food Choices',
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
          const SizedBox(height: 24),

          _ChecklistSection(
            title: 'Decoration Options',
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
          const SizedBox(height: 24),

          _ChecklistSection(
            title: 'Tables & Chairs',
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
          const SizedBox(height: 24),

          const Text(
            'Add-ons',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 12),

          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: useCateringProviderAddOns,
            activeColor: primary,
            title: const Text(
              'Use catering provider add-ons',
              style: TextStyle(fontWeight: FontWeight.w900),
            ),
            subtitle: const Text(
              'Choose optional services offered by this catering provider.',
            ),
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
          ),

          if (useCateringProviderAddOns)
            StreamBuilder<List<AddonModel>>(
              stream: repository.addonsByProvider(widget.provider.id),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Padding(
                    padding: EdgeInsets.only(bottom: 12),
                    child: FeastaSkeletonPulse(
                      child: Column(
                        children: [
                          FeastaSkeletonBox(height: 72, radius: 14),
                          SizedBox(height: 10),
                          FeastaSkeletonBox(height: 72, radius: 14),
                        ],
                      ),
                    ),
                  );
                }

                final addons = snapshot.data ?? [];

                if (addons.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.only(bottom: 12),
                    child: Text(
                      'This catering provider has no add-ons available.',
                      style: TextStyle(color: Colors.grey),
                    ),
                  );
                }

                return Column(
                  children: addons.map((addon) {
                    final isSelected = selectedAddOns.any(
                      (item) => item['addonId'] == addon.id,
                    );

                    return CheckboxListTile(
                      value: isSelected,
                      title: Text(addon.name),
                      subtitle: Text('${addon.description}\n${addon.providerBusinessName}'),
                      secondary: Text(
                        '+₱${addon.price.toStringAsFixed(0)}',
                        style: const TextStyle(
                          color: primary,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      onChanged: (value) {
                        setState(() {
                          if (value == true) {
                            selectedAddOns.add(
                              addon.toBookingMap(source: 'catering_provider'),
                            );
                          } else {
                            selectedAddOns.removeWhere(
                              (item) => item['addonId'] == addon.id,
                            );
                          }
                        });
                      },
                    );
                  }).toList(),
                );
              },
            ),

          const Divider(height: 28),

          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: useMarketplaceAddOns,
            activeColor: primary,
            title: const Text(
              'Choose add-ons from other Feasta providers',
              style: TextStyle(fontWeight: FontWeight.w900),
            ),
            subtitle: const Text(
              'Select photo booths, hosts, photographers, lights and sounds, and more.',
            ),
            onChanged: (value) async {
              setState(() {
                useMarketplaceAddOns = value;
              });

              if (value == true) {
                final result = await Navigator.push<List<Map<String, dynamic>>>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => AddonMarketplaceScreen(
                      selectedExternalAddOns: selectedMarketplaceAddOns,
                    ),
                  ),
                );

                if (result != null) {
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
              } else {
                setState(() {
                  selectedMarketplaceAddOns.clear();

                  selectedAddOns.removeWhere(
                    (addon) => addon['source'] == 'feasta_addon_provider',
                  );
                });
              }
            },
          ),

          if (useMarketplaceAddOns)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 8, bottom: 8),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: const Color(0xFFE5E7EB)),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${selectedMarketplaceAddOns.length} marketplace add-on(s) selected',
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 8),
                  if (selectedMarketplaceAddOns.isEmpty)
                    const Text(
                      'No marketplace add-ons selected yet.',
                      style: TextStyle(color: Colors.grey),
                    )
                  else
                    ...selectedMarketplaceAddOns.map((addon) {
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                '${addon['name']} • ${addon['providerBusinessName']}',
                              ),
                            ),
                            Text(
                              '₱${((addon['price'] ?? 0) as num).toStringAsFixed(0)}',
                              style: const TextStyle(
                                color: primary,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: () async {
                      final result = await Navigator.push<List<Map<String, dynamic>>>(
                        context,
                        MaterialPageRoute(
                          builder: (_) => AddonMarketplaceScreen(
                            selectedExternalAddOns: selectedMarketplaceAddOns,
                          ),
                        ),
                      );

                      if (result != null) {
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
                    },
                    icon: const Icon(Icons.add_box_outlined),
                    label: const Text('Open Add-on Marketplace'),
                  ),
                ],
              ),
            ),

          const Divider(height: 28),

          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: willArrangeOwnAddOns,
            activeColor: primary,
            title: const Text(
              'I will arrange my own add-ons',
              style: TextStyle(fontWeight: FontWeight.w900),
            ),
            subtitle: const Text(
              'Use this if you already have your own photographer, host, decorations, or other services.',
            ),
            onChanged: (value) {
              setState(() {
                willArrangeOwnAddOns = value;

                if (!value) {
                  customerArrangedAddOnsController.clear();
                }
              });
            },
          ),

          if (willArrangeOwnAddOns) ...[
            const SizedBox(height: 10),
            TextField(
              controller: customerArrangedAddOnsController,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Describe your own add-ons',
                hintText:
                    'Example: I will provide my own photographer and sound system.',
              ),
            ),
          ],
          const SizedBox(height: 24),

          _Label('Special Request'),
          TextField(
            controller: specialRequestController,
            maxLines: 4,
            decoration: const InputDecoration(
              hintText: 'Any special request for the provider...',
            ),
          ),
          const SizedBox(height: 100),
        ],
      ),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.all(18),
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(
            top: BorderSide(color: Color(0xFFE5E7EB)),
          ),
        ),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  const Text(
                    'Estimated Total',
                    style: TextStyle(color: Colors.grey),
                  ),
                  const Spacer(),
                  Text(
                    '₱${estimatedTotal.toStringAsFixed(0)}',
                    style: const TextStyle(
                      color: primary,
                      fontSize: 24,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 56,
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _continueToAvailability,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: primary,
                    foregroundColor: Colors.white,
                  ),
                  child: const Text(
                    'Check Availability',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  final String text;

  const _Label(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(fontWeight: FontWeight.w900),
    );
  }
}

class _PickerButton extends StatelessWidget {
  final String text;
  final IconData icon;
  final VoidCallback onTap;

  const _PickerButton({
    required this.text,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: onTap,
      icon: Icon(icon),
      label: Text(text),
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(54),
      ),
    );
  }
}

class _ChecklistSection extends StatelessWidget {
  final String title;
  final List<String> items;
  final List<String> selectedItems;
  final void Function(String item, bool value) onChanged;

  const _ChecklistSection({
    required this.title,
    required this.items,
    required this.selectedItems,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 10),
        ...items.map((item) {
          return CheckboxListTile(
            value: selectedItems.contains(item),
            title: Text(item),
            onChanged: (value) {
              onChanged(item, value ?? false);
            },
          );
        }),
      ],
    );
  }
}
