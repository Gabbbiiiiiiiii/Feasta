import {beforeEach, describe, expect, it, vi} from "vitest";
import {Timestamp} from "firebase-admin/firestore";
import type {ReportFilters} from "@/lib/admin/reports/dedicated-report-types";

const mocks = vi.hoisted(() => ({authorize: vi.fn(), data: {} as Record<string, {id:string; data:Record<string,unknown>}[]>}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({requireAdmin:mocks.authorize}));
vi.mock("@/lib/service-categories/service-category-service", () => ({getServiceCategoryOptions:async () => [{code:"catering_service",name:"Catering Service",status:"active"}]}));
vi.mock("@/lib/firebase/admin", () => {
  class Query {
    filters: [string,string,unknown][] = [];
    maximum = 5001;
    constructor(public name: string) {}
    where(field: string, operator: string, value: unknown) {this.filters.push([field,operator,value]); return this;}
    select() {return this;}
    limit(value: number) {this.maximum=value; return this;}
    doc(id: string) {return {get: async () => ({data: () => mocks.data[this.name]?.find((row) => row.id===id)?.data})};}
    async get() {
      const scalar = (value: unknown): string | number => value && typeof value === "object" && "toMillis" in value ? (value as {toMillis:()=>number}).toMillis() : value as string;
      const rows = (mocks.data[this.name] || []).filter((row) => this.filters.every(([field,operator,value]) => {
        const actual = scalar(row.data[field]);
        return operator==="==" ? actual===value : operator==="in" ? (value as unknown[]).includes(actual) : operator===">=" ? actual>=scalar(value) : operator==="<=" ? actual<=scalar(value) : actual<scalar(value);
      })).slice(0,this.maximum);
      return {size:rows.length,docs:rows.map((row) => ({id:row.id,data:()=>row.data}))};
    }
  }
  return {adminDb:{collection:(name:string) => new Query(name)}};
});
import {loadDedicatedReport} from "@/app/admin/reports/dedicated-actions";
const filters: ReportFilters = {type:"sales",startDate:"2026-11-01",endDate:"2026-11-30",category:"all",municipality:"all",rating:"all",complaintStatus:"all",directory:"providers",status:"all"};
function entry(id:string, type:string, amount:number, commission:number, createdAt="2026-11-05T00:00:00Z") {
  return {id,data:{schemaVersion:1,ledgerEntryId:id,entryType:type,paymentId:"payment-private",providerRequestId:"request-private",mainEventId:"event-private",providerId:"provider-private",currency:"PHP",createdAt:Timestamp.fromDate(new Date(createdAt)),
    grossAmountInCentavos:type==="payment_settled"?amount:0,refundAmountInCentavos:type==="refund_completed"?amount:0,commissionAccruedInCentavos:type==="payment_settled"?commission:0,commissionReversedInCentavos:type==="refund_completed"?commission:0,providerVatInCentavos:0,platformVatInCentavos:0,withholdingInCentavos:0,providerVatReversedInCentavos:0,platformVatReversedInCentavos:0,withholdingReversedInCentavos:0}};
}
beforeEach(() => {
  mocks.authorize.mockReset().mockResolvedValue({uid:"admin-private"});
  mocks.data = {
    users:[{id:"admin-private",data:{firstName:"Test",lastName:"Administrator"}},{id:"owner-private",data:{firstName:"Owner",lastName:"Name",role:"provider",isActive:true}}],
    providers:[{id:"provider-private",data:{ownerId:"owner-private",businessName:"Test Catering",serviceCategories:["catering_service"],city:"Ormoc City",isActive:true,verificationStatus:"approved",reviewCount:4,ratingAverage:2.5}}],
    financialLedgerEntries:[entry("settled-private","payment_settled",100000,10000),entry("refund-private","refund_completed",20000,2000)],
    providerRequests:[{id:"request-private",data:{providerId:"provider-private",status:"completed",completedAt:Timestamp.fromDate(new Date("2026-11-10T00:00:00Z"))}}],
    mainEvents:[{id:"event-private",data:{eventType:"wedding",city:"Ormoc City",eventDate:"2026-11-20",status:"completed"}},{id:"draft-private",data:{eventType:"birthday",city:"Ormoc City",eventDate:"2026-11-20",status:"draft"}}],
    complaints:[{id:"complaint-private",data:{providerId:"provider-private",status:"submitted"}},{id:"closed-private",data:{providerId:"provider-private",status:"closed"}}],
  };
});
describe("dedicated report server results", () => {
  it("uses settled gross and net ledger commission without recalculating tax", async () => {
    const result = await loadDedicatedReport(filters);
    expect(result.rows).toEqual([[1,"Test Catering","Catering Service",1,"1,000.00","80.00"]]);
    expect(result.generatedBy).toBe("Test Administrator");
    expect(result.summary?.join(" ")).toContain("PHP 80.00");
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("groups event-date demand and uses lifetime net receipts for the cohort", async () => {
    mocks.data.financialLedgerEntries.push(entry("earlier-private","payment_settled",50000,5000,"2026-10-01T00:00:00Z"));
    const result = await loadDedicatedReport({...filters,type:"demand"});
    expect(result.rows).toEqual([["Wedding","Ormoc City",1,"100.00","1,300.00"]]);
  });
  it("filters complaints by status without counting closed reports or unrated vendors", async () => {
    const result = await loadDedicatedReport({...filters,type:"quality",complaintStatus:"submitted",rating:"below_3"});
    expect(result.rows).toEqual([["Test Catering","Catering Service","2.50",4,1,"Active"]]);
  });
  it("preserves suspended vendor status in the directory", async () => {
    mocks.data.providers[0].data.isSuspended=true;
    const result = await loadDedicatedReport({...filters,type:"directory",status:"Suspended"});
    expect(result.rows[0][5]).toBe("Suspended");
  });
  it("refuses malformed financial evidence instead of returning partial totals", async () => {
    delete mocks.data.financialLedgerEntries[0].data.currency;
    await expect(loadDedicatedReport(filters)).rejects.toThrow("reconciliation");
  });
  it("requires administrator authorization", async () => {
    mocks.authorize.mockRejectedValue(new Error("Forbidden"));
    await expect(loadDedicatedReport(filters)).rejects.toThrow("Forbidden");
  });
  it("rejects impossible dates and unsupported locations", async () => {
    await expect(loadDedicatedReport({...filters,startDate:"2026-02-30"})).rejects.toThrow("valid report dates");
    await expect(loadDedicatedReport({...filters,municipality:"Baybay City"})).rejects.toThrow("Invalid report filters");
  });
});

it("shows customer contact details and distinct submitted-booking counts", async () => {
  mocks.data.users.push({id:"customer-private",data:{firstName:"Customer",lastName:"Name",role:"customer",isActive:true,email:"customer@example.test",phoneNumber:"09123456789",city:"Stale city",createdAt:"2026-10-01T00:00:00Z"}});
  mocks.data.customers = [{id:"customer-private",data:{city:" Ormoc City "}}];
  mocks.data.mainEvents[0].data.customerId="customer-private";
  mocks.data.mainEvents[1].data.customerId="customer-private";
  const result=await loadDedicatedReport({...filters,type:"directory",directory:"customers",status:"Active",municipality:"Ormoc City"});
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0].slice(0,4)).toEqual(["Customer Name","customer@example.test / 09123456789","Ormoc City",1]);
  expect(JSON.stringify(result)).not.toContain("private");
});

it("shows missing or invalid profile cities only in the unfiltered customer directory", async () => {
  mocks.data.users.push(...["missing", "blank", "invalid"].map((id) => ({
    id, data: {firstName:id, role:"customer", city:"Ormoc City"},
  })));
  mocks.data.customers = [{id:"blank",data:{city:"  "}}, {id:"invalid",data:{city:42}}];
  const directory = {...filters,type:"directory",directory:"customers"} as const;
  const all = await loadDedicatedReport(directory);
  expect(all.rows.map((row) => row[2])).toEqual(["Unavailable","Unavailable","Unavailable"]);
  const filtered = await loadDedicatedReport({...directory,municipality:"Ormoc City"});
  expect(filtered.rows).toEqual([]);
});
