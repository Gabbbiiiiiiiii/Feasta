import {expect, it, vi} from "vitest";
import {listProviderPackages} from "@/lib/provider/provider-package-client";
import {parsePackageDishes} from "@/lib/provider/package-food-inclusions";

const mocks = vi.hoisted(() => ({call: vi.fn(), getDocs: vi.fn(), where: vi.fn()}));
vi.mock("@/lib/firebase/client", () => ({auth: {authStateReady: async () => {}, currentUser: {uid: "owner"}}, db: {}, functions: {}}));
vi.mock("@/lib/provider/provider-package-v2-client", () => ({packageV2Enabled: false, packageV2PublicationEnabled: false}));
vi.mock("firebase/functions", () => ({httpsCallable: (_: unknown, name: string) => (input: unknown) => mocks.call(name, input)}));
vi.mock("firebase/firestore", () => ({collection: vi.fn(), query: vi.fn(), orderBy: vi.fn(), where: mocks.where, getDocs: mocks.getDocs}));


it('reads customizable V2 private drafts without demo flags and blocks publication',async()=>{
 const groups=[{id:'main',title:'Choose exactly 2',selectionCount:2,options:[{id:'a',name:'Adobo'},{id:'b',name:'Buttered chicken'},{id:'c',name:'Menudo'},{id:'d',name:'Shanghai'}]}];
 mocks.getDocs.mockResolvedValue({docs:[{id:'custom',data:()=>({
 providerId:'provider',name:'Customizable catering',description:'Complete family catering.',offerStructure:'customizable',packageStyle:'Buffet Catering',
 sharedContractVersion:2,occasionSchemaVersion:2,offerSchemaVersion:2,revision:1,occasionScope:'specific',occasionIds:['birthday'],occasionMatchIds:['birthday'],occasionCatalogRevision:1,providerEligibilityRevision:1,occasionEligibilityState:'eligible',
 eventType:'birthday',serviceCategoryCode:'catering_service',price:3500,pricingModel:'per_bundle',minimumGuests:10,maximumGuests:15,
 serviceOptions:{drop_off:{price:3500,includedServices:[]}},themeOptions:[],imageUrl:'',imageUrls:[],foodInclusions:['Rice: Steamed Rice'],foodChoiceGroups:groups,
 decorInclusions:[],furnitureInclusions:[],serviceInclusions:[],equipmentInclusions:[],paymentPolicy:'full_payment',depositPercentage:100,downPaymentPercentage:100,balanceDueDaysBeforeEvent:null,
 status:'draft',isActive:false,isPublished:false,providerPubliclyVisible:false,publishedAt:null
 })}]});
 const [saved]=await listProviderPackages('provider');
 expect(saved).toMatchObject({price:3500,pricingModel:'per_bundle',minimumGuests:10,maximumGuests:15,foodInclusions:['Rice: Steamed Rice'],v2:{revision:1,foodChoiceGroups:groups}});
 expect(parsePackageDishes(saved.foodInclusions)).toMatchObject([{category:'Rice',name:'Steamed Rice',raw:'Rice: Steamed Rice'}]);
 expect(saved.v2?.publicationReady).toBe(false);
 const snapshot = await mocks.getDocs.mock.results.at(-1)!.value;
 const raw = snapshot.docs[0].data();
 const complete = {...raw, paymentTermsSchemaVersion:2, balanceDueHoursBeforeEvent:null};
 mocks.getDocs.mockResolvedValue({docs:[{id:'custom',data:()=>complete}]});
 expect((await listProviderPackages('provider'))[0].v2?.publicationReady).toBe(true);
 mocks.getDocs.mockResolvedValue({docs:[{id:'custom',data:()=>({...complete,foodInclusions:[]})}]});
 expect((await listProviderPackages('provider'))[0].v2?.publicationReady).toBe(false);
 const {publishProviderPackage}=await import('@/lib/provider/provider-package-client');
 await expect(publishProviderPackage(saved.id,saved.v2)).rejects.toThrow('FEATURE_DISABLED');
 expect(mocks.call).not.toHaveBeenCalled();
});
