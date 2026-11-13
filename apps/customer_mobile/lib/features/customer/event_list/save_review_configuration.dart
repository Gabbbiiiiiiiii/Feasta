import 'package:flutter/material.dart';
import '../../../core/helpers/booking_preparation.dart';
import '../../../shared/models/booking_contract.dart' show bookingTime;
import '../../../shared/models/customer_event_list.dart';
import '../../../shared/models/event_customization_data.dart';
import '../../../shared/models/feasta_models.dart';
import '../../../shared/models/food_choice_v2.dart';
import 'event_list_controller.dart';
import 'event_list_scope.dart';
import 'event_list_store.dart';
import 'customer_event_list_screen.dart';
import '../../../app/router/customer_auth_navigation.dart';

/// Projects editable planning fields only; never prepares a booking request.
CustomerEventListEntry reviewEventListEntry({
  required ProviderModel provider,
  required PackageModel package,
  required EventCustomizationData data,
}) {
  final start = bookingTime(data.eventTime),
      end = bookingTime(data.eventEndTime);
  int minutes(String time) =>
      int.parse(time.substring(0, 2)) * 60 + int.parse(time.substring(3));
  final error = validatePreparation(
    package: package,
    providerId: provider.id,
    date: data.eventDate,
    startMinutes: minutes(start),
    endMinutes: minutes(end),
    guests: data.guestCount,
    city: data.eventLocation,
    address: data.eventAddress,
    foods: data.selectedFoods,
    decorations: data.selectedDecorations,
    furniture: data.selectedFurniture,
    serviceTier: data.serviceTier,
    themeId: data.packageThemeId,
  );
  if (error != null) throw FormatException(error);
  if (data.sharedContractVersion != package.sharedContractVersion ||
      (data.expectedPackageRevision != null &&
          data.expectedPackageRevision != package.revision) ||
      (package.sharedContractVersion == 2 &&
          data.expectedPackageRevision == null) ||
      !validFoodChoiceSelections(
        package.foodChoiceGroups,
        data.foodChoiceSelections,
      )) {
    throw const FormatException(
      'Package options changed. Return to customization and review your selections.',
    );
  }
  final date = data.eventDate;
  final configuration = CustomerEventListConfiguration.fromJson({
    'event': {
      'eventType': data.eventType,
      'eventDate':
          '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}',
      'eventTime': start,
      'eventEndTime': end,
      'guestCount': data.guestCount,
      'eventLocation': data.eventLocation,
      'eventAddress': data.eventAddress,
      'specialRequest': data.specialRequest,
    },
    'sharedContractVersion': data.sharedContractVersion,
    'expectedPackageRevision': data.expectedPackageRevision ?? package.revision,
    'serviceTier': data.serviceTier,
    'packageThemeId': data.packageThemeId,
    'themeChoice': data.themeChoice,
    'customTheme': data.customTheme,
    'foodChoiceSelections': data.foodChoiceSelections,
    'selectedFoods': data.selectedFoods,
    'selectedDecorations': data.selectedDecorations,
    'selectedFurniture': data.selectedFurniture,
    'selectedAddOns': data.selectedAddOns
        .map(
          (addon) => {
            'addonId': addon['addonId'],
            'providerId': addon['providerId'],
            'source': addon['source'],
            'name': addon['name'],
            'providerBusinessName': addon['providerBusinessName'],
            'providerType': addon['providerType'],
            'category': addon['category'],
            'price': addon['price'],
          },
        )
        .toList(),
    'willArrangeOwnAddOns': data.willArrangeOwnAddOns,
    'customerArrangedAddOnsNote': data.customerArrangedAddOnsNote,
    'estimatedTotal': preparationEstimate(
      package,
      data.selectedAddOns,
      serviceTier: data.serviceTier,
      guests: data.guestCount,
    ),
    'pricingContext': {
      'currency': 'PHP',
      'pricingModel': package.pricingModel,
      'displayedServicePrice': preparationBasePrice(
        package,
        serviceTier: data.serviceTier,
      ),
    },
  });
  final rawImage = package.imageUrl;
  final uri = rawImage == null ? null : Uri.tryParse(rawImage);
  final image =
      uri != null &&
          uri.scheme == 'https' &&
          uri.host.isNotEmpty &&
          uri.userInfo.isEmpty &&
          !uri.hasFragment &&
          rawImage!.length <= 2048 &&
          !RegExp(r'[\s\x00-\x1f\x7f]').hasMatch(rawImage)
      ? rawImage
      : null;
  return CustomerEventListEntry(
    providerId: provider.id,
    packageId: package.id,
    providerName: provider.businessName,
    packageName: package.name,
    estimatedPrice: knownPreparationPrice(package.price) ? package.price : null,
    imageUrl: image,
    configuration: configuration,
  );
}

class SaveReviewConfiguration extends StatefulWidget {
  const SaveReviewConfiguration({
    required this.provider,
    required this.package,
    required this.data,
    required this.isAuthorized,
    this.submitting = false,
    this.editingIdentity,
    super.key,
  });
  final ProviderModel provider;
  final PackageModel package;
  final EventCustomizationData data;
  final bool Function() isAuthorized;
  final bool submitting;
  final EventListIdentity? editingIdentity;
  @override
  State<SaveReviewConfiguration> createState() =>
      _SaveReviewConfigurationState();
}

class _SaveReviewConfigurationState extends State<SaveReviewConfiguration> {
  EventListController? _controller;
  EventListAuthSession? _session;
  bool _busy = false, _saved = false;
  String? _message;
  int? _revision;
  bool _removed = false;
  bool _seenExisting = false;
  bool _loading = false;
  bool _stale = false;
  bool _scopeChanged = false;

  String get _key =>
      EventListIdentity.package(widget.provider.id, widget.package.id).key;
  bool get _exists =>
      _controller?.list?.entries.any((e) => e.identity.key == _key) ?? false;
  bool get _duplicate => widget.editingIdentity == null && _exists;

  Future<void> _load() async {
    if (_loading || !_current || _session?.customerUid == null) return;
    setState(() => _loading = true);
    await _controller!.load();
    if (mounted) setState(() => _loading = false);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final scoped = EventListScope.maybeOf(context);
    if (_controller != null && !identical(_controller, scoped)) {
      _scopeChanged = true;
    }
    if (_controller == null) {
      _controller = scoped;
      _session = _controller?.authentication.session;
      Future.microtask(() {
        if (mounted) _load();
      });
    }
  }

  bool get _current =>
      mounted &&
      !_scopeChanged &&
      widget.isAuthorized() &&
      _controller != null &&
      _controller!.authentication.session == _session;

  Future<void> _save() async {
    if (_busy ||
        _saved ||
        _duplicate ||
        _removed ||
        _stale ||
        _loading ||
        widget.submitting ||
        _session?.customerUid == null) {
      return;
    }
    if (!_current) {
      setState(
        () =>
            _message = 'Your session changed. Reopen this plan before saving.',
      );
      return;
    }
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final list = _controller!.list;
      if (list == null || _controller!.error != null || _revision == null) {
        return;
      }
      final entry = reviewEventListEntry(
        provider: widget.provider,
        package: widget.package,
        data: widget.data,
      );
      final result = await _controller!.saveConfiguration(
        entry,
        expectedRevision: _revision!,
        editingIdentity: widget.editingIdentity,
        isCurrent: () => _current,
      );
      if (!_current) return;
      setState(() {
        _saved = result == EventListResult.saved;
        _stale = _controller!.error is EventListStaleException;
        _message = _saved
            ? 'Saved to Event List. Configured — revalidation required. Nothing is reserved.'
            : _controller!.error is EventListStaleException
            ? 'Your Event List changed. Return to Event List and reopen this configuration.'
            : eventListMessage(result);
      });
    } on FormatException catch (error) {
      if (_current) {
        setState(
          () =>
              _message = 'Could not save this configuration. ${error.message}',
        );
      }
    } catch (_) {
      if (_current) {
        setState(
          () => _message =
              'Could not verify your Event List in secure storage. Please retry.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller == null) {
      return const Text('Event List unavailable. Please reopen the app.');
    }
    return AnimatedBuilder(
      animation: Listenable.merge([controller, controller.authentication]),
      builder: (context, _) {
        final ready =
            _current &&
            _session?.customerUid != null &&
            controller.list != null &&
            controller.error == null &&
            !_loading;
        if (ready) {
          _revision ??= controller.list!.revision;
          if ((widget.editingIdentity != null || _saved || _seenExisting) &&
              !_exists) {
            _removed = true;
          }
          if (_exists) _seenExisting = true;
          if (widget.editingIdentity != null &&
              widget.editingIdentity!.key != _key) {
            _removed = true;
          }
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            OutlinedButton.icon(
              onPressed:
                  _busy ||
                      _saved ||
                      _duplicate ||
                      _removed ||
                      _stale ||
                      widget.submitting ||
                      !ready
                  ? null
                  : _save,
              icon: const Icon(Icons.playlist_add),
              label: Text(
                _busy
                    ? 'Adding...'
                    : _saved || _duplicate
                    ? 'Already in Event List'
                    : widget.editingIdentity != null
                    ? 'Update Event List'
                    : 'Add to Event List',
              ),
            ),
            if (ready && !_removed && !_stale && widget.editingIdentity == null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  alignment: WrapAlignment.center,
                  spacing: 3,
                  children: [
                    const Text('Want to add more services?'),
                    TextButton(
                      style: TextButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      onPressed: () async {
                        await returnToCustomerRoot(Navigator.of(context));
                      },
                      child: const Text('browse more providers.'),
                    ),
                  ],
                ),
              ),
            if (!_current)
              const Text(
                'Your session changed. Reopen this plan before saving.',
              ),
            if (_current && _session?.customerUid == null)
              const Text(
                'Sign in with a customer account to add to Event List.',
              ),
            if (_removed)
              const Text(
                'This entry was removed. Return to Event List and choose a current entry.',
              ),
            if ((_removed || _stale) && _current)
              TextButton(
                onPressed: () => Navigator.of(context).push<void>(
                  MaterialPageRoute(
                    builder: (_) => const CustomerEventListScreen(),
                  ),
                ),
                child: const Text('Return to Event List'),
              ),
            if (_current &&
                _session?.customerUid != null &&
                !ready &&
                !_loading)
              TextButton(
                onPressed: _load,
                child: const Text('Retry loading Event List'),
              ),
            if (_message != null && _current && !_saved)
              Semantics(liveRegion: true, child: Text(_message!)),
          ],
        );
      },
    );
  }
}
