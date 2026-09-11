class EventCustomizationData {
  final String eventType;
  final DateTime eventDate;
  final String eventTime;
  final String eventEndTime;
  final int guestCount;
  final String eventLocation;
  final String eventAddress;

  final List<String> selectedFoods;
  final List<String> selectedDecorations;
  final List<String> selectedFurniture;

  final List<Map<String, dynamic>> selectedAddOns;

  final bool willArrangeOwnAddOns;
  final String customerArrangedAddOnsNote;

  final String specialRequest;

  EventCustomizationData({
    required this.eventType,
    required this.eventDate,
    required this.eventTime,
    required this.eventEndTime,
    required this.guestCount,
    required this.eventLocation,
    required this.eventAddress,
    required this.selectedFoods,
    required this.selectedDecorations,
    required this.selectedFurniture,
    required this.selectedAddOns,
    required this.willArrangeOwnAddOns,
    required this.customerArrangedAddOnsNote,
    required this.specialRequest,
  });
}