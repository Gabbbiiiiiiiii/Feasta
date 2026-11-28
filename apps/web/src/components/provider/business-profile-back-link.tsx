import {ArrowLeft} from "lucide-react";
import Link from "next/link";

import {Button} from "@/components/ui/button";

export function BusinessProfileBackLink() {
  return (
    <Button asChild variant="ghost" size="compact" className="justify-self-start">
      <Link href="/provider/business-profile" aria-label="Back to Business Profile">
        <ArrowLeft aria-hidden="true" className="size-5" />
        Back to Business Profile
      </Link>
    </Button>
  );
}
