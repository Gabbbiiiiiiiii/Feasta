import {redirect} from "next/navigation";

import {PUBLIC_PROVIDER_MARKETPLACE_PATH} from "@/lib/customer/providers/provider-route-policy";

export default function CustomerPage(): never {
  redirect(PUBLIC_PROVIDER_MARKETPLACE_PATH);
}
