const bookingComplaintCategories = <String, String>{
  'service_quality': 'Service quality',
  'provider_conduct': 'Provider conduct',
  'booking_details': 'Booking details',
  'payment': 'Payment concern',
  'other': 'Other',
};

class BookingComplaintService {
  const BookingComplaintService({required this.id, required this.name});
  final String id;
  final String name;
}

String? validateBookingComplaint(String? category, String description) {
  if (!bookingComplaintCategories.containsKey(category)) {
    return 'Choose an issue category.';
  }
  final length = description.trim().length;
  if (length < 10 || length > 4000) {
    return 'Describe the issue in 10 to 4,000 characters.';
  }
  return null;
}
