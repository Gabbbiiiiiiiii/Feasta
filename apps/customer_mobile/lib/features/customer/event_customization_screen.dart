import 'booking_agreement_controller.dart';
import 'event_list/event_list_scope.dart';
import 'event_list/shared_event_details.dart';
import 'booking_refund_policy_controller.dart';
import 'booking_submission_deadline_notice.dart';
import '../../shared/models/food_choice_v2.dart';
import '../../shared/models/customer_event_list.dart';
import 'dart:async';
import 'dart:convert';
import '../../app/router/customer_auth_navigation.dart';
import 'customization_session.dart';
import 'event_draft_persistence.dart';
import '../../shared/models/booking_contract.dart';
import 'location_picker_screen.dart';
import 'widgets/preparation_availability.dart';
import 'widgets/provider_calendar.dart';
import '../../shared/models/provider_calendar_month.dart';
import 'widgets/package_option_cards.dart';
import 'package:flutter/material.dart';
import '../../shared/widgets/loading_skeleton.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_shadows.dart';
import '../../core/theme/app_sizes.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/event_customization_data.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'booking_summary_screen.dart';
import '../../shared/models/customer_availability.dart';
import 'widgets/booking_preparation_price.dart';
import 'manual_address_screen.dart';
import '../../shared/models/customer_address_model.dart';
import '../../core/helpers/booking_preparation.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// Both entry points use this route so imperative pop also awaits durable save.
/// Route removal/replacement (for example a root authentication reset) is not
/// an intentional customer Back operation and must not prolong authorization.
class EventCustomizationRoute extends MaterialPageRoute<void> {
  EventCustomizationRoute({required super.builder, this.origin});
  final Route<dynamic>? origin;
  bool Function()? permitPop;
  VoidCallback? requestExit;

  @override
  bool didPop(void result) {
    if (permitPop?.call() == false) {
      scheduleMicrotask(() => requestExit?.call());
      return false;
    }
    return super.didPop(result);
  }
}

class EventCustomizationScreen extends StatefulWidget {
  const EventCustomizationScreen({
    required this.provider,
    required this.eventPackage,
    this.repository,
    this.draftPersistence,
    this.session,
    this.initialServiceTier,
    this.onServiceChanged,
    this.initialConfiguration,
    super.key,
  });

  final EventDraftPersistence? draftPersistence;
  final CustomerEventListConfiguration? initialConfiguration;
  final CustomizationSession? session;

  final ValueChanged<String>? onServiceChanged;
  final String? initialServiceTier;
  final FeastaRepository? repository;
  final ProviderModel provider;
  final PackageModel eventPackage;

  @override
  State<EventCustomizationScreen> createState() =>
      _EventCustomizationScreenState();
}

class _EventCustomizationScreenState extends State<EventCustomizationScreen>
    with WidgetsBindingObserver {
  late final EventDraftPersistence _editDrafts = EventDraftPersistence(
    (widget.draftPersistence ?? eventDraftPersistence).store,
    context: 'event-list',
  );
  EventDraftPersistence get _drafts => widget.initialConfiguration == null
      ? widget.draftPersistence ?? eventDraftPersistence
      : _editDrafts;
  bool get _guestPlanning => _entrySession?.isGuest == true;
  bool _restoredNeedsReview = false;
  final List<String> _restoredProblems = [];
  final Set<String> _unavailableRestoredAddons = {};
  String? get _draftStorageOwner =>
      _draftOwner ?? (_guestPlanning ? 'feasta_guest_device_v1' : null);
  Timer? _draftTimer;
  StreamSubscription<User?>? _draftAuth;
  bool _draftReady = false;
  String? _freshSharedSnapshot;
  bool _sharedDetailsDismissed = false;
  bool _draftDirty = false;
  String? _savedSnapshot;
  Future<bool>? _pendingSave;
  String? _pendingSnapshot;
  bool _exiting = false;
  Future<bool>? _exitPreparation;
  bool _singleExitPending = false;
  bool _exitDialogOpen = false;
  CustomerNavigationExitGuard? _navigationGuard;
  bool _draftSaveFailed = false;
  bool _allowExit = false;
  String get _snapshotIdentity =>
      jsonEncode(EventDraftPersistence.encode(_formSnapshot));
  bool _draftBlocked = false;
  bool _deletingDraft = false;
  bool _discardDialogOpen = false;
  int _draftActionEpoch = 0;

  late final CustomizationSession? _entrySession = widget.session;
  bool _entryClosed = false;
  bool get _entryAuthorized =>
      !_entryClosed && (_entrySession?.authorized ?? true);
  bool get _canPublish =>
      mounted && _entryAuthorized && (_exitRoute?.isActive ?? true);
  void _sessionChanged() {
    if (!_entryAuthorized && mounted) {
      _entryClosed = true;
      _draftTimer?.cancel();
      _draftActionEpoch++;
      _navigationGuard?.authorizationChanged();
      // Revocation above is synchronous. Parent-route disposal can notify while
      // the framework tree is locked, so publish the closed UI after that work.
      scheduleMicrotask(() {
        if (mounted) super.setState(() {});
      });
    }
  }

  bool get _canEditDraft =>
      _entryAuthorized &&
      (_exitRoute?.isActive ?? true) &&
      _draftReady &&
      !_draftBlocked &&
      !_deletingDraft &&
      FirebaseAuth.instance.currentUser?.uid == _draftOwner;
  bool _canFinishAction(int epoch) =>
      mounted && _canEditDraft && epoch == _draftActionEpoch;
  bool _applyingDraft = false;
  String? _draftMessage;

  @override
  void setState(VoidCallback fn) {
    if (!_canPublish || (_deletingDraft && !_applyingDraft)) return;
    super.setState(fn);
    if (_draftReady && !_applyingDraft) _scheduleDraft();
  }

  void _scheduleDraft() {
    if (!_canEditDraft || _applyingDraft) return;
    _allowExit = false;
    _draftDirty = _snapshotIdentity != _savedSnapshot;
    // Refresh PopScope immediately when text controllers change.
    if (mounted) super.setState(() {});
    _draftTimer?.cancel();
    _draftTimer = Timer(const Duration(milliseconds: 350), _saveDraft);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) _saveDraft();
  }

  late final FeastaRepository repository;
  // Preserve reviews across edits; existing signatures invalidate changed terms.
  late final _reviewAgreements = BookingAgreementController(
    loader: FeastaRepository().getBookingPaymentAgreementDisclosures,
    resolveProviders: FeastaRepository().resolveBookingAgreementProviders,
  );
  late final _reviewRefunds = BookingRefundPolicyController(
    loader: FeastaRepository().getBookingRefundPolicyDisclosures,
    resolveProviders: FeastaRepository().resolveBookingAgreementProviders,
  );
  late PackageModel _eventPackage;
  String? _draftOwner;
  String? selectedServiceTier;
  String? selectedThemeId;
  String? themeChoice;
  final customThemeController = TextEditingController();
  bool _checking = false;
  int _step = 0;
  final _scrollController = ScrollController();

  String? get _submissionDeadlineNotice =>
      bookingSubmissionDeadlineNoticeMobile(
        eventDate: selectedDate,
        startMinutes: selectedStartTime == null
            ? null
            : selectedStartTime!.hour * 60 + selectedStartTime!.minute,
      );

  Future<void> _goToStep(int step) async {
    if (!_canEditDraft) return;
    if (step > _step) {
      final warning = _submissionDeadlineNotice;

      if (warning != null) {
        _showMessage(warning);
        return;
      }

      if (!await _verifyCalendarDate()) return;

      if (!_canEditDraft) return;

      final refreshedWarning = _submissionDeadlineNotice;

      if (refreshedWarning != null) {
        _showMessage(refreshedWarning);
        return;
      }
    }
    if (!mounted || !_canEditDraft) return;
    FocusScope.of(context).unfocus();
    _saveDraft();
    setState(() => _step = step);
    if (_scrollController.hasClients) _scrollController.jumpTo(0);
  }

  CustomerAddressModel? _eventAddress;
  final locationController = TextEditingController(text: 'Ormoc City');
  final addressController = TextEditingController();
  final guestCountController = TextEditingController();
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

  List<Map<String, dynamic>> foodChoiceSelections = [];
  late List<String> selectedFoods;
  late List<String> selectedDecorations;
  late List<String> selectedFurniture;

  List<String> get _eventTypes {
    if (_eventPackage.sharedContractVersion == 2) {
      return _eventPackage.occasionMatchIds;
    }
    final type = _eventPackage.eventType.trim();
    if (type.isNotEmpty) return [type];
    // The package contract currently publishes one scalar eventType. Provider
    // categories do not establish this package's eligibility.
    return const [];
  }

  EventCustomizationRoute? _exitRoute;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (route is EventCustomizationRoute) {
      _exitRoute = route;
      route.permitPop = () => _allowExit || !_entryAuthorized;
      route.requestExit = _requestExit;
      _navigationGuard ??= CustomerNavigationExitGuard(
        route: route,
        authorized: () => _entryAuthorized,
        canRemove: () => route.permitPop?.call() ?? false,
        prepare: _prepareExit,
        parentIsActive: () => route.origin?.isActive ?? true,
      );
    }
  }

  @override
  void initState() {
    super.initState();
    _eventPackage = widget.eventPackage;

    repository = widget.repository ?? FeastaRepository();
    _draftOwner = _guestPlanning
        ? null
        : _entrySession?.uid ?? FirebaseAuth.instance.currentUser?.uid;
    _entrySession?.addListener(_sessionChanged);
    guestCount = _eventPackage.guestCapacity > 0
        ? _eventPackage.guestCapacity
        : preparationMinimumGuests(_eventPackage);

    final packageEventType = _eventPackage.eventType.trim();

    selectedEventType = _eventTypes.contains(packageEventType)
        ? packageEventType
        : (_eventTypes.isEmpty ? '' : _eventTypes.first);

    if (preparationServices(
      _eventPackage,
    ).containsKey(widget.initialServiceTier)) {
      selectedServiceTier = widget.initialServiceTier;
      if (selectedServiceTier == 'drop_off') {
        selectedThemeId = null;
        themeChoice = null;
        customThemeController.clear();
      }
    }
    selectedFoods = List<String>.from(_eventPackage.foodInclusions);

    selectedDecorations = List<String>.from(
      preparationInclusions(
        _eventPackage,
        'decorInclusions',
        selectedServiceTier,
      ),
    );

    selectedFurniture = List<String>.from(
      preparationInclusions(
        _eventPackage,
        'furnitureInclusions',
        selectedServiceTier,
      ),
    );
    _step = 0;
    guestCountController.text = '$guestCount';
    WidgetsBinding.instance.addObserver(this);
    _draftAuth = FirebaseAuth.instance.authStateChanges().listen((user) {
      if (user?.uid != _draftOwner && mounted && _entryAuthorized) {
        _draftTimer?.cancel();
        _draftActionEpoch++;
        _applyingDraft = true;
        setState(() {
          _draftBlocked = true;
          _draftReady = true;
        });
        _applyingDraft = false;
      }
    });
    for (final controller in [
      locationController,
      addressController,
      guestCountController,
      specialRequestController,
      customerArrangedAddOnsController,
      customThemeController,
    ]) {
      controller.addListener(_scheduleDraft);
    }
    unawaited(_restoreDraft());
  }

  Map<String, dynamic> get _formSnapshot => {
    'step': _step,
    'date': selectedDate,
    'start': selectedStartTime,
    'end': selectedEndTime,
    'type': selectedEventType,
    'guests': guestCount,
    'city': locationController.text,
    'address': addressController.text,
    'eventAddress': _eventAddress,
    'notes': specialRequestController.text,
    'ownNotes': customerArrangedAddOnsController.text,
    if (foodChoiceSelections.isNotEmpty)
      'foodChoiceSelections': parseFoodChoiceSelections(foodChoiceSelections),
    'foods': List<String>.of(selectedFoods),
    'decorations': List<String>.of(selectedDecorations),
    'furniture': List<String>.of(selectedFurniture),
    'addons': selectedAddOns
        .map((item) => Map<String, dynamic>.from(item))
        .toList(),
    'own': willArrangeOwnAddOns,
    'useCatering': useCateringProviderAddOns,
    'useMarketplace': useMarketplaceAddOns,
    'tier': selectedServiceTier,
    'theme': selectedThemeId,
    'themeChoice': themeChoice,
    'customTheme': customThemeController.text,
  };
  void _chooseTheme(String? choice) {
    if (choice != null && choice == themeChoice) return;
    setState(() {
      themeChoice = choice;
      selectedThemeId = null;
      customThemeController.clear();
    });
    _saveDraft();
  }

  void _saveDraft() {
    unawaited(_persistDraft());
  }

  Future<bool> _persistDraft() async {
    _draftTimer?.cancel();
    final owner = _draftStorageOwner;
    if (!_entryAuthorized ||
        _draftBlocked ||
        _deletingDraft ||
        !_draftReady ||
        owner == null ||
        FirebaseAuth.instance.currentUser?.uid != _draftOwner) {
      return false;
    }
    final snapshot = _formSnapshot;
    final identity = jsonEncode(EventDraftPersistence.encode(snapshot));
    if (identity == _savedSnapshot) {
      // An older queued snapshot must finish before deciding the latest is safe.
      if (_pendingSave != null) {
        await _pendingSave;
        return _persistDraft();
      }
      _draftDirty = false;
      return true;
    }
    if (_pendingSnapshot == identity) return _pendingSave!;
    final operation = _drafts
        .save(
          owner,
          widget.provider.id,
          _eventPackage.id,
          snapshot,
          () =>
              _entryAuthorized &&
                  FirebaseAuth.instance.currentUser?.uid == _draftOwner
              ? _draftStorageOwner
              : null,
          authorize: () => _entryAuthorized,
        )
        .then(
          (saved) {
            if (!saved) return false;
            _savedSnapshot = identity;
            if (_canPublish) {
              super.setState(() {
                _draftDirty = _snapshotIdentity != identity;
                if (_draftSaveFailed) _draftMessage = null;
                _draftSaveFailed = false;
              });
            }
            return true;
          },
          onError: (Object error, StackTrace stack) {
            if (_canPublish &&
                FirebaseAuth.instance.currentUser?.uid == owner) {
              super.setState(() {
                _draftSaveFailed = true;
                _draftMessage =
                    'Draft could not be saved. Your details are still here. Retry saving before leaving.';
              });
            }
            return false;
          },
        );
    _pendingSnapshot = identity;
    _pendingSave = operation;
    final success = await operation;
    if (identical(_pendingSave, operation)) {
      _pendingSave = null;
      _pendingSnapshot = null;
    }
    return success;
  }

  Future<bool> _prepareExit() => _exitPreparation ??= _prepareExitSnapshot()
      .whenComplete(() => _exitPreparation = null);

  Future<bool> _prepareExitSnapshot() async {
    if (_deletingDraft || !_entryAuthorized) return false;
    if (!_draftDirty && _pendingSave == null) {
      if (!_canEditDraft) return false;
      super.setState(() => _allowExit = true);
      return true;
    }
    _draftActionEpoch++;
    super.setState(() {
      _checking = false;
      _exiting = true;
    });
    var saved = await _persistDraft();
    // Edits can arrive while an earlier secure write is in flight.
    while (saved && _canPublish && _draftDirty) {
      saved = await _persistDraft();
    }
    if (!mounted) return false;
    super.setState(() => _exiting = false);
    if (!saved || !_entryAuthorized) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _scrollController.hasClients) {
          _scrollController.jumpTo(0);
        }
      });
      return false;
    }
    super.setState(() => _allowExit = true);
    return true;
  }

  Future<void> _requestExit() async {
    if (_singleExitPending ||
        _exitDialogOpen ||
        _exiting ||
        _deletingDraft ||
        !mounted) {
      return;
    }
    final route = ModalRoute.of(context);
    if (!(route?.isCurrent ?? false)) return;
    if (!_entryAuthorized) {
      Navigator.of(context).pop();
      return;
    }
    if (!_draftReady || FirebaseAuth.instance.currentUser?.uid != _draftOwner) {
      return;
    }
    _exitDialogOpen = true;
    FocusScope.of(context).unfocus();
    final epoch = _draftActionEpoch;
    String? choice;
    try {
      choice = await showDialog<String>(
        context: context,
        builder: (dialogContext) => CustomizationSessionBoundary(
          session: _entrySession,
          builder: (context) => AlertDialog(
            backgroundColor: AppColors.surface,
            surfaceTintColor: Colors.transparent,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(24),
            ),
            insetPadding: const EdgeInsets.all(AppSpacing.screen),
            title: const Text(
              'Leave this customization?',
              style: AppTypography.sectionTitle,
            ),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    "Your changes are saved automatically. We'll verify the latest draft before leaving so you can continue where you left off.",
                    style: AppTypography.body,
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: AppColors.primaryForeground,
                      textStyle: AppTypography.button,
                      minimumSize: const Size(0, 48),
                    ),
                    onPressed: () => Navigator.pop(dialogContext, 'leave'),
                    child: const Text(
                      'Leave customization',
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.primary,
                      textStyle: AppTypography.button,
                      minimumSize: const Size(0, 48),
                      side: const BorderSide(color: AppColors.borderStrong),
                    ),
                    onPressed: () => Navigator.pop(dialogContext, 'discard'),
                    child: const Text(
                      'Discard saved draft',
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    autofocus: true,
                    onPressed: () => Navigator.pop(dialogContext),
                    child: const Text('Continue editing'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    } finally {
      _exitDialogOpen = false;
    }
    if (choice == null ||
        !_canPublish ||
        epoch != _draftActionEpoch ||
        FirebaseAuth.instance.currentUser?.uid != _draftOwner ||
        !(route?.isCurrent ?? false)) {
      return;
    }
    if (choice == 'discard') {
      await _discardDraft(confirmedExit: true);
      return;
    }
    _singleExitPending = true;
    try {
      final retry = _navigationGuard?.retry;
      if (retry != null) {
        await retry();
        return;
      }
      final saved = await _prepareExit();
      if (!saved || !_canPublish) return;
      await WidgetsBinding.instance.endOfFrame;
      if (mounted && _canPublish && (route?.isCurrent ?? false) && _allowExit) {
        await Navigator.of(context).maybePop();
      }
    } finally {
      _singleExitPending = false;
    }
  }

  Future<void> _restoreDraft() async {
    if (widget.initialConfiguration != null) {
      await _restoreEventListConfiguration(widget.initialConfiguration!);
      return;
    }
    if (!_entryAuthorized) return;
    final owner = _draftOwner;
    if (owner == null) {
      setState(() => _draftReady = true);
      return;
    }
    try {
      final saved = await _drafts.read(
        owner,
        widget.provider.id,
        _eventPackage.id,
      );
      if (!_canPublish || FirebaseAuth.instance.currentUser?.uid != owner) {
        return;
      }
      if (saved == null) _freshSharedSnapshot = _snapshotIdentity;
      if (saved != null) {
        final fresh = await repository.getEligiblePackageForPreparation(
          widget.provider.id,
          _eventPackage.id,
        );
        if (!_canPublish || FirebaseAuth.instance.currentUser?.uid != owner) {
          return;
        }
        if (fresh == null ||
            fresh.id != _eventPackage.id ||
            !eligiblePreparationPackage(fresh, widget.provider.id)) {
          throw StateError('Package unavailable');
        }
        _eventPackage = fresh;
        final refreshed = <Map<String, dynamic>>[];
        for (final item in saved['addons'] as List) {
          final current = await repository.getEligiblePreparationAddon(
            item['addonId'] as String,
          );
          if (!_canPublish || FirebaseAuth.instance.currentUser?.uid != owner) {
            return;
          }
          if (current != null &&
              current.id == item['addonId'] &&
              current.providerId == item['providerId'] &&
              (item['source'] != 'catering_provider' ||
                  current.providerId == widget.provider.id)) {
            refreshed.add(
              current.toBookingMap(source: item['source'] as String),
            );
          }
        }
        saved['addons'] = refreshed;
        _applyDraft(saved);
        if (_stepValidation() != null) _step = 0;
        guestCountController.text = '$guestCount';
        _draftMessage =
            'Unfinished draft recovered. Review the current package, add-ons and prices before continuing. Unavailable selections were removed. Nothing has been submitted.';
      }
    } catch (_) {
      if (!_canPublish || FirebaseAuth.instance.currentUser?.uid != owner) {
        return;
      }
      _draftBlocked = true;
      _draftMessage =
          'Saved draft could not be safely recovered. It has been kept unchanged. Reopen to retry, or discard it to start again.';
    }
    if (!_canPublish || FirebaseAuth.instance.currentUser?.uid != owner) {
      return;
    }
    _savedSnapshot = _snapshotIdentity;
    _draftDirty = false;
    _applyingDraft = true;
    setState(() => _draftReady = true);
    _applyingDraft = false;
  }

  Widget _sharedEventOffer() {
    final controller = EventListScope.maybeOf(context);
    if (controller == null ||
        _draftOwner == null ||
        !_canEditDraft ||
        _sharedDetailsDismissed ||
        _freshSharedSnapshot != _snapshotIdentity ||
        controller.authentication.session.customerUid != _draftOwner ||
        controller.list?.ownerUid != _draftOwner) {
      return const SizedBox.shrink();
    }
    final entries = controller.list!.entries;
    if (entries.any(
      (e) =>
          e.providerId == widget.provider.id &&
          e.packageId == _eventPackage.id &&
          e.configuration != null,
    )) {
      return const SizedBox.shrink();
    }
    final candidates = sharedEventCandidates(entries, widget.provider.id);
    if (candidates.isEmpty) return const SizedBox.shrink();
    final session = controller.authentication.session;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          candidates.length > 1
              ? 'Saved event details conflict. Choose the event plan to reuse, or enter new details.'
              : 'Reuse your saved event details for this provider?',
        ),
        const Text(
          'All details stay editable. Check availability for this provider. Unsupported values need your input.',
        ),
        for (final entry in candidates)
          TextButton(
            onPressed: () async {
              if (!mounted ||
                  !_canEditDraft ||
                  controller.authentication.session != session ||
                  controller.list?.ownerUid != _draftOwner) {
                return;
              }
              final current =
                  sharedEventCandidates(
                    controller.list!.entries,
                    widget.provider.id,
                  ).where(
                    (e) =>
                        jsonEncode(
                          sharedEventDetails(e.configuration!.event),
                        ) ==
                        jsonEncode(
                          sharedEventDetails(entry.configuration!.event),
                        ),
                  );
              if (current.isEmpty) return;
              final values = compatibleSharedEvent(
                current.first.configuration!.event,
                eventTypes: _eventTypes,
                minimum: preparationMinimumGuests(_eventPackage),
                maximum: preparationMaximumGuests(_eventPackage),
                now: DateTime.now(),
              );
              final snapshot = _snapshotIdentity;
              if (values['eventDate'] != null) {
                try {
                  final date = DateTime.parse(values['eventDate'] as String);
                  final month = await repository.getProviderCalendarMonth(
                    widget.provider.id,
                    calendarDateKey(date).substring(0, 7),
                  );
                  if (month.status(date) != CalendarAvailability.available) {
                    values.remove('eventDate');
                    values.remove('eventTime');
                    values.remove('eventEndTime');
                  }
                } catch (_) {
                  values.remove('eventDate');
                  values.remove('eventTime');
                  values.remove('eventEndTime');
                }
              }
              if (!mounted ||
                  !_canEditDraft ||
                  _sharedDetailsDismissed ||
                  _snapshotIdentity != snapshot ||
                  controller.authentication.session != session ||
                  controller.list?.ownerUid != _draftOwner ||
                  !sharedEventCandidates(
                    controller.list!.entries,
                    widget.provider.id,
                  ).any(
                    (e) =>
                        jsonEncode(
                          sharedEventDetails(e.configuration!.event),
                        ) ==
                        jsonEncode(
                          sharedEventDetails(entry.configuration!.event),
                        ),
                  )) {
                return;
              }
              setState(() {
                _sharedDetailsDismissed = true;
                _draftMessage =
                    'Shared event details applied where supported. Review the date, guest count and venue. Availability and current terms still require verification.';
                if (values['eventType'] != null) {
                  selectedEventType = values['eventType'] as String;
                }
                if (values['eventDate'] != null) {
                  selectedDate = DateTime.parse(values['eventDate'] as String);
                  TimeOfDay time(String value) => TimeOfDay(
                    hour: int.parse(value.split(':')[0]),
                    minute: int.parse(value.split(':')[1]),
                  );
                  selectedStartTime = time(values['eventTime'] as String);
                  selectedEndTime = time(values['eventEndTime'] as String);
                }
                if (values['guestCount'] != null) {
                  guestCount = values['guestCount'] as int;
                  guestCountController.text = '$guestCount';
                }
                if (values['eventLocation'] != null) {
                  locationController.text = values['eventLocation'] as String;
                  addressController.text = values['eventAddress'] as String;
                }
              });
            },
            child: Text(
              'Use ${entry.providerName}: ${entry.configuration!.event.eventType}, ${entry.configuration!.event.eventDate} ${entry.configuration!.event.eventTime}–${entry.configuration!.event.eventEndTime}, ${entry.configuration!.event.guestCount} guests, ${entry.configuration!.event.eventLocation}, ${entry.configuration!.event.eventAddress}',
            ),
          ),
        TextButton(
          onPressed: () => setState(() => _sharedDetailsDismissed = true),
          child: const Text('Enter new details'),
        ),
      ],
    );
  }

  Future<void> _restoreEventListConfiguration(
    CustomerEventListConfiguration config,
  ) async {
    if (!_canPublish || FirebaseAuth.instance.currentUser?.uid != _draftOwner) {
      return;
    }
    _applyingDraft = true;
    try {
      final event = config.event;
      selectedEventType = event.eventType;
      selectedDate = DateTime.parse(event.eventDate);
      TimeOfDay time(String value) => TimeOfDay(
        hour: int.parse(value.substring(0, 2)),
        minute: int.parse(value.substring(3)),
      );
      selectedStartTime = time(event.eventTime);
      selectedEndTime = time(event.eventEndTime);
      guestCount = event.guestCount;
      guestCountController.text = '$guestCount';
      locationController.text = event.eventLocation;
      addressController.text = event.eventAddress;
      specialRequestController.text = event.specialRequest;
      selectedServiceTier = config.serviceTier;
      selectedThemeId = config.packageThemeId;
      themeChoice = config.themeChoice;
      customThemeController.text = config.customTheme;
      foodChoiceSelections = config.foodChoiceSelections
          .map((row) => row.toJson())
          .toList();
      selectedFoods = List.of(config.selectedFoods);
      selectedDecorations = List.of(config.selectedDecorations);
      selectedFurniture = List.of(config.selectedFurniture);
      willArrangeOwnAddOns = config.willArrangeOwnAddOns;
      customerArrangedAddOnsController.text = config.customerArrangedAddOnsNote;
      selectedAddOns.clear();
      for (final saved in config.selectedAddOns) {
        final current = await repository.getEligiblePreparationAddon(
          saved.addonId,
        );
        if (!_canPublish ||
            FirebaseAuth.instance.currentUser?.uid != _draftOwner) {
          return;
        }
        if (current == null ||
            current.id != saved.addonId ||
            current.providerId != saved.providerId ||
            !current.isActive ||
            !current.isAvailable ||
            (saved.source == 'catering_provider' &&
                current.providerId != widget.provider.id)) {
          _unavailableRestoredAddons.add(saved.addonId);
          selectedAddOns.add(saved.toJson());
        } else {
          selectedAddOns.add(current.toBookingMap(source: saved.source));
        }
      }
      selectedMarketplaceAddOns
        ..clear()
        ..addAll(
          selectedAddOns.where((a) => a['source'] == 'feasta_addon_provider'),
        );
      useMarketplaceAddOns = selectedMarketplaceAddOns.isNotEmpty;
      if (config.sharedContractVersion != _eventPackage.sharedContractVersion ||
          config.expectedPackageRevision != _eventPackage.revision) {
        _restoredProblems.add('The package contract or revision has changed.');
      }
      if (!_eventTypes.contains(selectedEventType)) {
        _restoredProblems.add('The saved event type is no longer supported.');
      }
      if (selectedServiceTier != null &&
          !preparationServices(
            _eventPackage,
          ).containsKey(selectedServiceTier)) {
        _restoredProblems.add('The saved service level is no longer offered.');
      }
      if (selectedThemeId != null &&
          (!['buffet_setup', 'full_service'].contains(selectedServiceTier) ||
              !preparationThemes(
                _eventPackage,
              ).any((theme) => theme['id'] == selectedThemeId))) {
        _restoredProblems.add('The saved theme is no longer applicable.');
      }
      if (!validFoodChoiceSelections(
        _eventPackage.foodChoiceGroups,
        foodChoiceSelections,
      )) {
        _restoredProblems.add(
          'Food-choice groups or dishes require correction.',
        );
      }
      if (!selectedFoods.every(_eventPackage.foodInclusions.contains) ||
          !selectedDecorations.every(
            preparationInclusions(
              _eventPackage,
              'decorInclusions',
              selectedServiceTier,
            ).contains,
          ) ||
          !selectedFurniture.every(
            preparationInclusions(
              _eventPackage,
              'furnitureInclusions',
              selectedServiceTier,
            ).contains,
          )) {
        _restoredProblems.add(
          'Some saved food, decoration or furniture options are no longer offered.',
        );
      }
      if (_unavailableRestoredAddons.isNotEmpty) {
        _restoredProblems.add(
          'Some saved event services are no longer available.',
        );
      }
      _restoredNeedsReview = true;
      _draftMessage =
          'Event List configuration restored. Review current package options before continuing. Your saved entry remains unchanged until you save again.';
      _savedSnapshot = _snapshotIdentity;
      _draftDirty = false;
      setState(() => _draftReady = true);
    } catch (_) {
      if (_canPublish) {
        _draftBlocked = true;
        _draftMessage =
            'Could not verify the saved options. Your Event List configuration has been kept unchanged. Reopen it to retry.';
        setState(() => _draftReady = true);
      }
    } finally {
      _applyingDraft = false;
    }
  }

  void _confirmRestoredOptions() {
    setState(() {
      if (!_eventTypes.contains(selectedEventType)) selectedEventType = '';
      if (!preparationServices(
        _eventPackage,
      ).containsKey(selectedServiceTier)) {
        selectedServiceTier = null;
      }
      if (!['buffet_setup', 'full_service'].contains(selectedServiceTier) ||
          !preparationThemes(
            _eventPackage,
          ).any((theme) => theme['id'] == selectedThemeId)) {
        selectedThemeId = null;
      }
      foodChoiceSelections = foodChoiceSelections
          .where(
            (row) => _eventPackage.foodChoiceGroups.any(
              (g) => g.id == row['groupId'],
            ),
          )
          .map((row) {
            final group = _eventPackage.foodChoiceGroups.firstWhere(
              (g) => g.id == row['groupId'],
            );
            return <String, dynamic>{
              'groupId': group.id,
              'optionIds': (row['optionIds'] as List)
                  .where(group.options.containsKey)
                  .toList(),
            };
          })
          .toList();
      selectedFoods = selectedFoods
          .where(_eventPackage.foodInclusions.contains)
          .toList();
      selectedDecorations = selectedDecorations
          .where(
            preparationInclusions(
              _eventPackage,
              'decorInclusions',
              selectedServiceTier,
            ).contains,
          )
          .toList();
      selectedFurniture = selectedFurniture
          .where(
            preparationInclusions(
              _eventPackage,
              'furnitureInclusions',
              selectedServiceTier,
            ).contains,
          )
          .toList();
      selectedAddOns.removeWhere(
        (a) => _unavailableRestoredAddons.contains(a['addonId']),
      );
      selectedMarketplaceAddOns
        ..clear()
        ..addAll(
          selectedAddOns.where((a) => a['source'] == 'feasta_addon_provider'),
        );
      _unavailableRestoredAddons.clear();
      _restoredProblems.clear();
      _restoredNeedsReview = false;
      _draftMessage =
          'Current options applied. Correct any missing choices before Review Booking. Save there to update this Event List entry.';
    });
  }

  void _applyDraft(Map<String, dynamic> saved) {
    // Legacy services/review positions resume customization for explicit revalidation.
    _step = (saved['step'] as int? ?? 0).clamp(0, 1);
    selectedEventType = _eventTypes.isEmpty ? '' : _eventTypes.first;
    selectedDate = saved['date'] as DateTime?;
    selectedStartTime = saved['start'] as TimeOfDay?;
    selectedEndTime = saved['end'] as TimeOfDay?;
    final type = saved['type'] as String?;
    if (type != null && _eventTypes.contains(type)) selectedEventType = type;
    guestCount = saved['guests'] as int;
    locationController.text = saved['city'] as String;
    addressController.text = saved['address'] as String;
    _eventAddress = saved['eventAddress'] as CustomerAddressModel?;
    specialRequestController.text = saved['notes'] as String;
    customerArrangedAddOnsController.text = saved['ownNotes'] as String;
    selectedServiceTier = saved['tier'] as String?;
    if (!preparationServices(_eventPackage).containsKey(selectedServiceTier)) {
      selectedServiceTier = null;
    }
    foodChoiceSelections = parseFoodChoiceSelections(
      saved['foodChoiceSelections'],
    );
    foodChoiceSelections = foodChoiceSelections
        .where(
          (s) =>
              _eventPackage.foodChoiceGroups.any((g) => g.id == s['groupId']),
        )
        .map((s) {
          final group = _eventPackage.foodChoiceGroups.firstWhere(
            (g) => g.id == s['groupId'],
          );
          return <String, dynamic>{
            'groupId': group.id,
            'optionIds': (s['optionIds'] as List)
                .where(group.options.containsKey)
                .toList(),
          };
        })
        .toList();
    selectedFoods = List<String>.from(saved['foods'] as List);
    selectedFoods = reconcilePreparationSelections(
      _eventPackage,
      selectedFoods,
      _eventPackage.foodInclusions,
    );
    selectedDecorations = List<String>.from(saved['decorations'] as List);
    selectedDecorations = reconcilePreparationSelections(
      _eventPackage,
      selectedDecorations,
      preparationInclusions(
        _eventPackage,
        'decorInclusions',
        selectedServiceTier,
      ),
    );
    selectedFurniture = List<String>.from(saved['furniture'] as List);
    selectedFurniture = reconcilePreparationSelections(
      _eventPackage,
      selectedFurniture,
      preparationInclusions(
        _eventPackage,
        'furnitureInclusions',
        selectedServiceTier,
      ),
    );
    selectedAddOns.addAll(
      (saved['addons'] as List).map(
        (item) => Map<String, dynamic>.from(item as Map),
      ),
    );
    willArrangeOwnAddOns = saved['own'] == true;
    useCateringProviderAddOns = saved['useCatering'] != false;
    selectedThemeId = saved['theme'] as String?;
    themeChoice = saved['themeChoice'] as String?;
    customThemeController.text = saved['customTheme'] as String? ?? '';
    if (!preparationServices(_eventPackage).containsKey(selectedServiceTier)) {
      selectedServiceTier = null;
    }
    if (_eventPackage.themeOptions
            .where((theme) => theme['id'] == selectedThemeId)
            .length !=
        1) {
      selectedThemeId = null;
    }
    selectedMarketplaceAddOns.addAll(
      selectedAddOns.where(
        (addon) => addon['source'] == 'feasta_addon_provider',
      ),
    );
    useMarketplaceAddOns =
        saved['useMarketplace'] == true || selectedMarketplaceAddOns.isNotEmpty;
    if (selectedThemeId == null && themeChoice == 'package') themeChoice = null;
    if (!['buffet_setup', 'full_service'].contains(selectedServiceTier)) {
      selectedThemeId = null;
      themeChoice = null;
    }
    if (!_eventPackage.isCustomizable) {
      selectedFoods = List.of(_eventPackage.foodInclusions);
      selectedDecorations = List.of(
        preparationInclusions(
          _eventPackage,
          'decorInclusions',
          selectedServiceTier,
        ),
      );
      selectedFurniture = List.of(
        preparationInclusions(
          _eventPackage,
          'furnitureInclusions',
          selectedServiceTier,
        ),
      );
    }
  }

  void _invalidateMapAddress(String _) {
    setState(() => _eventAddress = null);
    _saveDraft();
  }

  Future<void> _chooseOnMap() async {
    if (!_canEditDraft) return;
    final epoch = _draftActionEpoch;
    final result = await Navigator.push<CustomerAddressModel>(
      context,
      MaterialPageRoute(
        builder: (_) => LocationPickerScreen(
          session: _entrySession,
          initialAddress: _eventAddress,
          sessionOnly: true,
        ),
      ),
    );
    if (!_canFinishAction(epoch) || result == null) return;
    setState(() {
      _eventAddress = result;
      locationController.text = result.city;
      addressController.text = result.fullAddress;
    });
    _saveDraft();
  }

  Future<void> _manualAddress() async {
    if (!_canEditDraft) return;
    final epoch = _draftActionEpoch;
    final result = await Navigator.push<CustomerAddressModel>(
      context,
      CustomizationSessionRoute<CustomerAddressModel>(
        session: _entrySession,
        builder: (_) => const ManualAddressScreen(),
      ),
    );
    if (!_canFinishAction(epoch) || result == null) return;
    setState(() {
      _eventAddress = result;
      locationController.text = result.city;
      addressController.text = result.fullAddress;
    });
    _saveDraft();
  }

  @override
  void dispose() {
    _reviewAgreements.dispose();
    _reviewRefunds.dispose();
    _navigationGuard?.dispose();
    _exitRoute?.permitPop = null;
    _exitRoute?.requestExit = null;
    if (_entrySession == null) {
      _saveDraft();
    } else {
      // Close before queued flushes and callbacks can dispatch after disposal.
      _entryClosed = true;
      _entrySession.removeListener(_sessionChanged);
      _entrySession.close();
    }
    _draftTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _draftAuth?.cancel();
    _scrollController.dispose();
    customThemeController.dispose();
    locationController.dispose();
    addressController.dispose();
    guestCountController.dispose();
    specialRequestController.dispose();
    customerArrangedAddOnsController.dispose();

    super.dispose();
  }

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
    if (!_canEditDraft) return;
    final epoch = _draftActionEpoch;
    final picked = await showModalBottomSheet<DateTime>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * .9,
        maxWidth: 420,
      ),
      builder: (context) => CustomizationSessionBoundary(
        session: _entrySession,
        builder: (_) => ProviderCalendar(
          providerId: widget.provider.id,
          selectedDate: selectedDate,
          loadMonth: repository.getProviderCalendarMonth,
          planningOnly: _entrySession == null || _guestPlanning,
        ),
      ),
    );

    if (!_canFinishAction(epoch) || picked == null) {
      return;
    }

    setState(() {
      selectedDate = picked;
    });
    _saveDraft();
  }

  Future<bool> _verifyCalendarDate() async {
    // Web planning-only flows do not claim provider availability.
    if (_entrySession == null || _guestPlanning) return true;
    if (_checking || selectedDate == null) return false;
    final date = selectedDate!;
    final provider = widget.provider.id;
    final epoch = _draftActionEpoch;
    setState(() => _checking = true);
    try {
      final result = await repository.getProviderCalendarMonth(
        provider,
        calendarDateKey(date).substring(0, 7),
      );
      if (!_canFinishAction(epoch) ||
          provider != widget.provider.id ||
          selectedDate != date) {
        return false;
      }
      if (result.status(date) != CalendarAvailability.available) {
        _showMessage(
          'This date is ${result.status(date).label.toLowerCase()}. Choose another available date.',
        );
        return false;
      }
      return true;
    } catch (_) {
      if (_canFinishAction(epoch)) {
        _showMessage(
          'Calendar availability could not be verified. Review your event date and try again.',
        );
      }
      return false;
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  Future<void> _pickStartTime() async {
    if (!_canEditDraft) return;
    final epoch = _draftActionEpoch;
    final picked = await showTimePicker(
      context: context,
      builder: (context, child) => CustomizationSessionBoundary(
        session: _entrySession,
        builder: (_) => child!,
      ),
      initialTime: selectedStartTime ?? const TimeOfDay(hour: 14, minute: 0),
    );

    if (!_canFinishAction(epoch) || picked == null) {
      return;
    }

    setState(() {
      selectedStartTime = picked;
    });
  }

  Future<void> _pickEndTime() async {
    if (!_canEditDraft) return;
    final epoch = _draftActionEpoch;
    final picked = await showTimePicker(
      context: context,
      builder: (context, child) => CustomizationSessionBoundary(
        session: _entrySession,
        builder: (_) => child!,
      ),
      initialTime: selectedEndTime ?? const TimeOfDay(hour: 18, minute: 0),
    );

    if (!_canFinishAction(epoch) || picked == null) {
      return;
    }

    setState(() {
      selectedEndTime = picked;
    });
  }

  void _decreaseGuests() {
    if (guestCount <= preparationMinimumGuests(_eventPackage)) {
      return;
    }

    setState(() {
      guestCount--;
      guestCountController.text = '$guestCount';
    });
  }

  void _increaseGuests() {
    if (preparationMaximumGuests(_eventPackage) != null &&
        guestCount >= preparationMaximumGuests(_eventPackage)!) {
      return;
    }

    setState(() {
      guestCount++;
      guestCountController.text = '$guestCount';
    });
  }

  void _toggleStringItem({
    required String item,
    required List<String> selectedList,
    required bool value,
  }) {
    if (!_eventPackage.isCustomizable) return;
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

  void _toggleEventService(String id, AddonModel? addon, bool selected) {
    if (!_canEditDraft) return;
    if (selected &&
        selectedAddOns.map((a) => a['addonId']).toSet().length >= 20) {
      _showMessage('You can select up to 20 services.');
      return;
    }
    setState(() {
      selectedAddOns.removeWhere((a) => a['addonId'] == id);
      if (selected && addon != null) {
        selectedAddOns.add(
          addon.toBookingMap(
            source: addon.providerId == widget.provider.id
                ? 'catering_provider'
                : 'feasta_addon_provider',
          ),
        );
      }
      selectedMarketplaceAddOns
        ..clear()
        ..addAll(
          selectedAddOns.where((a) => a['source'] == 'feasta_addon_provider'),
        );
    });
    _saveDraft();
  }

  void _showMessage(String message) {
    if (!_canPublish) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  String? _stepValidation() => _restoredNeedsReview
      ? 'Review and confirm the restored package options first.'
      : selectedEventType.isEmpty
      ? 'Published event category unavailable. Please ask the provider to update the package.'
      : validatePreparation(
          package: _eventPackage,
          providerId: widget.provider.id,
          eventType: selectedEventType,
          date: selectedDate,
          startMinutes: selectedStartTime == null
              ? null
              : selectedStartTime!.hour * 60 + selectedStartTime!.minute,
          endMinutes: selectedEndTime == null
              ? null
              : selectedEndTime!.hour * 60 + selectedEndTime!.minute,
          guests: guestCount,
          city: locationController.text,
          address: addressController.text,
          foods: selectedFoods,
          decorations: selectedDecorations,
          furniture: selectedFurniture,
          serviceTier: selectedServiceTier,
          themeId: selectedThemeId,
          validatePackageOptions: _step > 0,
        );

  Future<void> _continueToReview() async {
    if (_checking || !_canEditDraft || _exiting) return;

    final deadlineWarning = _submissionDeadlineNotice;

    if (deadlineWarning != null) {
      _showMessage(deadlineWarning);
      return;
    }
    if (_restoredNeedsReview) {
      _showMessage('Confirm the restored options first.');
      return;
    }
    if (!await _verifyCalendarDate()) return;
    if (!_canEditDraft || _exiting) return;

    final refreshedDeadline = _submissionDeadlineNotice;

    if (refreshedDeadline != null) {
      _showMessage(refreshedDeadline);
      return;
    }
    if (!validFoodChoiceSelections(
      _eventPackage.foodChoiceGroups,
      foodChoiceSelections,
    )) {
      _showMessage(
        'Select exactly the required number of dishes in each food-choice group.',
      );
      return;
    }
    final epoch = _draftActionEpoch;
    bool actionCurrent() =>
        _canPublish && !_exiting && epoch == _draftActionEpoch;
    if ((_draftOwner == null && !_guestPlanning) ||
        FirebaseAuth.instance.currentUser?.uid != _draftOwner) {
      _showMessage('Please sign in again to continue preparing your event.');
      return;
    }
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

    setState(() => _checking = true);
    try {
      final fresh = await repository.getEligiblePackageForPreparation(
        widget.provider.id,
        _eventPackage.id,
      );
      if (!actionCurrent()) return;
      if (fresh == null) {
        _showMessage(
          'This package is no longer available. Please choose another package.',
        );
        return;
      }
      final changedOptions =
          (fresh.eventType.trim().isNotEmpty &&
              !(fresh.sharedContractVersion == 2
                  ? fresh.occasionMatchIds.contains(selectedEventType)
                  : selectedEventType == fresh.eventType.trim())) ||
          (!fresh.isCustomizable &&
              (selectedFoods.length != fresh.foodInclusions.length ||
                  selectedDecorations.length !=
                      preparationInclusions(
                        fresh,
                        'decorInclusions',
                        selectedServiceTier,
                      ).length ||
                  selectedFurniture.length !=
                      preparationInclusions(
                        fresh,
                        'furnitureInclusions',
                        selectedServiceTier,
                      ).length)) ||
          !selectedFoods.every(fresh.foodInclusions.contains) ||
          !selectedDecorations.every(
            preparationInclusions(
              fresh,
              'decorInclusions',
              selectedServiceTier,
            ).contains,
          ) ||
          !selectedFurniture.every(
            preparationInclusions(
              fresh,
              'furnitureInclusions',
              selectedServiceTier,
            ).contains,
          ) ||
          (selectedServiceTier != null &&
              !preparationServices(fresh).containsKey(selectedServiceTier)) ||
          (selectedThemeId != null &&
              !preparationThemes(
                fresh,
              ).any((theme) => theme['id'] == selectedThemeId));
      setState(() {
        _eventPackage = fresh;
        if (!_eventTypes.contains(selectedEventType)) {
          selectedEventType = _eventTypes.isEmpty ? '' : _eventTypes.first;
        }
        if (!fresh.isCustomizable) {
          selectedFoods = List.of(fresh.foodInclusions);
          selectedDecorations = List.of(
            preparationInclusions(
              fresh,
              'decorInclusions',
              selectedServiceTier,
            ),
          );
          selectedFurniture = List.of(
            preparationInclusions(
              fresh,
              'furnitureInclusions',
              selectedServiceTier,
            ),
          );
        }
        selectedFoods.removeWhere(
          (item) => !fresh.foodInclusions.contains(item),
        );
        selectedDecorations.removeWhere(
          (item) => !preparationInclusions(
            fresh,
            'decorInclusions',
            selectedServiceTier,
          ).contains(item),
        );
        selectedFurniture.removeWhere(
          (item) => !preparationInclusions(
            fresh,
            'furnitureInclusions',
            selectedServiceTier,
          ).contains(item),
        );
        if (!preparationServices(fresh).containsKey(selectedServiceTier)) {
          selectedServiceTier = null;
          themeChoice = null;
          customThemeController.clear();
        }
        selectedDecorations = reconcilePreparationSelections(
          fresh,
          selectedDecorations,
          preparationInclusions(fresh, 'decorInclusions', selectedServiceTier),
        );
        selectedFurniture = reconcilePreparationSelections(
          fresh,
          selectedFurniture,
          preparationInclusions(
            fresh,
            'furnitureInclusions',
            selectedServiceTier,
          ),
        );
        if (!preparationThemes(
          fresh,
        ).any((theme) => theme['id'] == selectedThemeId)) {
          selectedThemeId = null;
        }
      });
      if (changedOptions) {
        _showMessage(
          'Package options changed. Please review the updated selections.',
        );
        return;
      }
      final error = validatePreparation(
        package: fresh,
        eventType: selectedEventType,
        providerId: widget.provider.id,
        date: selectedDate,
        startMinutes: startMinutes,
        endMinutes: endMinutes,
        guests: guestCount,
        city: locationController.text,
        address: addressController.text,
        foods: selectedFoods,
        decorations: selectedDecorations,
        furniture: selectedFurniture,
        serviceTier: selectedServiceTier,
        themeId: selectedThemeId,
      );
      if (error != null) {
        _showMessage(error);
        return;
      }
      final currentAddons = <Map<String, dynamic>>[];
      final seenAddons = <String>{};
      for (final addon in selectedAddOns) {
        if (![
          'catering_provider',
          'feasta_addon_provider',
        ].contains(addon['source'])) {
          _showMessage(
            'Please choose add-ons from the current provider or marketplace.',
          );
          return;
        }
        if (!seenAddons.add(addon['addonId']?.toString() ?? '')) continue;
        final current = await repository.getEligiblePreparationAddon(
          addon['addonId']?.toString() ?? '',
        );
        if (!actionCurrent()) return;
        if (current == null ||
            current.providerId != addon['providerId'] ||
            (addon['source'] == 'catering_provider' &&
                current.providerId != widget.provider.id)) {
          _showMessage(
            'A selected add-on is no longer available. Please remove it and choose again.',
          );
          return;
        }
        currentAddons.add(
          current.toBookingMap(
            source: addon['source']?.toString() ?? 'catering_provider',
          ),
        );
      }
      setState(() {
        selectedAddOns
          ..clear()
          ..addAll(currentAddons);
        selectedMarketplaceAddOns
          ..clear()
          ..addAll(
            currentAddons.where(
              (addon) => addon['source'] == 'feasta_addon_provider',
            ),
          );
      });
      if (!validFoodChoiceSelections(
        fresh.foodChoiceGroups,
        foodChoiceSelections,
      )) {
        _showMessage(
          'Food choices changed. Review your dish selections again.',
        );
        return;
      }
      final customization = snapshotCustomization(
        EventCustomizationData(
          sharedContractVersion: _eventPackage.sharedContractVersion,
          expectedPackageRevision: _eventPackage.revision,
          serviceTier: selectedServiceTier,
          packageThemeId: selectedThemeId,
          themeChoice: themeChoice,
          customTheme: customThemeController.text.trim(),
          eventType: selectedEventType,
          eventDate: selectedDate!,
          eventTime: _formatTime(selectedStartTime),
          eventEndTime: _formatTime(selectedEndTime),
          guestCount: guestCount,
          eventLocation: locationController.text.trim(),
          eventAddress: addressController.text.trim(),
          foodChoiceSelections: foodChoiceSelections,
          selectedFoods: selectedFoods,
          selectedDecorations: selectedDecorations,
          selectedFurniture: selectedFurniture,
          selectedAddOns: currentAddons,
          willArrangeOwnAddOns: willArrangeOwnAddOns,
          customerArrangedAddOnsNote: customerArrangedAddOnsController.text
              .trim(),
          specialRequest: [
            specialRequestController.text.trim(),
            if (themeChoice == 'custom' &&
                !specialRequestController.text.contains(
                  'Custom theme request (requires provider confirmation): ${customThemeController.text.trim()}',
                ))
              'Custom theme request (requires provider confirmation): ${customThemeController.text.trim()}',
            if (themeChoice == 'none' &&
                !specialRequestController.text.contains('No theme needed.'))
              'No theme needed.',
          ].where((value) => value.isNotEmpty).join('\n'),
        ),
      );
      // Validate the transport shape locally without invoking any callable.
      BookingSelection(
        providerId: widget.provider.id,
        packageId: fresh.id,
        customization: customization,
      ).toJson(clientRequestId: 'preparation_only');
      _saveDraft();
      if (!actionCurrent()) return;
      if (FirebaseAuth.instance.currentUser?.uid != _draftOwner) {
        preparationDraftMemory.clear();
        _showMessage('Please sign in again to continue preparing your event.');
        return;
      }
      if (!mounted || !_entryAuthorized) return;
      // Inline feedback is advisory; authorize the complete refreshed snapshot.
      CustomerAvailability? approval;
      if (_entrySession != null && !_guestPlanning) {
        final identity = _snapshotIdentity;
        approval = await repository.checkProviderAvailability(
          providerId: widget.provider.id,
          packageId: fresh.id,
          customization: customization,
        );
        if (!actionCurrent()) return;
        if (FirebaseAuth.instance.currentUser?.uid != _entrySession.uid ||
            identity != _snapshotIdentity ||
            _eventPackage.id != fresh.id ||
            _eventPackage.revision != customization.expectedPackageRevision ||
            fresh.providerId != widget.provider.id ||
            !approval.permits(
              FirebaseAuth.instance.currentUser?.uid,
              fresh.id,
              widget.provider.id,
              customization,
            )) {
          _showMessage(
            approval.available
                ? 'Availability expired or your event changed. Please review and try again.'
                : 'Unavailable: ${approval.message}',
          );
          return;
        }
      }
      if (!mounted) return;
      final edit = await Navigator.push<BookingReviewEdit>(
        context,
        CustomizationSessionRoute<BookingReviewEdit>(
          session: _entrySession,
          builder: (_) => BookingSummaryScreen(
            agreements: _reviewAgreements,
            refunds: _reviewRefunds,
            session: _entrySession,
            provider: widget.provider,
            eventPackage: fresh,
            customization: customization,
            preparationOnly: _entrySession == null || _guestPlanning,
            availability: approval,
          ),
        ),
      );
      if (mounted && _entryAuthorized && edit != null) {
        await _goToStep(edit == BookingReviewEdit.event ? 0 : 1);
      }
    } on FormatException catch (error) {
      if (actionCurrent()) _showMessage(error.message);
    } catch (_) {
      if (actionCurrent()) {
        _showMessage(
          'Availability or current package options could not be verified. Check your connection and sign-in, then try again.',
        );
      }
    } finally {
      if (actionCurrent()) setState(() => _checking = false);
    }
  }

  Future<void> _discardDraft({bool confirmedExit = false}) async {
    if (_deletingDraft || _discardDialogOpen || (_checking && !confirmedExit)) {
      return;
    }
    final owner = _draftOwner;
    if (!_entryAuthorized ||
        owner == null ||
        FirebaseAuth.instance.currentUser?.uid != owner) {
      return;
    }
    _discardDialogOpen = true;
    final bool? confirmed;
    try {
      confirmed = confirmedExit
          ? true
          : await showDialog<bool>(
              context: context,
              builder: (context) => CustomizationSessionBoundary(
                session: _entrySession,
                builder: (context) => AlertDialog(
                  title: const Text('Discard unfinished draft?'),
                  content: const Text(
                    'This deletes this event draft from this device. Existing request identities remain unchanged.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Keep draft'),
                    ),
                    TextButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Discard'),
                    ),
                  ],
                ),
              ),
            );
    } finally {
      _discardDialogOpen = false;
    }
    if (confirmed != true ||
        !_canPublish ||
        FirebaseAuth.instance.currentUser?.uid != owner) {
      return;
    }
    _draftTimer?.cancel();
    final wasBlocked = _draftBlocked;
    _draftActionEpoch++;
    _applyingDraft = true;
    setState(() {
      _deletingDraft = true;
      _draftBlocked = true;
    });
    _applyingDraft = false;
    try {
      await _drafts.delete(
        owner,
        widget.provider.id,
        _eventPackage.id,
        () => FirebaseAuth.instance.currentUser?.uid,
        authorize: _entrySession == null ? null : () => _entryAuthorized,
      );
      if (!_canPublish || FirebaseAuth.instance.currentUser?.uid != owner) {
        return;
      }
      if (confirmedExit) {
        // Block autosave until disposal, including lifecycle callbacks.
        super.setState(() {
          _allowExit = true;
          _draftDirty = false;
        });
        await WidgetsBinding.instance.endOfFrame;
        if (mounted &&
            _canPublish &&
            (ModalRoute.of(context)?.isCurrent ?? false)) {
          Navigator.of(context).pop();
        }
        return;
      }
      _applyingDraft = true;
      setState(() {
        _step = 0;
        selectedDate = null;
        selectedStartTime = null;
        selectedEndTime = null;
        selectedEventType = _eventTypes.isEmpty ? '' : _eventTypes.first;
        guestCount = preparationMinimumGuests(_eventPackage);
        guestCountController.text = '$guestCount';
        locationController.text = 'Ormoc City';
        addressController.clear();
        specialRequestController.clear();
        customerArrangedAddOnsController.clear();
        customThemeController.clear();
        _eventAddress = null;
        selectedServiceTier = null;
        selectedThemeId = null;
        themeChoice = null;
        foodChoiceSelections = [];
        selectedFoods = List.of(_eventPackage.foodInclusions);
        selectedDecorations = List.of(
          preparationInclusions(
            _eventPackage,
            'decorInclusions',
            selectedServiceTier,
          ),
        );
        selectedFurniture = List.of(
          preparationInclusions(
            _eventPackage,
            'furnitureInclusions',
            selectedServiceTier,
          ),
        );
        selectedAddOns.clear();
        selectedMarketplaceAddOns.clear();
        willArrangeOwnAddOns = false;
        useMarketplaceAddOns = false;
        useCateringProviderAddOns = true;
        _savedSnapshot = _snapshotIdentity;
        _draftDirty = false;
        _draftMessage = 'Unfinished draft discarded. You can start again.';
      });
      _draftBlocked = false;
      _draftDirty = false;
      _applyingDraft = false;
    } catch (_) {
      if (_canPublish && FirebaseAuth.instance.currentUser?.uid == owner) {
        _applyingDraft = true;
        setState(() => _draftBlocked = wasBlocked);
        _applyingDraft = false;
        _showMessage('Draft could not be deleted. Please try again.');
      }
    } finally {
      if (_canPublish) {
        _applyingDraft = true;
        setState(() => _deletingDraft = false);
        _applyingDraft = false;
      }
    }
  }

  Widget _draftStatusScreen(Widget body) => Scaffold(
    appBar: AppBar(title: const Text('Customize your event')),
    body: body,
  );

  @override
  Widget build(BuildContext context) => PopScope<void>(
    canPop: !_entryAuthorized || _allowExit,
    onPopInvokedWithResult: (didPop, result) {
      if (!didPop) unawaited(_requestExit());
    },
    child: _buildContent(context),
  );

  Widget _buildContent(BuildContext context) {
    if (_exiting && _entryAuthorized) {
      return _draftStatusScreen(
        Center(
          child: Semantics(
            liveRegion: true,
            excludeSemantics: true,
            label: 'Saving unfinished draft before leaving',
            child: const Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                Text('Saving unfinished draft before leaving'),
              ],
            ),
          ),
        ),
      );
    }
    if (!_entryAuthorized) {
      return _draftStatusScreen(
        const Center(
          child: Text('Please sign in again to customize your event.'),
        ),
      );
    }
    if (!_draftReady) {
      return _draftStatusScreen(
        const Center(child: CircularProgressIndicator()),
      );
    }
    if (FirebaseAuth.instance.currentUser?.uid != _draftOwner) {
      return _draftStatusScreen(
        const Center(
          child: Text('Please sign in again to customize your event.'),
        ),
      );
    }
    if (_deletingDraft) {
      return PopScope(
        canPop: false,
        child: _draftStatusScreen(
          const Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('Discarding unfinished draft?'),
              ],
            ),
          ),
        ),
      );
    }
    if (_draftBlocked) {
      return _draftStatusScreen(
        ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(_draftMessage ?? 'Draft recovery is unavailable.'),
            TextButton(
              onPressed: _discardDraft,
              child: const Text('Discard unfinished draft'),
            ),
          ],
        ),
      );
    }
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        leading: BackButton(onPressed: _exiting ? null : _requestExit),
        actions: [
          if (_step == 1)
            PopupMenuButton<String>(
              tooltip: 'Draft actions',
              onSelected: (_) => _discardDraft(),
              itemBuilder: (_) => const [
                PopupMenuItem(
                  value: 'discard',
                  child: Text('Discard unfinished draft'),
                ),
              ],
            ),
        ],
        title: FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            'Customize your event',
            maxLines: 1,
            style: AppTypography.sectionTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ),
      body: _checking && _step == 1
          ? const _BookingReviewLoadingSkeleton()
          : ListView(
              controller: _scrollController,
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screen,
                AppSpacing.sm,
                AppSpacing.screen,
                140,
              ),
              children: [
                if (_restoredNeedsReview) ...[
                  const Text('Configured — revalidation required'),
                  for (final problem in _restoredProblems) Text(problem),
                  OutlinedButton(
                    onPressed: _confirmRestoredOptions,
                    child: Text(
                      _restoredProblems.isEmpty
                          ? 'Confirm restored options'
                          : 'Remove unavailable options and review current package',
                    ),
                  ),
                ],
                _sharedEventOffer(),
                if (_draftMessage != null &&
                    !_restoredNeedsReview &&
                    _restoredProblems.isEmpty &&
                    _draftMessage!.startsWith('Unfinished draft recovered.'))
                  _CompactRecoveredDraftNotice(
                    key: ValueKey(_draftMessage),
                    message: _draftMessage!,
                  )
                else if (_draftMessage != null)
                  Semantics(
                    liveRegion: true,
                    child: Container(
                      width: double.infinity,
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.primarySubtle,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Padding(
                            padding: EdgeInsets.only(top: 2),
                            child: Icon(
                              Icons.restore_outlined,
                              size: 19,
                              color: AppColors.primary,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              _draftMessage!,
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(
                                    color: AppColors.secondaryTextAccessible,
                                    height: 1.35,
                                  ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                if (_draftSaveFailed && _draftDirty)
                  TextButton(
                    onPressed: _exiting ? null : _requestExit,
                    child: const Text('Retry saving and leave'),
                  ),
                if (_step != 1) ...[
                  TextButton(
                    onPressed: _discardDraft,
                    child: const Text('Discard unfinished draft'),
                  ),
                ],
                _PackageSummaryCard(
                  provider: widget.provider,
                  eventPackage: _eventPackage,
                  compact: _step == 1,
                ),
                SizedBox(height: _step == 1 ? 8 : 16),
                CustomizationProgress(step: _step),
                SizedBox(height: _step == 1 ? 8 : 20),
                if (_step == 0) ...[
                  const _SectionHeading(
                    title: 'Event details',
                    subtitle:
                        'Add the schedule, guest count, and venue information for your celebration.',
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
                        if (_eventTypes.length <= 1)
                          InputDecorator(
                            decoration: _inputDecoration(
                              hintText: 'Event type',
                            ),
                            child: Text(
                              selectedEventType.isEmpty
                                  ? 'Published event category unavailable'
                                  : selectedEventType[0].toUpperCase() +
                                        selectedEventType.substring(1),
                            ),
                          )
                        else
                          DropdownButtonFormField<String>(
                            key: ValueKey('event-type:$selectedEventType'),
                            initialValue: selectedEventType,
                            isExpanded: true,
                            decoration: _inputDecoration(
                              hintText: 'Choose event type',
                            ),
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

                  if (_submissionDeadlineNotice != null) ...[
                    const SizedBox(height: 8),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: Text(
                        _submissionDeadlineNotice!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                  if (!_guestPlanning)
                    PreparationAvailability(
                      packageId: _eventPackage.id,
                      providerId: widget.provider.id,

                      providerName: widget.provider.businessName,
                      date: selectedDate,
                      start: selectedStartTime,
                      end: selectedEndTime,
                      guests:
                          guestCount >=
                                  preparationMinimumGuests(_eventPackage) &&
                              guestCount <=
                                  (preparationMaximumGuests(_eventPackage) ??
                                      10000) &&
                              guestCount <= 10000
                          ? guestCount
                          : 0,
                      addonIds: selectedAddOns
                          .where(
                            (item) => [
                              'feasta_addon_provider',
                              'catering_provider',
                            ].contains(item['source']),
                          )
                          .map((item) => item['addonId'].toString())
                          .toList(),
                    ),
                  _GuestCountCard(
                    controller: guestCountController,
                    onCountChanged: (text) =>
                        setState(() => guestCount = int.tryParse(text) ?? 0),
                    guestCount: guestCount,
                    minimumGuests: preparationMinimumGuests(_eventPackage),
                    maximumGuests: preparationMaximumGuests(_eventPackage) ?? 0,
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
                          onChanged: _invalidateMapAddress,
                          textInputAction: TextInputAction.next,
                          decoration: _inputDecoration(hintText: 'Ormoc City'),
                        ),

                        const SizedBox(height: AppSpacing.lg),

                        const _FieldLabel(
                          icon: Icons.location_on_outlined,
                          text: 'Complete event address',
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        TextButton.icon(
                          onPressed: _manualAddress,
                          icon: const Icon(Icons.edit_location_alt_outlined),
                          label: const Text('Enter address manually'),
                        ),
                        TextField(
                          controller: addressController,
                          onChanged: _invalidateMapAddress,
                          textInputAction: TextInputAction.done,
                          decoration: _inputDecoration(
                            hintText: 'Enter the complete event address',
                          ),
                        ),
                        const SizedBox(height: AppSpacing.md),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: _chooseOnMap,
                            icon: const Icon(Icons.location_on),
                            label: Text(
                              _eventAddress?.hasCoordinates == true
                                  ? 'View or Edit Map Location'
                                  : 'Choose on Map',
                              textAlign: TextAlign.center,
                            ),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppColors.primary,
                              backgroundColor: AppColors.surface,
                              side: const BorderSide(color: AppColors.primary),
                              padding: const EdgeInsets.symmetric(
                                horizontal: AppSpacing.md,
                                vertical: AppSpacing.md,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(
                                  AppRadius.large,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  const _SectionHeading(
                    title: 'Special requests (optional)',
                    subtitle:
                        'Share anything else the provider should know about your event.',
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
                if (_step == 1) ...[
                  const _SectionHeading(
                    title: 'Customize your package',
                    subtitle:
                        'Compare service levels, choose your dishes, and explore optional visual styles. Published inclusions are automatically included.',
                  ),
                  const SizedBox(height: AppSpacing.md),
                  if (preparationServices(_eventPackage).isNotEmpty) ...[
                    const SizedBox(height: 12),
                    const _SectionHeading(
                      title: 'Service level · Required',
                      subtitle:
                          'Choose one. Prices and inclusions are published by the provider; the final booking amount is confirmed later.',
                    ),
                    ServiceOptionCards(
                      compact: true,
                      package: _eventPackage,
                      selected: selectedServiceTier,
                      onSelected: (tier) {
                        setState(() {
                          selectedServiceTier = tier;
                          selectedDecorations = reconcilePreparationSelections(
                            _eventPackage,
                            selectedDecorations,
                            preparationInclusions(
                              _eventPackage,
                              'decorInclusions',
                              tier,
                            ),
                          );
                          selectedFurniture = reconcilePreparationSelections(
                            _eventPackage,
                            selectedFurniture,
                            preparationInclusions(
                              _eventPackage,
                              'furnitureInclusions',
                              tier,
                            ),
                          );
                          if (_canEditDraft) {
                            widget.onServiceChanged?.call(tier);
                          }
                          if (tier == 'drop_off') {
                            selectedThemeId = null;
                            themeChoice = null;
                            customThemeController.clear();
                          }
                        });
                        _saveDraft();
                      },
                    ),
                  ],
                  if ([
                    'buffet_setup',
                    'full_service',
                  ].contains(selectedServiceTier)) ...[
                    Text(
                      'Theme Options',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 12),
                    PackageThemeCards(
                      package: _eventPackage,
                      selected: selectedThemeId,
                      onSelected: (theme) {
                        setState(() {
                          selectedThemeId = selectedThemeId == theme
                              ? null
                              : theme;
                          themeChoice = null;
                          customThemeController.clear();
                        });
                        _saveDraft();
                      },
                    ),
                    ThemeChoiceCard(
                      selected: themeChoice == 'none',
                      title: 'No theme needed',
                      onTap: () => _chooseTheme('none'),
                    ),
                    ThemeChoiceCard(
                      selected: themeChoice == 'custom',
                      title: 'Request a custom theme',
                      subtitle:
                          'Provider confirmation required. Price is not yet confirmed.',
                      onTap: () => _chooseTheme('custom'),
                    ),
                    if (themeChoice == 'custom') ...[
                      const Text('Describe your requested theme'),
                      const SizedBox(height: 8),
                      TextField(
                        controller: customThemeController,
                        maxLines: 3,
                        decoration: _inputDecoration(
                          hintText:
                              'E.g., Rustic outdoor, fairytale, modern glam...',
                        ),
                        onChanged: (_) => _saveDraft(),
                      ),
                      TextButton(
                        onPressed: () => _chooseTheme(null),
                        child: const Text('Cancel request'),
                      ),
                    ],
                  ],
                  ..._eventPackage.foodChoiceGroups.map((group) {
                    final current = foodChoiceSelections.where(
                      (s) => s['groupId'] == group.id,
                    );
                    final ids = current.isEmpty
                        ? <String>[]
                        : List<String>.from(
                            current.single['optionIds'] as List,
                          );
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${group.title} ? choose exactly ${group.selectionCount}',
                        ),
                        ...group.options.entries.map(
                          (option) => CheckboxListTile(
                            title: Text(option.value),
                            value: ids.contains(option.key),
                            onChanged:
                                !_canEditDraft ||
                                    (!ids.contains(option.key) &&
                                        ids.length >= group.selectionCount)
                                ? null
                                : (checked) {
                                    setState(() {
                                      if (checked == true) {
                                        ids.add(option.key);
                                      } else {
                                        ids.remove(option.key);
                                      }
                                      foodChoiceSelections = [
                                        ...foodChoiceSelections.where(
                                          (s) => s['groupId'] != group.id,
                                        ),
                                        {'groupId': group.id, 'optionIds': ids},
                                      ];
                                    });
                                    _scheduleDraft();
                                  },
                          ),
                        ),
                      ],
                    );
                  }),

                  if (_eventPackage.foodInclusions.isNotEmpty ||
                      preparationInclusions(
                        _eventPackage,
                        'decorInclusions',
                        selectedServiceTier,
                      ).isNotEmpty ||
                      preparationInclusions(
                        _eventPackage,
                        'furnitureInclusions',
                        selectedServiceTier,
                      ).isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xl),
                    _SectionHeading(
                      title: _eventPackage.isCustomizable
                          ? 'Package selections'
                          : 'Included with your package',
                      subtitle: _eventPackage.isCustomizable
                          ? 'Adjust the included options for your event.'
                          : 'These published inclusions are automatically included. No selection is needed.',
                    ),
                    const SizedBox(height: AppSpacing.md),
                  ],

                  if (!_eventPackage.isCustomizable)
                    const Padding(
                      padding: EdgeInsets.only(bottom: 8),
                      child: Text(
                        'Shared package inclusions',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                  IgnorePointer(
                    ignoring: !_eventPackage.isCustomizable,
                    child: _ChecklistSection(
                      readOnly: !_eventPackage.isCustomizable,
                      icon: Icons.restaurant_outlined,
                      title: _eventPackage.isCustomizable
                          ? 'Food choices'
                          : 'Food',
                      items: _eventPackage.foodInclusions,
                      selectedItems: selectedFoods,
                      onChanged: (item, value) {
                        _toggleStringItem(
                          item: item,
                          selectedList: selectedFoods,
                          value: value,
                        );
                      },
                    ),
                  ),

                  if (_eventPackage.foodInclusions.isNotEmpty &&
                      preparationInclusions(
                        _eventPackage,
                        'decorInclusions',
                        selectedServiceTier,
                      ).isNotEmpty)
                    const SizedBox(height: AppSpacing.md),

                  IgnorePointer(
                    ignoring: !_eventPackage.isCustomizable,
                    child: _ChecklistSection(
                      readOnly: !_eventPackage.isCustomizable,
                      icon: Icons.auto_awesome_outlined,
                      title: 'Decoration options',
                      items: preparationInclusions(
                        _eventPackage,
                        'decorInclusions',
                        selectedServiceTier,
                      ),
                      selectedItems: selectedDecorations,
                      onChanged: (item, value) {
                        _toggleStringItem(
                          item: item,
                          selectedList: selectedDecorations,
                          value: value,
                        );
                      },
                    ),
                  ),

                  if (preparationInclusions(
                        _eventPackage,
                        'decorInclusions',
                        selectedServiceTier,
                      ).isNotEmpty &&
                      preparationInclusions(
                        _eventPackage,
                        'furnitureInclusions',
                        selectedServiceTier,
                      ).isNotEmpty)
                    const SizedBox(height: AppSpacing.md),

                  IgnorePointer(
                    ignoring: !_eventPackage.isCustomizable,
                    child: _ChecklistSection(
                      readOnly: !_eventPackage.isCustomizable,
                      icon: Icons.chair_outlined,
                      title: 'Tables & chairs',
                      items: preparationInclusions(
                        _eventPackage,
                        'furnitureInclusions',
                        selectedServiceTier,
                      ),
                      selectedItems: selectedFurniture,
                      onChanged: (item, value) {
                        _toggleStringItem(
                          item: item,
                          selectedList: selectedFurniture,
                          value: value,
                        );
                      },
                    ),
                  ),

                  const SizedBox(height: AppSpacing.xl),
                ],
                if (_step == 1 && selectedAddOns.isNotEmpty) ...[
                  const _SectionHeading(
                    title: 'Selected event services',
                    subtitle:
                        'Services saved with this booking. Remove any you no longer need.',
                  ),
                  for (final addon in selectedAddOns)
                    ListTile(
                      title: Text(addon['name']?.toString() ?? 'Event service'),
                      subtitle: Text(
                        addon['providerBusinessName']?.toString() ?? '',
                      ),
                      trailing: TextButton(
                        onPressed: () => _toggleEventService(
                          addon['addonId'] as String,
                          null,
                          false,
                        ),
                        child: const Text('Remove'),
                      ),
                    ),
                ],
                const SizedBox(height: 16),
                BookingPreparationPrice(
                  package: _eventPackage,
                  addons: selectedAddOns,
                  serviceTier: selectedServiceTier,
                  guests: guestCount,
                  hasUnconfirmedRequests:
                      willArrangeOwnAddOns ||
                      specialRequestController.text.trim().isNotEmpty,
                ),
              ],
            ),
      bottomNavigationBar: MediaQuery.viewInsetsOf(context).bottom > 0
          ? null
          : _CustomizationBottomBar(
              package: _eventPackage,
              addons: selectedAddOns,
              serviceTier: selectedServiceTier,
              guests: guestCount,
              compactEstimate: _step == 1,
              onBack: _step > 0 ? () => _goToStep(_step - 1) : null,
              continueLabel: _step == 0 ? 'Continue' : 'Review booking',
              onContinue:
                  (!_draftReady ||
                      _draftBlocked ||
                      FirebaseAuth.instance.currentUser?.uid != _draftOwner ||
                      _checking)
                  ? null
                  : () {
                      if (_step == 0) {
                        final error = _stepValidation();
                        if (error != null) {
                          _showMessage(error);
                          return;
                        }
                        _goToStep(_step + 1);
                      } else {
                        _continueToReview();
                      }
                    },
            ),
    );
  }
}

class _BookingReviewLoadingSkeleton extends StatelessWidget {
  const _BookingReviewLoadingSkeleton();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      label: 'Preparing your booking review',
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: FeastaSkeletonPulse(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Preparing your booking review...',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(height: 20),
              const FeastaSkeletonBox(height: 20, width: 230),
              const SizedBox(height: 12),
              const FeastaSkeletonBox(height: 14),
              const SizedBox(height: 8),
              const FeastaSkeletonBox(height: 14, width: 260),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    FeastaSkeletonBox(height: 20, width: 175),
                    SizedBox(height: 24),
                    FeastaSkeletonBox(height: 14),
                    SizedBox(height: 14),
                    FeastaSkeletonBox(height: 14),
                    SizedBox(height: 14),
                    FeastaSkeletonBox(height: 14),
                    SizedBox(height: 14),
                    FeastaSkeletonBox(height: 14),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    FeastaSkeletonBox(height: 20, width: 150),
                    SizedBox(height: 20),
                    FeastaSkeletonBox(height: 14),
                    SizedBox(height: 14),
                    FeastaSkeletonBox(height: 14),
                  ],
                ),
              ),
            ],
          ),
        ),
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
    this.compact = false,
  });

  final ProviderModel provider;
  final PackageModel eventPackage;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: EdgeInsets.all(compact ? AppSpacing.sm : AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (!compact)
            ClipRRect(
              borderRadius: BorderRadius.circular(AppRadius.large),
              child: SizedBox(
                width: 56,
                height: 56,
                child: FeastaImage.network(
                  imageUrl: eventPackage.imageUrl,
                  description: '${eventPackage.name} package image',
                  fallbackLabel: 'Package image unavailable',
                  compactFallback: true,
                  width: 56,
                  height: 56,
                  borderRadius: 0,
                ),
              ),
            ),
          if (!compact) const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Selected Package', style: AppTypography.caption),
                Text(
                  eventPackage.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.cardTitle.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text(
                  'Published price (before tier choice): ${knownPreparationPrice(eventPackage.price) ? FeastaPriceFormatter.format(eventPackage.price) : 'Unavailable'}',
                  style: AppTypography.bodySmall,
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
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CompactRecoveredDraftNotice extends StatefulWidget {
  const _CompactRecoveredDraftNotice({required this.message, super.key});

  final String message;

  @override
  State<_CompactRecoveredDraftNotice> createState() =>
      _CompactRecoveredDraftNoticeState();
}

class _CompactRecoveredDraftNoticeState
    extends State<_CompactRecoveredDraftNotice> {
  bool _expanded = false;
  bool _dismissed = false;

  @override
  Widget build(BuildContext context) {
    if (_dismissed) {
      return const SizedBox.shrink();
    }

    return Semantics(
      liveRegion: true,
      child: Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: BoxDecoration(
          color: AppColors.primarySubtle,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.restore_outlined,
                  size: 18,
                  color: AppColors.primary,
                ),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Draft recovered',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                IconButton(
                  tooltip: _expanded
                      ? 'Hide recovery details'
                      : 'Show recovery details',
                  onPressed: () {
                    setState(() {
                      _expanded = !_expanded;
                    });
                  },
                  icon: Icon(
                    _expanded ? Icons.expand_less : Icons.expand_more,
                    size: 20,
                  ),
                  visualDensity: VisualDensity.compact,
                  constraints: const BoxConstraints(
                    minWidth: 36,
                    minHeight: 36,
                  ),
                  padding: EdgeInsets.zero,
                ),
                IconButton(
                  tooltip: 'Dismiss recovery notice',
                  onPressed: () {
                    setState(() {
                      _dismissed = true;
                    });
                  },
                  icon: const Icon(Icons.close, size: 18),
                  visualDensity: VisualDensity.compact,
                  constraints: const BoxConstraints(
                    minWidth: 36,
                    minHeight: 36,
                  ),
                  padding: EdgeInsets.zero,
                ),
              ],
            ),
            if (_expanded)
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
                child: Text(
                  widget.message,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    height: 1.35,
                  ),
                ),
              ),
          ],
        ),
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
    required this.controller,
    required this.onCountChanged,
    required this.minimumGuests,
    required this.maximumGuests,
    required this.onDecrease,
    required this.onIncrease,
  });

  final TextEditingController controller;
  final ValueChanged<String> onCountChanged;
  final int guestCount;
  final int minimumGuests;
  final int maximumGuests;
  final VoidCallback onDecrease;
  final VoidCallback onIncrease;

  @override
  Widget build(BuildContext context) {
    final canDecrease = guestCount > minimumGuests;
    final canIncrease = maximumGuests <= 0 || guestCount < maximumGuests;

    final rawGuests = controller.text.trim();
    final parsedGuests = int.tryParse(rawGuests);

    String? guestError;

    if (rawGuests.isEmpty) {
      guestError = 'Enter the number of guests.';
    } else if (parsedGuests == null ||
        parsedGuests < 1 ||
        parsedGuests > 10000) {
      guestError = 'Enter a valid whole number of guests.';
    } else if (parsedGuests < minimumGuests) {
      guestError = 'This package starts at $minimumGuests guests.';
    } else if (maximumGuests > 0 && parsedGuests > maximumGuests) {
      guestError = 'This package supports up to $maximumGuests guests.';
    }

    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _FieldLabel(
            icon: Icons.groups_outlined,
            text: 'Number of guests',
          ),
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
                    SizedBox(
                      width: 110,
                      child: TextField(
                        controller: controller,
                        textAlign: TextAlign.center,
                        keyboardType: TextInputType.number,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                        ],
                        onChanged: onCountChanged,
                        decoration: InputDecoration(
                          labelText: 'Guests',
                          errorText: guestError,
                        ),
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
                maximumGuests > 0
                    ? '$minimumGuests–$maximumGuests guests allowed'
                    : '$minimumGuests or more guests allowed',
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
    this.readOnly = false,
  });

  final IconData icon;
  final String title;
  final List<String> items;
  final List<String> selectedItems;
  final void Function(String item, bool value) onChanged;
  final bool readOnly;

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
              readOnly: readOnly,
              label: items[index],
              selected: selectedItems.contains(items[index]),
              onChanged: (value) {
                onChanged(items[index], value);
              },
            ),
            if (index != items.length - 1)
              const Divider(height: AppSpacing.sm, color: AppColors.border),
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
    this.readOnly = false,
  });

  final String label;
  final bool selected;
  final ValueChanged<bool> onChanged;
  final bool readOnly;

  @override
  Widget build(BuildContext context) {
    if (readOnly) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              Icons.check_circle_outline,
              color: AppColors.primaryStrong,
              size: 20,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                label,
                style: AppTypography.body.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      );
    }
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

class _CustomizationBottomBar extends StatelessWidget {
  const _CustomizationBottomBar({
    required this.package,
    required this.addons,
    this.serviceTier,
    this.guests,
    required this.onContinue,
    required this.continueLabel,
    this.onBack,
    this.compactEstimate = false,
  });

  final PackageModel package;
  final List<Map<String, dynamic>> addons;
  final String? serviceTier;
  final int? guests;
  final String continueLabel;
  final VoidCallback? onBack;
  final VoidCallback? onContinue;
  final bool compactEstimate;

  String _footerEstimate() {
    if (preparationServices(package).isNotEmpty &&
        !preparationServices(package).containsKey(serviceTier)) {
      return 'Choose a service';
    }
    final total = preparationEstimate(
      package,
      addons,
      serviceTier: serviceTier,
      guests: guests,
    );
    return total == null ? 'Unavailable' : FeastaPriceFormatter.format(total);
  }

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
                Expanded(
                  child: Text(
                    'Known estimate',
                    style: AppTypography.bodySmall.copyWith(
                      color: AppColors.secondaryTextAccessible,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    _footerEstimate(),
                    style: AppTypography.bodySmall,
                    textAlign: TextAlign.end,
                  ),
                ),
              ],
            ),
            if (!compactEstimate) ...[
              const SizedBox(height: AppSpacing.sm),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Estimated total',
                      style: AppTypography.bodySmall,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      _footerEstimate(),
                      style: AppTypography.bodySmall,
                      textAlign: TextAlign.end,
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: onBack,
                    child: const Text('Back'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FeastaPrimaryButton(
                    label: continueLabel,
                    onPressed: onContinue,
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
