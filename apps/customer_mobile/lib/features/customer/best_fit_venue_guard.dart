import '../../shared/models/customer_address_model.dart';

/// The initial Ormoc address is a map placeholder, not a chosen venue.
/// The location picker updates createdAt when its default pin is confirmed.
bool isConfirmedBestFitVenue(CustomerAddressModel address) {
  if (!address.hasCoordinates || address.fullAddress.trim().isEmpty) {
    return false;
  }

  final placeholder = CustomerAddressModel.defaultOrmoc;
  return address.id != placeholder.id ||
      address.createdAt != placeholder.createdAt;
}
