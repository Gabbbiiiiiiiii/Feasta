// Inactive codecs only: no Firebase imports, listeners, storage, or writes.
import {
  decodeDocument, identity, invalid,
  type PlanningDocument, type PlanningEntry, type RecordValue,
} from '../../../../../../functions/src/customer-event-lists/contract';
import type {CustomerEventListItem, CustomerEventListSchedule} from './customer-event-list';
export {decodeDocument, decodeJson, encodeDocument, advance, initializeMigration} from '../../../../../../functions/src/customer-event-lists/contract';

/** Web-specific fields remain explicit; Mobile theme/add-on fields are never discarded. */
export function fromWebItem(item: CustomerEventListItem): PlanningEntry {
  const custom = item.type === 'custom_menu';
  const allowed = custom
    ? ['type','key','providerId','providerName','menuItemId','menuItemName','servingOptionId','servingOptionName','servingDescription','servingMinimumGuests','servingMaximumGuests','price','imageUrl','providerHref']
    : ['type','packageId','providerId','packageName','providerName','price','imageUrl','packageHref','configuration'];
  if (Object.keys(item).some(k => !allowed.includes(k))) invalid();
  const entry = {
    kind: custom ? 'custom_menu' : 'catering_package',
    providerId: item.providerId, selectionId: custom ? item.menuItemId : item.packageId,
    variantId: custom ? item.servingOptionId : null,
    providerName: item.providerName, name: custom ? item.menuItemName : item.packageName,
    estimatedPrice: item.price, imageUrl: item.imageUrl || null,
    expectedRevision: custom ? null : item.configuration?.expectedPackageRevision ?? null,
    configuration: custom ? null : item.configuration ?? null,
    href: custom ? item.providerHref : item.packageHref,
    menu: custom ? {
      key: item.key, servingOptionName: item.servingOptionName, servingDescription: item.servingDescription,
      servingMinimumGuests: item.servingMinimumGuests, servingMaximumGuests: item.servingMaximumGuests,
    } : null,
  } as Omit<PlanningEntry,'identity'>;
  const canonical = {...entry,identity: identity(entry as PlanningEntry)} as PlanningEntry;
  return decodeDocument({version:1,ownerUid:'adapter',revision:0,currency:'PHP',entries:[canonical],schedule:null,migration:{version:1,completed:true}},'adapter').entries[0];
}
export function fromWebList(uid: string, items: readonly CustomerEventListItem[], schedule: CustomerEventListSchedule | null): PlanningDocument {
  return decodeDocument({version:1,ownerUid:uid,revision:0,currency:'PHP',entries:items.map(fromWebItem),schedule,migration:{version:1,completed:true}},uid);
}
export type WebProjection = {status:'supported'; item: CustomerEventListItem} | {status:'read_only'; reason:string; preserved:PlanningEntry};
/** Projection never authorizes booking. Foreign-only fields require a future UI.
 * Callers must keep the original canonical entry, including for read-only cards.
 */
export function toWebItem(entry: PlanningEntry): WebProjection {
  const uid = 'projection';
  const valid = decodeDocument({version:1,ownerUid:uid,revision:0,currency:'PHP',entries:[entry],schedule:null,migration:{version:1,completed:true}},uid).entries[0];
  const c = valid.configuration;
  if (valid.kind === 'marketplace_service' || !valid.href ||
      (valid.kind === 'custom_menu' && valid.expectedRevision !== null) ||
      (valid.kind === 'catering_package' && valid.expectedRevision !== (c?.expectedPackageRevision ?? null)) ||
      (c && ['themeChoice','customTheme','selectedAddOns','specialRequest'].some(k => Object.hasOwn(c,k)))) {
    return {status:'read_only',reason:'This saved selection requires a compatible editor.',preserved:valid};
  }
  if (valid.kind === 'custom_menu') {
    const menu = valid.menu as RecordValue;
    if (typeof valid.estimatedPrice !== 'number') invalid();
    return {status:'supported',item:{
      type:'custom_menu',key:menu.key,providerId:valid.providerId,providerName:valid.providerName,
      menuItemId:valid.selectionId,menuItemName:valid.name,servingOptionId:valid.variantId,
      servingOptionName:menu.servingOptionName,servingDescription:menu.servingDescription,
      servingMinimumGuests:menu.servingMinimumGuests,servingMaximumGuests:menu.servingMaximumGuests,
      price:valid.estimatedPrice,imageUrl:valid.imageUrl ?? '',providerHref:valid.href,
    } as CustomerEventListItem};
  }
  if (c && !Array.isArray(c.selectedEventServices)) return {status:'read_only',reason:'Missing Web service representation.',preserved:valid};
  return {status:'supported',item:{type:'package',packageId:valid.selectionId,providerId:valid.providerId,
    packageName:valid.name,providerName:valid.providerName,price:valid.estimatedPrice,imageUrl:valid.imageUrl,
    packageHref:valid.href,configuration:c,
  } as CustomerEventListItem};
}
