import {Search} from "lucide-react";

import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

export function MarketplaceSearch() {
  return (
    <form action="/customer/providers" method="get" role="search" className="grid gap-3 rounded-card bg-card p-3 shadow-floating sm:grid-cols-[1fr_auto]">
      <Input type="search" name="q" aria-label="Search the provider marketplace" placeholder="What service or provider do you need?" minLength={2} maxLength={80} className="border-transparent bg-background" />
      <Button type="submit" className="w-full sm:w-auto">
        <Search aria-hidden="true" className="size-5" />
        Find providers
      </Button>
    </form>
  );
}
