import {beforeEach, expect, it, vi} from "vitest";
import {loadDishLibrary, saveDishLibrary} from "@/app/provider/packages/dish-library-actions";
const m=vi.hoisted(()=>({auth:vi.fn(),collection:vi.fn(),doc:vi.fn(),get:vi.fn(),run:vi.fn(),set:vi.fn(),revision:0}));
vi.mock("@/lib/auth/session",()=>({requireApprovedProvider:m.auth}));
vi.mock("@/lib/firebase/admin",()=>({adminDb:{collection:m.collection,runTransaction:m.run}}));
const dish={id:"11111111-1111-4111-8111-111111111111",name:"Chicken Adobo",category:"Chicken",parentGroup:"Meat Dishes"};
beforeEach(()=>{
 vi.clearAllMocks();m.revision=0;
 m.auth.mockResolvedValue({provider:{id:"provider-owner",providerServiceType:"catering",serviceCategories:["catering_service"]}});
 m.collection.mockReturnValue({doc:m.doc});m.doc.mockReturnValue({collection:m.collection,get:m.get});
 m.get.mockResolvedValue({get:(field:string)=>field==="revision"?m.revision:undefined});
 m.run.mockImplementation(async(callback:(tx:unknown)=>unknown)=>callback({get:m.get,set:m.set}));
});
it("loads only the authenticated provider library and supplies empty defaults",async()=>{
 expect(await loadDishLibrary()).toEqual({revision:0,dishes:[],categories:[]});
 expect(m.collection).toHaveBeenNthCalledWith(1,"providers");expect(m.doc).toHaveBeenNthCalledWith(1,"provider-owner");
 expect(m.collection).toHaveBeenNthCalledWith(2,"catalog");expect(m.doc).toHaveBeenNthCalledWith(2,"dishLibrary");
});
it("does not read or write when authentication is denied",async()=>{
 m.auth.mockRejectedValue(new Error("AUTHENTICATION_REQUIRED"));
 await expect(loadDishLibrary()).rejects.toThrow("AUTHENTICATION_REQUIRED");
 await expect(saveDishLibrary(0,[dish],["Chicken"])).rejects.toThrow("AUTHENTICATION_REQUIRED");
 expect(m.collection).not.toHaveBeenCalled();expect(m.run).not.toHaveBeenCalled();
});
it("rejects providers without catering access before reading their catalog",async()=>{
 m.auth.mockResolvedValue({provider:{id:"photographer",providerServiceType:"freelance",serviceCategories:["photography"]}});
 await expect(loadDishLibrary()).rejects.toThrow("catering providers");expect(m.collection).not.toHaveBeenCalled();
});
it("saves categories and dishes together with a new revision",async()=>{
 expect(await saveDishLibrary(0,[{...dish,name:" Chicken Adobo "}],[" Chicken ","chicken"])).toEqual({revision:1,dishes:[dish],categories:["chicken"]});
 expect(m.set).toHaveBeenCalledTimes(1);expect(m.set.mock.calls[0][1]).toEqual({revision:1,dishes:[dish],categories:["chicken"]});
});
it("rejects a stale revision without overwriting another edit",async()=>{
 m.revision=2;await expect(saveDishLibrary(1,[dish],["Chicken"])).rejects.toThrow("library changed");expect(m.set).not.toHaveBeenCalled();
});
it("preserves empty categories without requiring a dish",async()=>{
 expect(await saveDishLibrary(0,[],["Desserts"])).toEqual({revision:1,dishes:[],categories:["Desserts"]});
});
it("rejects duplicate dishes, invalid names, and invalid IDs before a write",async()=>{
 for(const rows of [[dish,dish],[{...dish,id:"bad"}],[{...dish,name:"Bad\nname"}],[{...dish,category:"Bad:category"}]]){
  await expect(saveDishLibrary(0,rows,["Chicken"])).rejects.toThrow();
 }
 expect(m.run).not.toHaveBeenCalled();
});
it("keeps each category in a single parent group",async()=>{
 await expect(saveDishLibrary(0,[dish,{...dish,id:"22222222-2222-4222-8222-222222222222",name:"Chicken Soup",parentGroup:"Soups"}],["Chicken"])).rejects.toThrow("one parent group");
 expect(m.run).not.toHaveBeenCalled();
});
